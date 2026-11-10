-- Row Level Security, table privileges, and the exam_status view.
--
-- Approach: deny by default. Supabase grants ALL on public tables (and EXECUTE on
-- functions) to anon/authenticated by default; we revoke that, then grant back only
-- what the frontend legitimately needs. Every mutation that has rules attached
-- (starting/submitting exams, creating exams, approving requests) goes through a
-- security definer RPC, even for admins, so the rules cannot be bypassed.

-- ---------------------------------------------------------------------------
-- 1. Lock down privileges (existing objects + objects created by future migrations).
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Trigger/utility functions are never called directly by clients.
revoke execute on function public.set_updated_at()        from public, anon, authenticated;
revoke execute on function public.handle_new_user()       from public, anon, authenticated;
revoke execute on function public.guard_profile_update()  from public, anon, authenticated;
revoke execute on function public.is_valid_options(jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS everywhere.
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.exams                enable row level security;
alter table public.exam_windows         enable row level security;
alter table public.window_allowed_users enable row level security;
alter table public.questions            enable row level security;
-- answer_keys: enabled + forced in its own migration, no grants, no policies.
alter table public.attempts             enable row level security;
alter table public.attempt_answers      enable row level security;
alter table public.reexam_requests      enable row level security;
alter table public.retake_grants        enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Grants (what the API roles may attempt; RLS then filters rows).
--    anon gets nothing at all.
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
-- Column-level: role, is_banned, banned_at, telegram_id are not updatable by any client.
-- Stream is updatable only while it is still null (enforced by guard_profile_update).
grant update (full_name, school, stream) on public.profiles to authenticated;

grant select on public.exams                to authenticated;
grant select on public.exam_windows         to authenticated;
grant select on public.window_allowed_users to authenticated;
grant select on public.questions            to authenticated;  -- policy: admins only
grant select on public.attempts             to authenticated;
grant select on public.attempt_answers      to authenticated;
grant select on public.retake_grants        to authenticated;
grant select on public.reexam_requests      to authenticated;
grant insert (exam_id, reason) on public.reexam_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Policies. Function calls are wrapped in (select ...) so Postgres evaluates
--    them once per statement instead of once per row.
-- ---------------------------------------------------------------------------

-- profiles ------------------------------------------------------------------
create policy "profiles: read own or admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- exams: students see published exams for their stream (or 'both') unless banned.
create policy "exams: admin reads all"
  on public.exams for select to authenticated
  using ((select public.is_admin()));

create policy "exams: students read published for their stream"
  on public.exams for select to authenticated
  using (
    published_at is not null
    and not (select public.is_banned_user())
    and (stream = 'both' or stream::text = (select public.current_stream())::text)
  );

-- exam_windows: visible if the exam is visible; restricted windows only to listed users.
create policy "exam_windows: admin reads all"
  on public.exam_windows for select to authenticated
  using ((select public.is_admin()));

create policy "exam_windows: students read windows of visible exams"
  on public.exam_windows for select to authenticated
  using (
    exists (select 1 from public.exams e where e.id = exam_windows.exam_id)  -- exams RLS applies
    and (
      not exam_windows.restricted
      or exists (
        select 1 from public.window_allowed_users wau
        where wau.window_id = exam_windows.id and wau.user_id = (select auth.uid())
      )
    )
  );

create policy "window_allowed_users: read own or admin"
  on public.window_allowed_users for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- questions: never selectable by students. They receive questions (without answers)
-- from start_exam, which checks ban / window / attempt server-side.
create policy "questions: admin reads all"
  on public.questions for select to authenticated
  using ((select public.is_admin()));

-- attempts / answers: own rows only.
create policy "attempts: read own or admin"
  on public.attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "attempt_answers: read own or admin"
  on public.attempt_answers for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.attempts a
      where a.id = attempt_id and a.user_id = (select auth.uid())
    )
  );

-- retake grants / re-exam requests.
create policy "retake_grants: read own or admin"
  on public.retake_grants for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "reexam_requests: read own or admin"
  on public.reexam_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "reexam_requests: students create own pending request"
  on public.reexam_requests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and not (select public.is_banned_user())
    and exists (select 1 from public.exams e where e.id = exam_id)  -- must be visible to them
  );

-- ---------------------------------------------------------------------------
-- 5. Derived exam status. security_invoker = true: the view runs with the caller's
--    RLS, so a student's status only considers windows they are allowed to use.
-- ---------------------------------------------------------------------------
create type public.exam_state as enum ('draft', 'scheduled', 'live', 'closed');

create view public.exam_status
with (security_invoker = true)
as
select
  e.id as exam_id,
  (case
     when e.published_at is null then 'draft'
     when bool_or(now() >= w.starts_at and now() < w.ends_at) then 'live'
     when bool_or(w.starts_at > now()) then 'scheduled'
     else 'closed'
   end)::public.exam_state                                              as status,
  min(w.starts_at) filter (where w.starts_at > now())                    as next_starts_at,
  max(w.ends_at)   filter (where now() >= w.starts_at and now() < w.ends_at) as live_ends_at,
  max(w.ends_at)                                                         as last_ends_at,
  now()                                                                  as server_now
from public.exams e
left join public.exam_windows w on w.exam_id = e.id
group by e.id, e.published_at;

grant select on public.exam_status to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Server clock for the client (timer offset). Harmless, so anon may call it.
-- ---------------------------------------------------------------------------
create or replace function public.server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now(); $$;

grant execute on function public.server_now() to anon, authenticated;
