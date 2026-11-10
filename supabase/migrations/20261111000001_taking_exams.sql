-- Phase 3: taking exams.
--   start_exam / get_open_attempt / save_answer / save_answers / submit_exam,
--   student_dashboard, and a pg_cron job that auto-submits expired attempts.
--
-- Errors meant for the student UI are raised with errcode P0001 and a stable
-- machine-readable MESSAGE (e.g. 'already_taken'); the frontend maps it to text.

-- Grace period after deadline_at in which a submit / last save is still accepted
-- (covers slow mobile networks). The cron job only auto-submits after it.
create or replace function private.submit_grace()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '30 seconds' $$;

-- ---------------------------------------------------------------------------
-- What the exam room needs. NEVER includes answer keys.
-- ---------------------------------------------------------------------------
create or replace function private.attempt_payload(p_attempt_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'attempt_id',       a.id,
    'attempt_no',       a.attempt_no,
    'exam_id',          e.id,
    'title',            e.title,
    'subject',          e.subject,
    'duration_minutes', e.duration_minutes,
    'started_at',       a.started_at,
    'deadline_at',      a.deadline_at,
    'server_now',       clock_timestamp(),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        q.id,
               'position',  q.position,
               'body',      q.body,
               'options',   q.options,
               'image_url', q.image_url,
               'points',    q.points
             ) order by q.position)
      from public.questions q
      where q.exam_id = e.id
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'question_id',     aa.question_id,
               'selected_option', aa.selected_option,
               'flagged',         aa.flagged
             ))
      from public.attempt_answers aa
      where aa.attempt_id = a.id
    ), '[]'::jsonb)
  )
  from public.attempts a
  join public.exams e on e.id = a.exam_id
  where a.id = p_attempt_id;
$$;

-- Caller's profile, or a student-facing error.
create or replace function private.require_active_student()
returns public.profiles
language plpgsql
stable
set search_path = ''
as $$
declare
  p public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p.is_banned then
    raise exception 'banned' using errcode = 'P0001', hint = 'Account suspended - contact admin';
  end if;
  if not p.is_complete then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grade + close one attempt. p_auto: closed by the timer/cron rather than the student.
-- ---------------------------------------------------------------------------
create or replace function private.finalize_attempt(p_attempt_id uuid, p_auto boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_exam uuid;
begin
  update public.attempts
     set submitted_at   = case when p_auto then least(now(), deadline_at) else now() end,
         auto_submitted = p_auto
   where id = p_attempt_id and submitted_at is null
  returning exam_id into v_exam;

  if v_exam is not null then
    perform private.grade_attempts(v_exam, p_attempt_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_exam: checks ban, profile, stream, active window, one-attempt rule (or an
-- unused retake grant). Resumes an in-progress attempt instead of creating one.
-- ---------------------------------------------------------------------------
create or replace function public.start_exam(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_exam    public.exams;
  v_open    public.attempts;
  v_window  public.exam_windows;
  v_grant   public.retake_grants;
  v_prev    integer;
  v_id      uuid;
begin
  v_profile := private.require_active_student();

  -- Share lock: update_exam (FOR UPDATE) cannot change the exam while we start.
  select * into v_exam from public.exams where id = p_exam_id for share;
  if not found
     or v_exam.published_at is null
     or (v_exam.stream <> 'both' and v_exam.stream::text <> v_profile.stream::text) then
    raise exception 'exam_not_found' using errcode = 'P0001';
  end if;

  -- Resume
  select * into v_open
  from public.attempts
  where exam_id = p_exam_id and user_id = v_profile.id and submitted_at is null;
  if found then
    if now() > v_open.deadline_at + private.submit_grace() then
      raise exception 'time_up' using errcode = 'P0001';  -- cron finalises it shortly
    end if;
    return private.attempt_payload(v_open.id);
  end if;

  -- Active window this student may use
  select w.* into v_window
  from public.exam_windows w
  where w.exam_id = p_exam_id
    and now() >= w.starts_at and now() < w.ends_at
    and (not w.restricted or exists (
          select 1 from public.window_allowed_users u
          where u.window_id = w.id and u.user_id = v_profile.id))
  order by w.ends_at desc
  limit 1;
  if not found then
    raise exception 'not_open' using errcode = 'P0001';
  end if;

  -- One attempt, unless an unused retake grant exists
  select coalesce(max(attempt_no), 0) into v_prev
  from public.attempts where exam_id = p_exam_id and user_id = v_profile.id;

  if v_prev > 0 then
    select * into v_grant
    from public.retake_grants
    where exam_id = p_exam_id and user_id = v_profile.id and not used
    for update;
    if not found then
      -- A concurrent request may have just used the grant and created the attempt.
      select id into v_id from public.attempts
      where exam_id = p_exam_id and user_id = v_profile.id and submitted_at is null;
      if v_id is not null then
        return private.attempt_payload(v_id);
      end if;
      raise exception 'already_taken' using errcode = 'P0001';
    end if;
    update public.retake_grants set used = true, used_at = now() where id = v_grant.id;
  end if;

  begin
    insert into public.attempts (exam_id, window_id, user_id, attempt_no, retake_grant_id, deadline_at)
    values (p_exam_id, v_window.id, v_profile.id, v_prev + 1, v_grant.id, now())  -- deadline set by trigger
    returning id into v_id;
  exception when unique_violation then
    -- Double tap / two tabs: the other request created it first. Resume that one.
    select id into v_id from public.attempts
    where exam_id = p_exam_id and user_id = v_profile.id and submitted_at is null;
    if v_id is null then
      raise exception 'already_taken' using errcode = 'P0001';
    end if;
  end;

  return private.attempt_payload(v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_open_attempt: resume without ever creating an attempt (exam room reload).
-- Returns null when there is nothing to resume.
-- ---------------------------------------------------------------------------
create or replace function public.get_open_attempt(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_id      uuid;
begin
  v_profile := private.require_active_student();
  select id into v_id
  from public.attempts
  where exam_id = p_exam_id and user_id = v_profile.id and submitted_at is null
    and now() <= deadline_at + private.submit_grace();
  if v_id is null then
    return null;
  end if;
  return private.attempt_payload(v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Saving answers. Allowed only on the caller's own open attempt, before
-- deadline + grace, for questions of that exam, while not banned.
-- p_answers: [{ "question_id": uuid, "selected_option": "A".."D"|null, "flagged": bool }]
-- ---------------------------------------------------------------------------
create or replace function private.lock_open_attempt(p_attempt_id uuid)
returns public.attempts
language plpgsql
set search_path = ''
as $$
declare
  a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt_id for update;
  if not found or a.user_id is distinct from auth.uid() then
    raise exception 'attempt_not_found' using errcode = 'P0001';
  end if;
  if a.submitted_at is not null then
    raise exception 'already_submitted' using errcode = 'P0001';
  end if;
  return a;
end;
$$;

create or replace function private.upsert_answers(a public.attempts, p_answers jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  x jsonb;
  n integer := 0;
begin
  if jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'invalid_answers' using errcode = 'P0001';
  end if;
  for x in select value from jsonb_array_elements(p_answers) loop
    if coalesce(x ->> 'selected_option', 'A') not in ('A', 'B', 'C', 'D')
       or not exists (
         select 1 from public.questions q
         where q.id = nullif(x ->> 'question_id', '')::uuid and q.exam_id = a.exam_id
       ) then
      raise exception 'invalid_answers' using errcode = 'P0001';
    end if;

    insert into public.attempt_answers (attempt_id, question_id, selected_option, flagged, updated_at)
    values (a.id, (x ->> 'question_id')::uuid,
            (x ->> 'selected_option')::public.answer_option,
            coalesce((x ->> 'flagged')::boolean, false), now())
    on conflict (attempt_id, question_id) do update
      set selected_option = excluded.selected_option,
          flagged         = case when x ? 'flagged' then excluded.flagged
                                 else public.attempt_answers.flagged end,
          updated_at      = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.save_answers(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.attempts;
  n integer;
begin
  perform private.require_active_student();
  a := private.lock_open_attempt(p_attempt_id);
  if now() > a.deadline_at + private.submit_grace() then
    raise exception 'time_up' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p_answers, '[]'::jsonb)) > 300 then
    raise exception 'invalid_answers' using errcode = 'P0001';
  end if;
  n := private.upsert_answers(a, p_answers);
  return jsonb_build_object('saved', n, 'server_now', clock_timestamp());
end;
$$;

-- Single-answer convenience wrapper (same rules).
create or replace function public.save_answer(
  p_attempt_id  uuid,
  p_question_id uuid,
  p_option      public.answer_option,
  p_flagged     boolean default false
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.save_answers(
    p_attempt_id,
    jsonb_build_array(jsonb_build_object(
      'question_id', p_question_id, 'selected_option', p_option, 'flagged', coalesce(p_flagged, false))));
$$;

-- ---------------------------------------------------------------------------
-- submit_exam: within deadline + grace, saves any final answers and grades.
-- After the grace period the submission is REJECTED: new answers are ignored and the
-- attempt is closed as auto-submitted with what was saved in time (late = true).
-- Idempotent: submitting an already-submitted attempt just reports it.
-- ---------------------------------------------------------------------------
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

  select * into a from public.attempts where id = p_attempt_id for update;
  if not found or a.user_id is distinct from auth.uid() then
    raise exception 'attempt_not_found' using errcode = 'P0001';
  end if;

  if a.submitted_at is not null then
    return jsonb_build_object('submitted_at', a.submitted_at, 'auto_submitted', a.auto_submitted,
                              'late', false, 'already', true);
  end if;

  -- A banned student's attempt is closed with what was saved; nothing new is accepted.
  v_late := now() > a.deadline_at + private.submit_grace()
            or coalesce((select is_banned from public.profiles where id = a.user_id), true);

  if not v_late and p_answers is not null and jsonb_array_length(p_answers) > 0 then
    perform private.upsert_answers(a, p_answers);
  end if;

  perform private.finalize_attempt(a.id, v_late);
  select * into a from public.attempts where id = p_attempt_id;
  return jsonb_build_object('submitted_at', a.submitted_at, 'auto_submitted', a.auto_submitted,
                            'late', v_late, 'already', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Auto-submit job (pg_cron, every minute).
-- ---------------------------------------------------------------------------
create or replace function private.auto_submit_expired()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id from public.attempts
    where submitted_at is null and deadline_at + private.submit_grace() < now()
    order by deadline_at
    limit 5000
    for update skip locked
  loop
    perform private.finalize_attempt(r.id, true);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'auto-submit-expired-attempts';
  perform cron.schedule('auto-submit-expired-attempts', '* * * * *',
                        'select private.auto_submit_expired()');
end $$;

-- ---------------------------------------------------------------------------
-- student_dashboard: everything the dashboard needs in one round trip.
-- Only exams visible to the caller (published, their stream or both, windows they may use).
-- ---------------------------------------------------------------------------
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
      e.id, e.title, e.subject, e.stream, e.duration_minutes,
      (select w.ends_at   from my_windows w where w.exam_id = e.id and now() >= w.starts_at and now() < w.ends_at
         order by w.ends_at desc limit 1)                                         as live_ends_at,
      (select min(w.starts_at) from my_windows w where w.exam_id = e.id and w.starts_at > now()) as next_starts_at,
      (select max(w.ends_at)   from my_windows w where w.exam_id = e.id)          as last_ends_at,
      (select count(*) from public.questions q where q.exam_id = e.id)            as question_count,
      (select coalesce(sum(q.points), 0) from public.questions q where q.exam_id = e.id) as total_points,
      (select to_jsonb(x) from (
         select a.id, a.attempt_no, a.started_at, a.deadline_at, a.submitted_at,
                a.auto_submitted, a.score, a.max_score
         from public.attempts a
         where a.exam_id = e.id and a.user_id = v_uid
         order by a.attempt_no desc limit 1) x)                                   as attempt,
      exists (select 1 from public.retake_grants g
              where g.exam_id = e.id and g.user_id = v_uid and not g.used)        as has_retake,
      exists (select 1 from public.reexam_requests r
              where r.exam_id = e.id and r.user_id = v_uid and r.status = 'pending') as reexam_pending
    from public.exams e
    where e.published_at is not null
      and (e.stream = 'both' or e.stream::text = v_profile.stream::text)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'title', title, 'subject', subject, 'stream', stream,
           'duration_minutes', duration_minutes,
           'status', case when live_ends_at is not null then 'live'
                          when next_starts_at is not null then 'scheduled'
                          else 'closed' end,
           'live_ends_at', live_ends_at, 'next_starts_at', next_starts_at, 'last_ends_at', last_ends_at,
           'question_count', question_count, 'total_points', total_points,
           'attempt', attempt, 'has_retake', has_retake, 'reexam_pending', reexam_pending
         ) order by coalesce(live_ends_at, next_starts_at, last_ends_at)), '[]'::jsonb)
    into v_exams
  from ex
  where last_ends_at is not null;  -- no window this student can use => not shown

  return jsonb_build_object('server_now', clock_timestamp(), 'banned', false, 'exams', v_exams);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
grant execute on function public.start_exam(uuid)                                    to authenticated;
grant execute on function public.get_open_attempt(uuid)                              to authenticated;
grant execute on function public.save_answers(uuid, jsonb)                           to authenticated;
grant execute on function public.save_answer(uuid, uuid, public.answer_option, boolean) to authenticated;
grant execute on function public.submit_exam(uuid, jsonb)                           to authenticated;
grant execute on function public.student_dashboard()                                 to authenticated;
