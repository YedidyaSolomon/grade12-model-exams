-- RULE: results are released only when the exam is closed, i.e. EVERY window of the exam
-- (including reopen / restricted windows) has ended. Before that a student gets NO score,
-- percentage, rank or leaderboard — their own or anyone else's — and no correct answers.
-- Admins can see everything at any time. Enforced here in the database, not only in the UI.

-- ---------------------------------------------------------------------------
-- Single source of truth for the release rule.
-- ---------------------------------------------------------------------------
create or replace function private.results_released(p_exam_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.exam_windows w where w.exam_id = p_exam_id)
     and not exists (select 1 from public.exam_windows w where w.exam_id = p_exam_id and w.ends_at > now());
$$;

-- When results will be released (end of the last window, across ALL windows).
create or replace function private.results_release_at(p_exam_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max(w.ends_at) from public.exam_windows w where w.exam_id = p_exam_id;
$$;

-- Answer reveal follows exactly the same rule.
create or replace function private.answers_revealed(p_exam_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select private.results_released(p_exam_id); $$;

-- ---------------------------------------------------------------------------
-- Students may no longer read score columns directly (RLS let them see their own row).
-- Admins also read scores only through security definer RPCs.
-- ---------------------------------------------------------------------------
revoke select on public.attempts from authenticated;
grant select (id, exam_id, window_id, user_id, attempt_no, retake_grant_id,
              started_at, deadline_at, submitted_at, auto_submitted)
  on public.attempts to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_result v2
-- ---------------------------------------------------------------------------
create or replace function public.get_my_result(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile  public.profiles;
  v_attempt  public.attempts;
  v_exam     public.exams;
  v_released boolean;
  v_lb       record;
begin
  v_profile := private.require_active_student();

  select * into v_attempt
  from public.attempts
  where exam_id = p_exam_id and user_id = v_profile.id and submitted_at is not null
  order by attempt_no desc
  limit 1;
  if not found then
    raise exception 'no_result' using errcode = 'P0001';
  end if;

  select * into v_exam from public.exams where id = p_exam_id;
  v_released := public.is_admin() or private.results_released(p_exam_id);

  if not v_released then
    -- Nothing that reveals or implies a score.
    return jsonb_build_object(
      'exam_id',        v_exam.id,
      'title',          v_exam.title,
      'subject',        v_exam.subject,
      'attempt_id',     v_attempt.id,
      'attempt_no',     v_attempt.attempt_no,
      'submitted_at',   v_attempt.submitted_at,
      'auto_submitted', v_attempt.auto_submitted,
      'released',       false,
      'release_at',     private.results_release_at(p_exam_id)
    );
  end if;

  select rank, total into v_lb from private.leaderboard where attempt_id = v_attempt.id;

  return jsonb_build_object(
    'exam_id',            v_exam.id,
    'title',              v_exam.title,
    'subject',            v_exam.subject,
    'attempt_id',         v_attempt.id,
    'attempt_no',         v_attempt.attempt_no,
    'submitted_at',       v_attempt.submitted_at,
    'auto_submitted',     v_attempt.auto_submitted,
    'released',           true,
    'release_at',         private.results_release_at(p_exam_id),
    'score',              v_attempt.score,
    'max_score',          v_attempt.max_score,
    'started_at',         v_attempt.started_at,
    'time_taken_seconds', greatest(0, extract(epoch from (v_attempt.submitted_at - v_attempt.started_at)))::integer,
    'rank',               v_lb.rank,
    'total',              v_lb.total,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',              q.id,
               'position',        q.position,
               'body',            q.body,
               'options',         q.options,
               'image_url',       q.image_url,
               'points',          q.points,
               'selected_option', aa.selected_option,
               'flagged',         coalesce(aa.flagged, false),
               'correct_option',  k.correct_option,
               'is_correct',      aa.selected_option is not null and aa.selected_option = k.correct_option
             ) order by q.position)
      from public.questions q
      left join public.attempt_answers aa on aa.attempt_id = v_attempt.id and aa.question_id = q.id
      left join public.answer_keys k     on k.question_id = q.id
      where q.exam_id = p_exam_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_leaderboard v2: nothing before release (admins excepted).
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_exam_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not private.can_view_exam(p_exam_id) then
    raise exception 'exam_not_found' using errcode = 'P0001';
  end if;

  if not (public.is_admin() or private.results_released(p_exam_id)) then
    return jsonb_build_object(
      'exam_id',    p_exam_id,
      'title',      (select title from public.exams where id = p_exam_id),
      'released',   false,
      'release_at', private.results_release_at(p_exam_id),
      'server_now', clock_timestamp()
    );
  end if;

  return jsonb_build_object(
    'exam_id',    p_exam_id,
    'title',      (select title from public.exams where id = p_exam_id),
    'released',   true,
    'release_at', private.results_release_at(p_exam_id),
    'total',      coalesce((select max(total) from private.leaderboard where exam_id = p_exam_id), 0),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', lb.rank, 'full_name', p.full_name, 'school', p.school,
               'score', lb.score, 'max_score', lb.max_score,
               'time_taken_seconds', lb.time_taken_seconds, 'is_me', lb.user_id = v_uid
             ) order by lb.rank, p.full_name)
      from (
        select * from private.leaderboard
        where exam_id = p_exam_id
        order by rank, time_taken_seconds
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) lb
      join public.profiles p on p.id = lb.user_id
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object(
               'rank', lb.rank, 'full_name', p.full_name, 'school', p.school,
               'score', lb.score, 'max_score', lb.max_score,
               'time_taken_seconds', lb.time_taken_seconds, 'is_me', true)
      from private.leaderboard lb
      join public.profiles p on p.id = lb.user_id
      where lb.exam_id = p_exam_id and lb.user_id = v_uid
    ),
    'server_now', clock_timestamp()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- student_dashboard v3: score / rank only after release; adds released + results_at.
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
      exists (select 1 from public.reexam_requests r
              where r.exam_id = e.id and r.user_id = v_uid and r.status = 'pending') as reexam_pending
    from public.exams e
    where e.published_at is not null
      and (e.stream = 'both' or e.stream::text = v_profile.stream::text)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ex.id, 'title', ex.title, 'subject', ex.subject, 'stream', ex.stream,
           'duration_minutes', ex.duration_minutes,
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
           'has_retake', ex.has_retake, 'reexam_pending', ex.reexam_pending
         ) order by coalesce(ex.live_ends_at, ex.next_starts_at, ex.last_ends_at)), '[]'::jsonb)
    into v_exams
  from ex
  where ex.last_ends_at is not null;

  return jsonb_build_object('server_now', clock_timestamp(), 'banned', false, 'exams', v_exams);
end;
$$;
