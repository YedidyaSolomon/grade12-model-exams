-- Phase 5: admin control.
--   * admin_audit_log + private.audit()
--   * bans (admin_set_ban, called by the admin-ban Edge Function, which also bans the auth user)
--   * students list / detail / profile corrections
--   * windows BEFORE release: extend, add (optionally restricted). Blocked after release.
--   * re-exams AFTER release: shuffled copy restricted to approved students (reexam_students)
--   * re-exam requests (student RPC + admin review), retake grants
--   * admin results (table, per-question stats), admin overview
--
-- Rules from CLAUDE.md that this migration enforces:
--   * Once released, results are never hidden again: no window may be added, extended or
--     changed on a released exam (RPC check + trigger backstop).
--   * Scores are only returned by admin-only functions here (private.require_admin()).

-- ===========================================================================
-- 1. Schema
-- ===========================================================================
alter table public.profiles
  add column ban_reason text check (ban_reason is null or char_length(ban_reason) between 3 and 500);

-- A re-exam is a separate exam that points at the ORIGINAL exam (never at another re-exam).
alter table public.exams
  add column reexam_of uuid references public.exams (id) on delete set null;
create index exams_reexam_of_idx on public.exams (reexam_of) where reexam_of is not null;

-- Students approved for a re-exam. Nobody else can see or start a re-exam.
create table public.reexam_students (
  exam_id    uuid not null references public.exams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  request_id uuid references public.reexam_requests (id) on delete set null,
  added_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (exam_id, user_id)
);
create index reexam_students_user_idx on public.reexam_students (user_id);

alter table public.reexam_students enable row level security;
grant select on public.reexam_students to authenticated;
create policy "reexam_students: read own or admin"
  on public.reexam_students for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter table public.reexam_requests
  add column reexam_id uuid references public.exams (id) on delete set null;

alter table public.retake_grants
  add column note text check (note is null or char_length(note) <= 500);

-- Requests are created only through request_reexam() (eligibility rules live there).
drop policy "reexam_requests: students create own pending request" on public.reexam_requests;
revoke insert on public.reexam_requests from authenticated;

-- Students only see re-exams they are approved for.
drop policy "exams: students read published for their stream" on public.exams;
create policy "exams: students read published for their stream"
  on public.exams for select to authenticated
  using (
    published_at is not null
    and not (select public.is_banned_user())
    and (stream = 'both' or stream::text = (select public.current_stream())::text)
    and (reexam_of is null or exists (
          select 1 from public.reexam_students r
          where r.exam_id = exams.id and r.user_id = (select auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- Audit log: append-only, written only by security definer functions.
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id             bigint generated always as identity primary key,
  actor_id       uuid references public.profiles (id) on delete set null,
  action         text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  exam_id        uuid references public.exams (id) on delete set null,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_user_idx    on public.admin_audit_log (target_user_id, created_at desc);
create index admin_audit_log_exam_idx    on public.admin_audit_log (exam_id, created_at desc);

alter table public.admin_audit_log enable row level security;
grant select on public.admin_audit_log to authenticated;
create policy "admin_audit_log: admins read"
  on public.admin_audit_log for select to authenticated
  using ((select public.is_admin()));

create or replace function private.audit(
  p_action text, p_user_id uuid, p_exam_id uuid, p_details jsonb default '{}'::jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.admin_audit_log (actor_id, action, target_user_id, exam_id, details)
  values (auth.uid(), p_action, p_user_id, p_exam_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ===========================================================================
-- 2. Access helpers
-- ===========================================================================
-- Can this (student) user see / take this exam? Published, their stream, not banned,
-- and for a re-exam: on its approved list.
create or replace function private.can_access_exam(p_exam_id uuid, p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.exams e
    join public.profiles p on p.id = p_user_id
    where e.id = p_exam_id
      and e.published_at is not null
      and not p.is_banned
      and (e.stream = 'both' or e.stream::text = p.stream::text)
      and (e.reexam_of is null or exists (
            select 1 from public.reexam_students r where r.exam_id = e.id and r.user_id = p_user_id))
  );
$$;

create or replace function private.can_view_exam(p_exam_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_admin() or private.can_access_exam(p_exam_id, auth.uid());
$$;

-- Backstop: an attempt on a re-exam needs approval, whatever function inserts it.
create or replace function private.attempts_reexam_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.exams e where e.id = new.exam_id and e.reexam_of is not null)
     and not exists (select 1 from public.reexam_students r
                     where r.exam_id = new.exam_id and r.user_id = new.user_id) then
    raise exception 'exam_not_found' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger attempts_reexam_guard
  before insert on public.attempts
  for each row execute function private.attempts_reexam_guard();

-- ===========================================================================
-- 3. Released results stay released: no window changes after release.
-- ===========================================================================
-- Backstop for every writer (RPCs check first with a friendlier message). "Released" here
-- means: published, every window has ended, and there are submitted attempts (results
-- that students may already have seen). Deleting a whole exam is not affected.
create or replace function private.guard_window_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_exam uuid := case when tg_op = 'INSERT' then new.exam_id else old.exam_id end;
begin
  if tg_op = 'UPDATE' and new.exam_id is distinct from old.exam_id then
    raise exception 'A window cannot move to another exam' using errcode = '42501';
  end if;
  if exists (select 1 from public.exams e where e.id = v_exam and e.published_at is not null)
     and private.results_released(v_exam)
     and exists (select 1 from public.attempts a where a.exam_id = v_exam and a.submitted_at is not null) then
    raise exception 'results_released'
      using errcode = '55000',
            detail  = 'Results for this exam are released. Windows can no longer change; create a re-exam instead.';
  end if;
  return new;
end;
$$;

create trigger exam_windows_guard_release
  before insert or update on public.exam_windows
  for each row execute function private.guard_window_change();

-- Extending a window may extend the deadline of attempts that were capped by it.
-- Everything else about attempt timing stays immutable.
create or replace function public.attempts_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.exam_id     is distinct from old.exam_id
  or new.window_id   is distinct from old.window_id
  or new.user_id     is distinct from old.user_id
  or new.attempt_no  is distinct from old.attempt_no
  or new.started_at  is distinct from old.started_at then
    raise exception 'Attempt identity and timing cannot be changed' using errcode = '42501';
  end if;
  if new.deadline_at is distinct from old.deadline_at
     and not (coalesce(current_setting('app.window_extension', true), '') = 'on'
              and new.deadline_at > old.deadline_at
              and old.submitted_at is null) then
    raise exception 'Attempt identity and timing cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.admin_error(p_message text, p_code text default '55000')
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', p_message using errcode = p_code;
end;
$$;

create or replace function private.require_unreleased(p_exam_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if private.results_released(p_exam_id) then
    raise exception 'Results for this exam are already released and cannot be hidden again. Create a re-exam instead.'
      using errcode = '55000';
  end if;
end;
$$;

-- ===========================================================================
-- 4. Bans
-- ===========================================================================
-- Called by the admin-ban Edge Function with the ADMIN's JWT (so is_admin() applies);
-- the function then bans / unbans the auth user with the service role key.
-- Banning closes the student's open attempts with what was saved.
create or replace function public.admin_set_ban(p_user_id uuid, p_banned boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p      public.profiles;
  v_closed uuid[] := '{}';
  v_id     uuid;
begin
  perform private.require_admin();
  if p_user_id = auth.uid() then
    perform private.admin_error('You cannot ban yourself', '42501');
  end if;

  select * into v_p from public.profiles where id = p_user_id for update;
  if not found then
    perform private.admin_error('Student not found', 'P0002');
  end if;
  if p_banned and v_p.role = 'admin' then
    perform private.admin_error('Admins cannot be banned. Remove the admin role first.');
  end if;
  if p_banned and char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    perform private.admin_error('Give a reason (3–500 characters)', '22023');
  end if;

  update public.profiles
     set is_banned  = p_banned,
         banned_at  = case when p_banned then coalesce(banned_at, now()) end,
         ban_reason = case when p_banned then btrim(p_reason) end
   where id = p_user_id;

  if p_banned then
    for v_id in
      select id from public.attempts where user_id = p_user_id and submitted_at is null for update
    loop
      perform private.finalize_attempt(v_id, true);
      v_closed := v_closed || v_id;
    end loop;
  end if;

  perform private.audit(case when p_banned then 'ban' else 'unban' end, p_user_id, null,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''), 'closed_attempts', to_jsonb(v_closed)));

  return jsonb_build_object('user_id', p_user_id, 'is_banned', p_banned, 'closed_attempts', to_jsonb(v_closed));
end;
$$;

-- submit_exam v3: a banned student cannot submit (ban already closed their attempt).
create or replace function public.submit_exam(p_attempt_id uuid, p_answers jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a      public.attempts;
  v_late boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if public.is_banned_user() then
    raise exception 'banned' using errcode = 'P0001';
  end if;

  select * into a from public.attempts where id = p_attempt_id for update;
  if not found or a.user_id is distinct from auth.uid() then
    raise exception 'attempt_not_found' using errcode = 'P0001';
  end if;

  if a.submitted_at is not null then
    return jsonb_build_object('submitted_at', a.submitted_at, 'auto_submitted', a.auto_submitted,
                              'late', false, 'already', true);
  end if;

  v_late := now() > a.deadline_at + private.submit_grace();

  if not v_late and p_answers is not null and jsonb_array_length(p_answers) > 0 then
    perform private.upsert_answers(a, p_answers);
  end if;

  perform private.finalize_attempt(a.id, v_late);
  select * into a from public.attempts where id = p_attempt_id;
  return jsonb_build_object('submitted_at', a.submitted_at, 'auto_submitted', a.auto_submitted,
                            'late', v_late, 'already', false);
end;
$$;

-- ===========================================================================
-- 5. Students
-- ===========================================================================
create or replace function public.admin_update_profile(
  p_user_id   uuid,
  p_full_name text default null,
  p_school    text default null,
  p_stream    public.stream_type default null,
  p_role      public.user_role default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old  public.profiles;
  result public.profiles;
begin
  perform private.require_admin();
  if p_role is not null and p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own admin role' using errcode = '42501';
  end if;

  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  update public.profiles
     set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
         school    = coalesce(nullif(btrim(p_school), ''), school),
         stream    = coalesce(p_stream, stream),
         role      = coalesce(p_role, role)
   where id = p_user_id
  returning * into result;

  perform private.audit('profile_update', p_user_id, null, jsonb_strip_nulls(jsonb_build_object(
    'full_name', case when result.full_name is distinct from v_old.full_name
                      then jsonb_build_object('from', v_old.full_name, 'to', result.full_name) end,
    'school',    case when result.school is distinct from v_old.school
                      then jsonb_build_object('from', v_old.school, 'to', result.school) end,
    'stream',    case when result.stream is distinct from v_old.stream
                      then jsonb_build_object('from', v_old.stream, 'to', result.stream) end,
    'role',      case when result.role is distinct from v_old.role
                      then jsonb_build_object('from', v_old.role, 'to', result.role) end)));
  return result;
end;
$$;

-- p_status: 'active' | 'banned' | 'incomplete' | null (all)
create or replace function public.admin_list_students(
  p_search text default null,
  p_stream public.stream_type default null,
  p_status text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q    text := lower(btrim(coalesce(p_search, '')));
  result jsonb;
begin
  perform private.require_admin();

  with s as (
    select p.*, u.email
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.role = 'student'
      and (p_stream is null or p.stream = p_stream)
      and (p_status is null
           or (p_status = 'banned' and p.is_banned)
           or (p_status = 'active' and not p.is_banned and p.is_complete)
           or (p_status = 'incomplete' and not p.is_banned and not p.is_complete))
      and (v_q = ''
           or position(v_q in lower(coalesce(p.full_name, ''))) > 0
           or position(v_q in lower(coalesce(p.school, ''))) > 0
           or position(v_q in lower(coalesce(u.email, ''))) > 0
           or position(v_q in lower(coalesce(p.telegram_username, ''))) > 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from s),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'full_name', x.full_name, 'school', x.school, 'stream', x.stream,
               'is_banned', x.is_banned, 'is_complete', x.is_complete, 'created_at', x.created_at,
               'email', x.email, 'telegram_username', x.telegram_username,
               'attempt_count', (select count(*) from public.attempts a where a.user_id = x.id and a.submitted_at is not null)
             ) order by x.created_at desc, x.id)
      from (select * from s order by created_at desc, id
            limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) x
    ), '[]'::jsonb))
  into result;
  return result;
end;
$$;

create or replace function public.admin_get_student(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();

  select jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'school', p.school, 'stream', p.stream, 'role', p.role,
    'is_banned', p.is_banned, 'banned_at', p.banned_at, 'ban_reason', p.ban_reason,
    'is_complete', p.is_complete, 'created_at', p.created_at,
    'email', u.email, 'telegram_username', p.telegram_username, 'last_sign_in_at', u.last_sign_in_at,
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'exam_id', a.exam_id, 'title', e.title, 'subject', e.subject,
               'is_reexam', e.reexam_of is not null, 'attempt_no', a.attempt_no,
               'started_at', a.started_at, 'deadline_at', a.deadline_at, 'submitted_at', a.submitted_at,
               'auto_submitted', a.auto_submitted, 'score', a.score, 'max_score', a.max_score,
               'rank', lb.rank, 'total', lb.total,
               'released', private.results_released(a.exam_id),
               'can_grant_retake', e.published_at is not null and not private.results_released(a.exam_id)
                                   and a.submitted_at is not null
                                   and not exists (select 1 from public.retake_grants g
                                                   where g.exam_id = a.exam_id and g.user_id = p.id and not g.used)
                                   and not exists (select 1 from public.attempts o
                                                   where o.exam_id = a.exam_id and o.user_id = p.id
                                                     and o.attempt_no > a.attempt_no)
             ) order by a.started_at desc)
      from public.attempts a
      join public.exams e on e.id = a.exam_id
      left join private.leaderboard lb on lb.attempt_id = a.id
      where a.user_id = p.id
    ), '[]'::jsonb),
    'retake_grants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'exam_id', g.exam_id, 'title', e.title, 'used', g.used, 'used_at', g.used_at,
               'note', g.note, 'created_at', g.created_at) order by g.created_at desc)
      from public.retake_grants g join public.exams e on e.id = g.exam_id
      where g.user_id = p.id
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'exam_id', r.exam_id, 'title', e.title, 'reason', r.reason, 'status', r.status,
               'admin_note', r.admin_note, 'created_at', r.created_at, 'reviewed_at', r.reviewed_at,
               'reexam_id', r.reexam_id) order by r.created_at desc)
      from public.reexam_requests r join public.exams e on e.id = r.exam_id
      where r.user_id = p.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(x order by (x ->> 'created_at') desc) from (
        select jsonb_build_object('id', l.id, 'action', l.action, 'details', l.details,
                                  'created_at', l.created_at, 'actor', ap.full_name,
                                  'exam_title', e.title) x
        from public.admin_audit_log l
        left join public.profiles ap on ap.id = l.actor_id
        left join public.exams e on e.id = l.exam_id
        where l.target_user_id = p.id
        order by l.created_at desc limit 50) t
    ), '[]'::jsonb)
  )
  into result
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_user_id;

  if result is null then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

-- ===========================================================================
-- 6. Windows (before release only)
-- ===========================================================================
create or replace function public.admin_extend_window(p_window_id uuid, p_ends_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w        public.exam_windows;
  e        public.exams;
  v_n      integer := 0;
begin
  perform private.require_admin();

  select * into w from public.exam_windows where id = p_window_id;
  if not found then
    perform private.admin_error('Window not found', 'P0002');
  end if;
  select * into e from public.exams where id = w.exam_id for update;
  select * into w from public.exam_windows where id = p_window_id for update;

  if e.published_at is null then
    perform private.admin_error('This exam is a draft. Change its window in the exam editor.');
  end if;
  perform private.require_unreleased(e.id);
  if p_ends_at is null or p_ends_at <= w.ends_at then
    perform private.admin_error('The new closing time must be later than the current one', '22023');
  end if;
  if p_ends_at <= now() then
    perform private.admin_error('The new closing time must be in the future', '22023');
  end if;

  begin
    update public.exam_windows set ends_at = p_ends_at where id = w.id;
  exception when exclusion_violation then
    perform private.admin_error('The extended window would overlap another window of this exam', '23P01');
  end;

  -- Students whose time was cut short by the old closing time get the rest of their duration.
  perform set_config('app.window_extension', 'on', true);
  update public.attempts a
     set deadline_at = least(a.started_at + make_interval(mins => e.duration_minutes), p_ends_at)
   where a.window_id = w.id
     and a.submitted_at is null
     and a.deadline_at = w.ends_at
     and a.started_at + make_interval(mins => e.duration_minutes) > w.ends_at
     and now() <= a.deadline_at + private.submit_grace();
  get diagnostics v_n = row_count;
  perform set_config('app.window_extension', 'off', true);

  perform private.audit('window_extend', null, e.id, jsonb_build_object(
    'window_id', w.id, 'from', w.ends_at, 'to', p_ends_at, 'extended_attempts', v_n));

  return jsonb_build_object('window_id', w.id, 'ends_at', p_ends_at, 'extended_attempts', v_n);
end;
$$;

-- p_user_ids empty/null: open to everyone who can see the exam (and hasn't taken it,
-- unless they hold a retake grant). Non-empty: restricted to those students.
create or replace function public.admin_add_window(
  p_exam_id   uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_user_ids  uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e       public.exams;
  v_id    uuid;
  v_users uuid[] := coalesce(p_user_ids, '{}');
  v_bad   integer;
begin
  perform private.require_admin();

  select * into e from public.exams where id = p_exam_id for update;
  if not found then
    perform private.admin_error('Exam not found', 'P0002');
  end if;
  if e.published_at is null then
    perform private.admin_error('This exam is a draft. Set its window in the exam editor.');
  end if;
  perform private.require_unreleased(e.id);

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    perform private.admin_error('The window must close after it opens', '22023');
  end if;
  if p_ends_at <= now() then
    perform private.admin_error('The window must close in the future', '22023');
  end if;
  if p_ends_at - p_starts_at < make_interval(mins => e.duration_minutes) then
    perform private.admin_error('The window is shorter than the exam duration', '22023');
  end if;

  select count(*) into v_bad
  from unnest(v_users) u(id)
  where not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'student');
  if v_bad > 0 then
    perform private.admin_error('Some selected students were not found', '22023');
  end if;

  begin
    insert into public.exam_windows (exam_id, starts_at, ends_at, is_reopen, restricted, created_by)
    values (e.id, p_starts_at, p_ends_at, true, cardinality(v_users) > 0, auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    perform private.admin_error('This window overlaps another window of this exam', '23P01');
  end;

  insert into public.window_allowed_users (window_id, user_id)
  select v_id, u.id from (select distinct unnest(v_users) id) u;

  perform private.audit('window_add', null, e.id, jsonb_build_object(
    'window_id', v_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at,
    'restricted', cardinality(v_users) > 0, 'user_ids', to_jsonb(v_users)));
  return v_id;
end;
$$;

-- ===========================================================================
-- 7. Retake grants (before release only)
-- ===========================================================================
create or replace function public.admin_grant_retake(p_exam_id uuid, p_user_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e    public.exams;
  v_id uuid;
begin
  perform private.require_admin();
  select * into e from public.exams where id = p_exam_id for update;
  if not found or e.published_at is null then
    perform private.admin_error('Exam not found', 'P0002');
  end if;
  perform private.require_unreleased(e.id);

  if not exists (select 1 from public.profiles where id = p_user_id and role = 'student') then
    perform private.admin_error('Student not found', 'P0002');
  end if;
  if exists (select 1 from public.attempts where exam_id = e.id and user_id = p_user_id and submitted_at is null) then
    perform private.admin_error('The student is writing this exam right now');
  end if;
  if not exists (select 1 from public.attempts where exam_id = e.id and user_id = p_user_id) then
    perform private.admin_error('The student has not taken this exam yet, so no retake is needed');
  end if;

  begin
    insert into public.retake_grants (exam_id, user_id, granted_by, note)
    values (e.id, p_user_id, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    perform private.admin_error('The student already has an unused retake for this exam');
  end;

  perform private.audit('retake_grant', p_user_id, e.id,
    jsonb_build_object('grant_id', v_id, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  return v_id;
end;
$$;

create or replace function public.admin_revoke_retake(p_grant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.retake_grants;
begin
  perform private.require_admin();
  select * into g from public.retake_grants where id = p_grant_id for update;
  if not found then
    perform private.admin_error('Retake grant not found', 'P0002');
  end if;
  if g.used then
    perform private.admin_error('This retake has already been used');
  end if;
  delete from public.retake_grants where id = g.id;
  perform private.audit('retake_revoke', g.user_id, g.exam_id, jsonb_build_object('grant_id', g.id));
end;
$$;

-- ===========================================================================
-- 8. Re-exams (after release only)
-- ===========================================================================
-- Copies the ORIGINAL exam's questions in random order, each with its options in random
-- order and the answer key remapped to the option's new letter. Starts as a draft.
create or replace function private.copy_as_reexam(p_root uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  r        public.exams;
  v_id     uuid;
  v_n      integer;
  q        record;
  i        integer := 0;
  v_opts   jsonb;
  v_perm   bigint[];
  v_new    integer;
  v_qid    uuid;
begin
  select * into r from public.exams where id = p_root;
  select count(*) into v_n from public.exams where reexam_of = p_root;

  insert into public.exams (title, subject, stream, duration_minutes, published_at, source_file, created_by, reexam_of)
  values (left(r.title, 180) || ' – Re-exam ' || (v_n + 1), r.subject, r.stream, r.duration_minutes,
          null, r.source_file, auth.uid(), r.id)
  returning id into v_id;

  for q in
    select qq.*, k.correct_option
    from public.questions qq
    join public.answer_keys k on k.question_id = qq.id
    where qq.exam_id = p_root
    order by random()
  loop
    i := i + 1;
    select jsonb_agg(s.value order by s.rnd), array_agg(s.ord order by s.rnd)
      into v_opts, v_perm
      from (select o.value, o.ord, random() rnd
            from jsonb_array_elements(q.options) with ordinality o(value, ord)) s;
    -- old letter A..D = position 1..4; its new position in the shuffled list
    v_new := array_position(v_perm, (ascii(q.correct_option::text) - 64)::bigint);

    insert into public.questions (exam_id, position, body, options, image_url, points)
    values (v_id, i, q.body, v_opts, q.image_url, q.points)
    returning id into v_qid;
    insert into public.answer_keys (question_id, correct_option)
    values (v_qid, chr(64 + v_new)::public.answer_option);
  end loop;

  return v_id;
end;
$$;

create or replace function public.admin_create_reexam(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e      public.exams;
  v_root uuid;
  v_id   uuid;
begin
  perform private.require_admin();
  select * into e from public.exams where id = p_exam_id for share;
  if not found or e.published_at is null then
    perform private.admin_error('Exam not found', 'P0002');
  end if;
  if not private.results_released(e.id) then
    perform private.admin_error('Re-exams can be created after results are released. Before that, extend the window or add a new one.');
  end if;
  v_root := coalesce(e.reexam_of, e.id);
  v_id := private.copy_as_reexam(v_root);
  perform private.audit('reexam_create', null, v_id, jsonb_build_object('original_exam_id', v_root, 'from_exam_id', e.id));
  return v_id;
end;
$$;

create or replace function public.admin_add_reexam_students(p_reexam_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e   public.exams;
  v_n integer;
begin
  perform private.require_admin();
  select * into e from public.exams where id = p_reexam_id for update;
  if not found or e.reexam_of is null then
    perform private.admin_error('Re-exam not found', 'P0002');
  end if;
  perform private.require_unreleased(e.id);
  if exists (select 1 from unnest(coalesce(p_user_ids, '{}')) u(id)
             where not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'student')) then
    perform private.admin_error('Some selected students were not found', '22023');
  end if;

  insert into public.reexam_students (exam_id, user_id, added_by)
  select e.id, u.id, auth.uid() from (select distinct unnest(coalesce(p_user_ids, '{}')) id) u
  on conflict do nothing;
  get diagnostics v_n = row_count;

  perform private.audit('reexam_add_students', null, e.id, jsonb_build_object('user_ids', to_jsonb(p_user_ids)));
  return v_n;
end;
$$;

create or replace function public.admin_remove_reexam_student(p_reexam_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if exists (select 1 from public.attempts where exam_id = p_reexam_id and user_id = p_user_id) then
    perform private.admin_error('This student has already started the re-exam');
  end if;
  delete from public.reexam_students where exam_id = p_reexam_id and user_id = p_user_id;
  if not found then
    perform private.admin_error('Student is not on this re-exam', 'P0002');
  end if;
  perform private.audit('reexam_remove_student', p_user_id, p_reexam_id, '{}'::jsonb);
end;
$$;

-- ===========================================================================
-- 9. Re-exam requests
-- ===========================================================================
-- Null when the student may request a re-exam for this exam, else the reason code.
-- Eligible: the exam is visible to them (for a re-exam: they were approved for it), its
-- results are released (closed), they never started it, and no pending/approved request.
create or replace function private.reexam_block_reason(p_exam_id uuid, p_user_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when not private.can_access_exam(p_exam_id, p_user_id) then 'exam_not_found'
    when not private.results_released(p_exam_id) then 'not_closed'
    when exists (select 1 from public.attempts a where a.exam_id = p_exam_id and a.user_id = p_user_id) then 'already_taken'
    when exists (select 1 from public.reexam_requests r
                 where r.exam_id = p_exam_id and r.user_id = p_user_id and r.status = 'pending') then 'request_pending'
    when exists (select 1 from public.reexam_requests r
                 where r.exam_id = p_exam_id and r.user_id = p_user_id and r.status = 'approved') then 'request_approved'
  end;
$$;

create or replace function public.request_reexam(p_exam_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_block   text;
  v_id      uuid;
begin
  v_profile := private.require_active_student();
  v_block := private.reexam_block_reason(p_exam_id, v_profile.id);
  if v_block is not null then
    raise exception '%', v_block using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 1000 then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  begin
    insert into public.reexam_requests (exam_id, user_id, reason)
    values (p_exam_id, v_profile.id, btrim(p_reason))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'request_pending' using errcode = 'P0001';
  end;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$$;

create or replace function public.admin_list_reexam_requests(p_status public.reexam_status default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'exam_id', r.exam_id, 'exam_title', e.title, 'exam_subject', e.subject,
             'user_id', r.user_id, 'full_name', p.full_name, 'school', p.school, 'stream', p.stream,
             'is_banned', p.is_banned,
             'reason', r.reason, 'status', r.status, 'admin_note', r.admin_note,
             'created_at', r.created_at, 'reviewed_at', r.reviewed_at, 'reviewer', rv.full_name,
             'reexam_id', r.reexam_id, 'reexam_title', re.title
           ) order by (r.status = 'pending') desc, r.created_at desc)
    from public.reexam_requests r
    join public.exams e on e.id = r.exam_id
    join public.profiles p on p.id = r.user_id
    left join public.profiles rv on rv.id = r.reviewed_by
    left join public.exams re on re.id = r.reexam_id
    where p_status is null or r.status = p_status
  ), '[]'::jsonb);
end;
$$;

-- Approve: add the student to the newest re-exam of the original exam that is not yet
-- released (a draft or a scheduled/live one), creating a re-exam if there is none.
create or replace function public.admin_review_reexam_request(
  p_request_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        public.reexam_requests;
  v_root   uuid;
  v_target uuid;
  v_new    boolean := false;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_admin();
  select * into r from public.reexam_requests where id = p_request_id for update;
  if not found then
    perform private.admin_error('Request not found', 'P0002');
  end if;
  if r.status <> 'pending' then
    perform private.admin_error('This request has already been reviewed');
  end if;

  if p_approve then
    select coalesce(reexam_of, id) into v_root from public.exams where id = r.exam_id;
    perform 1 from public.exams where id = v_root for update;  -- serialise re-exam creation

    select e.id into v_target
    from public.exams e
    where e.reexam_of = v_root and not private.results_released(e.id)
    order by e.created_at desc
    limit 1;
    if v_target is null then
      v_target := private.copy_as_reexam(v_root);
      v_new := true;
      perform private.audit('reexam_create', null, v_target,
        jsonb_build_object('original_exam_id', v_root, 'request_id', r.id));
    end if;

    insert into public.reexam_students (exam_id, user_id, request_id, added_by)
    values (v_target, r.user_id, r.id, auth.uid())
    on conflict (exam_id, user_id) do nothing;
  end if;

  update public.reexam_requests
     set status      = case when p_approve then 'approved' else 'rejected' end::public.reexam_status,
         admin_note  = v_note,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         reexam_id   = v_target
   where id = r.id;

  perform private.audit(case when p_approve then 'reexam_approve' else 'reexam_reject' end,
    r.user_id, r.exam_id,
    jsonb_strip_nulls(jsonb_build_object('request_id', r.id, 'reexam_id', v_target,
                                         'created_reexam', v_new, 'note', v_note)));

  return jsonb_build_object('request_id', r.id, 'status', case when p_approve then 'approved' else 'rejected' end,
                            'reexam_id', v_target, 'created_reexam', v_new);
end;
$$;

-- ===========================================================================
-- 10. Admin exam views
-- ===========================================================================
-- Editor payload v2: adds re-exam info.
create or replace function public.admin_get_exam(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();

  select jsonb_build_object(
    'id',               e.id,
    'title',            e.title,
    'subject',          e.subject,
    'stream',           e.stream,
    'duration_minutes', e.duration_minutes,
    'published_at',     e.published_at,
    'source_file',      e.source_file,
    'created_at',       e.created_at,
    'updated_at',       e.updated_at,
    'status',           s.status,
    'released',         private.results_released(e.id),
    'reexam_of',        e.reexam_of,
    'reexam_of_title',  (select o.title from public.exams o where o.id = e.reexam_of),
    'reexam_student_count', (select count(*) from public.reexam_students r where r.exam_id = e.id),
    'attempt_count',    (select count(*) from public.attempts a where a.exam_id = e.id),
    'window', (
      select jsonb_build_object('id', w.id, 'starts_at', w.starts_at, 'ends_at', w.ends_at)
      from public.exam_windows w
      where w.exam_id = e.id and not w.is_reopen
      order by w.starts_at
      limit 1
    ),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',             q.id,
               'position',       q.position,
               'body',           q.body,
               'options',        q.options,
               'image_url',      q.image_url,
               'points',         q.points,
               'correct_option', k.correct_option
             ) order by q.position)
      from public.questions q
      left join public.answer_keys k on k.question_id = q.id
      where q.exam_id = e.id
    ), '[]'::jsonb)
  )
  into result
  from public.exams e
  join public.exam_status s on s.exam_id = e.id
  where e.id = p_exam_id;

  if result is null then
    raise exception 'Exam not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

-- Windows, retakes and re-exams of one exam (the "Manage" page).
create or replace function public.admin_exam_control(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  v_root uuid;
begin
  perform private.require_admin();
  select coalesce(reexam_of, id) into v_root from public.exams where id = p_exam_id;
  if v_root is null then
    raise exception 'Exam not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'subject', e.subject, 'stream', e.stream,
    'duration_minutes', e.duration_minutes, 'published_at', e.published_at, 'status', s.status,
    'released', private.results_released(e.id), 'release_at', private.results_release_at(e.id),
    'reexam_of', e.reexam_of,
    'reexam_of_title', (select o.title from public.exams o where o.id = e.reexam_of),
    'attempt_count', (select count(*) from public.attempts a where a.exam_id = e.id),
    'in_progress', (select count(*) from public.attempts a where a.exam_id = e.id and a.submitted_at is null),
    'windows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id, 'starts_at', w.starts_at, 'ends_at', w.ends_at,
               'is_reopen', w.is_reopen, 'restricted', w.restricted,
               'attempt_count', (select count(*) from public.attempts a where a.window_id = w.id),
               'allowed_users', coalesce((
                 select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name) order by p.full_name)
                 from public.window_allowed_users u join public.profiles p on p.id = u.user_id
                 where u.window_id = w.id), '[]'::jsonb)
             ) order by w.starts_at)
      from public.exam_windows w where w.exam_id = e.id
    ), '[]'::jsonb),
    'retake_grants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'user_id', g.user_id, 'full_name', p.full_name, 'used', g.used,
               'used_at', g.used_at, 'note', g.note, 'created_at', g.created_at) order by g.created_at desc)
      from public.retake_grants g join public.profiles p on p.id = g.user_id
      where g.exam_id = e.id
    ), '[]'::jsonb),
    'reexams', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'title', x.title, 'published_at', x.published_at, 'status', xs.status,
               'released', private.results_released(x.id),
               'student_count', (select count(*) from public.reexam_students r where r.exam_id = x.id),
               'attempt_count', (select count(*) from public.attempts a where a.exam_id = x.id),
               'created_at', x.created_at) order by x.created_at)
      from public.exams x join public.exam_status xs on xs.exam_id = x.id
      where x.reexam_of = v_root
    ), '[]'::jsonb),
    'reexam_students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.id, 'full_name', p.full_name, 'school', p.school,
               'request_id', r.request_id, 'added_at', r.created_at,
               'has_attempt', exists (select 1 from public.attempts a where a.exam_id = e.id and a.user_id = p.id)
             ) order by p.full_name)
      from public.reexam_students r join public.profiles p on p.id = r.user_id
      where r.exam_id = e.id
    ), '[]'::jsonb)
  )
  into result
  from public.exams e
  join public.exam_status s on s.exam_id = e.id
  where e.id = p_exam_id;

  return result;
end;
$$;

-- Results for admins (any time, released or not): one row per student (latest submitted
-- attempt, same set as the leaderboard plus banned students without a rank), and
-- per-question statistics over the ranked students.
create or replace function public.admin_exam_results(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_admin();

  with latest as (
    select distinct on (a.user_id) a.*
    from public.attempts a
    join public.profiles p on p.id = a.user_id and p.role = 'student'
    where a.exam_id = p_exam_id and a.submitted_at is not null
    order by a.user_id, a.attempt_no desc
  ),
  ranked as (
    select l.id from latest l join public.profiles p on p.id = l.user_id where not p.is_banned
  )
  select jsonb_build_object(
    'exam', (
      select jsonb_build_object(
        'id', e.id, 'title', e.title, 'subject', e.subject, 'stream', e.stream,
        'duration_minutes', e.duration_minutes, 'status', s.status, 'reexam_of', e.reexam_of,
        'released', private.results_released(e.id), 'release_at', private.results_release_at(e.id),
        'question_count', (select count(*) from public.questions q where q.exam_id = e.id),
        'total_points', (select coalesce(sum(q.points), 0) from public.questions q where q.exam_id = e.id))
      from public.exams e join public.exam_status s on s.exam_id = e.id where e.id = p_exam_id),
    'in_progress', (select count(*) from public.attempts a where a.exam_id = p_exam_id and a.submitted_at is null),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'attempt_id', l.id, 'user_id', l.user_id, 'rank', lb.rank,
               'full_name', p.full_name, 'school', p.school, 'stream', p.stream, 'is_banned', p.is_banned,
               'score', l.score, 'max_score', l.max_score,
               'percentage', case when coalesce(l.max_score, 0) > 0
                                  then round(100.0 * l.score / l.max_score, 1) end,
               'time_taken_seconds', greatest(0, extract(epoch from (l.submitted_at - l.started_at)))::integer,
               'auto_submitted', l.auto_submitted, 'attempt_no', l.attempt_no,
               'started_at', l.started_at, 'submitted_at', l.submitted_at
             ) order by lb.rank nulls last, p.full_name)
      from latest l
      join public.profiles p on p.id = l.user_id
      left join private.leaderboard lb on lb.attempt_id = l.id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(qs order by (qs ->> 'position')::int)
      from (
        select jsonb_build_object(
          'id', q.id, 'position', q.position, 'body', left(q.body, 300), 'options', q.options,
          'points', q.points, 'correct_option', k.correct_option,
          'answered', count(aa.selected_option),
          'correct', count(*) filter (where aa.selected_option = k.correct_option),
          'participants', (select count(*) from ranked),
          'counts', jsonb_build_object(
            'A', count(*) filter (where aa.selected_option = 'A'),
            'B', count(*) filter (where aa.selected_option = 'B'),
            'C', count(*) filter (where aa.selected_option = 'C'),
            'D', count(*) filter (where aa.selected_option = 'D'))
        ) qs
        from public.questions q
        left join public.answer_keys k on k.question_id = q.id
        left join public.attempt_answers aa
               on aa.question_id = q.id and aa.attempt_id in (select id from ranked)
        where q.exam_id = p_exam_id
        group by q.id, q.position, q.body, q.options, q.points, k.correct_option
      ) t
    ), '[]'::jsonb)
  )
  into result;

  if result -> 'exam' is null or result -> 'exam' = 'null'::jsonb then
    raise exception 'Exam not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'server_now',       clock_timestamp(),
    'total_students',   (select count(*) from public.profiles where role = 'student'),
    'banned',           (select count(*) from public.profiles where role = 'student' and is_banned),
    'incomplete',       (select count(*) from public.profiles where role = 'student' and not is_complete and not is_banned),
    'live_exams',       (select count(*) from public.exam_status where status = 'live'),
    'writing_now',      (select count(*) from public.attempts
                         where submitted_at is null and now() <= deadline_at + private.submit_grace()),
    'pending_requests', (select count(*) from public.reexam_requests where status = 'pending'),
    'live', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'title', e.title, 'live_ends_at', s.live_ends_at,
               'writing', (select count(*) from public.attempts a
                           where a.exam_id = e.id and a.submitted_at is null
                             and now() <= a.deadline_at + private.submit_grace()),
               'submitted', (select count(*) from public.attempts a where a.exam_id = e.id and a.submitted_at is not null)
             ) order by s.live_ends_at)
      from public.exams e join public.exam_status s on s.exam_id = e.id
      where s.status = 'live'
    ), '[]'::jsonb),
    'recent_actions', coalesce((
      select jsonb_agg(x order by (x ->> 'id')::bigint desc) from (
        select jsonb_build_object('id', l.id, 'action', l.action, 'details', l.details, 'created_at', l.created_at,
                                  'actor', ap.full_name, 'target_user_id', l.target_user_id, 'target', tp.full_name,
                                  'exam_id', l.exam_id, 'exam_title', e.title) x
        from public.admin_audit_log l
        left join public.profiles ap on ap.id = l.actor_id
        left join public.profiles tp on tp.id = l.target_user_id
        left join public.exams e on e.id = l.exam_id
        order by l.id desc limit 15) t
    ), '[]'::jsonb)
  );
end;
$$;

-- admin_list_exams v2: adds reexam_of.
drop function public.admin_list_exams();
create function public.admin_list_exams()
returns table (
  id               uuid,
  title            text,
  subject          text,
  stream           public.exam_stream,
  duration_minutes integer,
  published_at     timestamptz,
  created_at       timestamptz,
  status           public.exam_state,
  next_starts_at   timestamptz,
  live_ends_at     timestamptz,
  last_ends_at     timestamptz,
  window_starts_at timestamptz,
  window_ends_at   timestamptz,
  question_count   integer,
  attempt_count    integer,
  reexam_of        uuid,
  released         boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select
    e.id, e.title, e.subject, e.stream, e.duration_minutes, e.published_at, e.created_at,
    s.status, s.next_starts_at, s.live_ends_at, s.last_ends_at,
    mw.starts_at, mw.ends_at,
    (select count(*)::integer from public.questions q where q.exam_id = e.id),
    (select count(*)::integer from public.attempts a where a.exam_id = e.id),
    e.reexam_of,
    e.published_at is not null and private.results_released(e.id)
  from public.exams e
  join public.exam_status s on s.exam_id = e.id
  left join lateral (
    select w.starts_at, w.ends_at
    from public.exam_windows w
    where w.exam_id = e.id and not w.is_reopen
    order by w.starts_at
    limit 1
  ) mw on true
  order by coalesce(mw.starts_at, e.created_at) desc;
end;
$$;

-- ===========================================================================
-- 11. student_dashboard v4: re-exams only for approved students; request status.
-- ===========================================================================
create or replace function public.student_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
  v_exams   jsonb;
begin
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_profile.is_banned then
    return jsonb_build_object('server_now', clock_timestamp(), 'banned', true, 'exams', '[]'::jsonb);
  end if;

  with my_windows as (
    select w.*
    from public.exam_windows w
    where not w.restricted
       or exists (select 1 from public.window_allowed_users u
                  where u.window_id = w.id and u.user_id = v_uid)
  ),
  ex as (
    select
      e.id, e.title, e.subject, e.stream, e.duration_minutes, e.reexam_of,
      (select w.ends_at from my_windows w where w.exam_id = e.id and now() >= w.starts_at and now() < w.ends_at
         order by w.ends_at desc limit 1)                                         as live_ends_at,
      (select min(w.starts_at) from my_windows w where w.exam_id = e.id and w.starts_at > now()) as next_starts_at,
      (select max(w.ends_at)   from my_windows w where w.exam_id = e.id)          as last_ends_at,
      (select count(*) from public.questions q where q.exam_id = e.id)            as question_count,
      (select coalesce(sum(q.points), 0) from public.questions q where q.exam_id = e.id) as total_points,
      private.results_released(e.id)                                             as released,
      private.results_release_at(e.id)                                           as results_at,
      exists (select 1 from public.retake_grants g
              where g.exam_id = e.id and g.user_id = v_uid and not g.used)        as has_retake,
      (select jsonb_build_object('status', r.status, 'admin_note', r.admin_note,
                                 'created_at', r.created_at, 'reviewed_at', r.reviewed_at)
         from public.reexam_requests r
         where r.exam_id = e.id and r.user_id = v_uid
         order by r.created_at desc limit 1)                                      as reexam_request,
      private.reexam_block_reason(e.id, v_uid) is null                           as can_request_reexam
    from public.exams e
    where e.published_at is not null
      and (e.stream = 'both' or e.stream::text = v_profile.stream::text)
      and (e.reexam_of is null or exists (select 1 from public.reexam_students rs
                                          where rs.exam_id = e.id and rs.user_id = v_uid))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ex.id, 'title', ex.title, 'subject', ex.subject, 'stream', ex.stream,
           'duration_minutes', ex.duration_minutes, 'is_reexam', ex.reexam_of is not null,
           'status', case when ex.live_ends_at is not null then 'live'
                          when ex.next_starts_at is not null then 'scheduled'
                          else 'closed' end,
           'live_ends_at', ex.live_ends_at, 'next_starts_at', ex.next_starts_at, 'last_ends_at', ex.last_ends_at,
           'question_count', ex.question_count, 'total_points', ex.total_points,
           'released', ex.released, 'results_at', ex.results_at,
           'attempt', (
             select jsonb_build_object(
                      'id', a.id, 'attempt_no', a.attempt_no, 'started_at', a.started_at,
                      'deadline_at', a.deadline_at, 'submitted_at', a.submitted_at,
                      'auto_submitted', a.auto_submitted)
                    || case when ex.released then jsonb_build_object(
                         'score', a.score, 'max_score', a.max_score, 'rank', lb.rank, 'total', lb.total)
                       else '{}'::jsonb end
             from public.attempts a
             left join private.leaderboard lb on lb.attempt_id = a.id
             where a.exam_id = ex.id and a.user_id = v_uid
             order by a.attempt_no desc
             limit 1),
           'has_retake', ex.has_retake,
           'reexam_pending', coalesce(ex.reexam_request ->> 'status' = 'pending', false),
           'reexam_request', ex.reexam_request,
           'can_request_reexam', ex.can_request_reexam
         ) order by coalesce(ex.live_ends_at, ex.next_starts_at, ex.last_ends_at)), '[]'::jsonb)
    into v_exams
  from ex
  where ex.last_ends_at is not null;

  return jsonb_build_object('server_now', clock_timestamp(), 'banned', false, 'exams', v_exams);
end;
$$;

-- ===========================================================================
-- Privileges
-- ===========================================================================
grant execute on function public.admin_set_ban(uuid, boolean, text)                      to authenticated;
grant execute on function public.admin_list_students(text, public.stream_type, text, integer, integer) to authenticated;
grant execute on function public.admin_get_student(uuid)                                 to authenticated;
grant execute on function public.admin_extend_window(uuid, timestamptz)                  to authenticated;
grant execute on function public.admin_add_window(uuid, timestamptz, timestamptz, uuid[]) to authenticated;
grant execute on function public.admin_grant_retake(uuid, uuid, text)                    to authenticated;
grant execute on function public.admin_revoke_retake(uuid)                               to authenticated;
grant execute on function public.admin_create_reexam(uuid)                               to authenticated;
grant execute on function public.admin_add_reexam_students(uuid, uuid[])                 to authenticated;
grant execute on function public.admin_remove_reexam_student(uuid, uuid)                 to authenticated;
grant execute on function public.request_reexam(uuid, text)                              to authenticated;
grant execute on function public.admin_list_reexam_requests(public.reexam_status)        to authenticated;
grant execute on function public.admin_review_reexam_request(uuid, boolean, text)        to authenticated;
grant execute on function public.admin_exam_control(uuid)                                to authenticated;
grant execute on function public.admin_exam_results(uuid)                                to authenticated;
grant execute on function public.admin_overview()                                        to authenticated;
grant execute on function public.admin_list_exams()                                      to authenticated;
