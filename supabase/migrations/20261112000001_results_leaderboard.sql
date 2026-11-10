-- Phase 4: results, leaderboard, answer reveal.
--
-- Reveal rule: correct answers (and per-question right/wrong, which gives them away) are
-- returned only when EVERY window of the exam has ended — including reopen windows, so an
-- early taker can't pass answers to someone in a later window.
--
-- Leaderboard: each student's latest submitted attempt (a retake replaces the first one),
-- ranked by score desc, then time taken asc. Banned users, admins and unsubmitted attempts
-- are excluded. It lives in the private schema; clients read it through get_leaderboard(),
-- which exposes names/schools but never user ids.

create or replace function private.answers_revealed(p_exam_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.exam_windows w where w.exam_id = p_exam_id)
     and not exists (select 1 from public.exam_windows w where w.exam_id = p_exam_id and w.ends_at > now());
$$;

create or replace view private.leaderboard as
with latest as (
  select distinct on (a.exam_id, a.user_id)
         a.id, a.exam_id, a.user_id, a.score, a.max_score, a.started_at, a.submitted_at, a.auto_submitted
  from public.attempts a
  where a.submitted_at is not null and a.score is not null
  order by a.exam_id, a.user_id, a.attempt_no desc
)
select
  l.exam_id,
  l.user_id,
  l.id                                                          as attempt_id,
  l.score,
  l.max_score,
  l.auto_submitted,
  greatest(0, extract(epoch from (l.submitted_at - l.started_at)))::integer as time_taken_seconds,
  rank() over (partition by l.exam_id
               order by l.score desc, (l.submitted_at - l.started_at) asc)::integer as rank,
  count(*) over (partition by l.exam_id)::integer               as total
from latest l
join public.profiles p on p.id = l.user_id
where not p.is_banned and p.role = 'student';

-- Can the caller see this exam? Admins: always. Students: published, their stream, not banned.
create or replace function private.can_view_exam(p_exam_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1
    from public.exams e
    join public.profiles p on p.id = auth.uid()
    where e.id = p_exam_id
      and e.published_at is not null
      and not p.is_banned
      and (e.stream = 'both' or e.stream::text = p.stream::text)
  );
$$;

-- ---------------------------------------------------------------------------
-- get_my_result: the caller's latest submitted attempt for an exam.
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
  v_revealed boolean;
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
  v_revealed := private.answers_revealed(p_exam_id);
  select rank, total into v_lb from private.leaderboard where attempt_id = v_attempt.id;

  return jsonb_build_object(
    'exam_id',            v_exam.id,
    'title',              v_exam.title,
    'subject',            v_exam.subject,
    'attempt_id',         v_attempt.id,
    'attempt_no',         v_attempt.attempt_no,
    'score',              v_attempt.score,
    'max_score',          v_attempt.max_score,
    'started_at',         v_attempt.started_at,
    'submitted_at',       v_attempt.submitted_at,
    'auto_submitted',     v_attempt.auto_submitted,
    'time_taken_seconds', greatest(0, extract(epoch from (v_attempt.submitted_at - v_attempt.started_at)))::integer,
    'rank',               v_lb.rank,
    'total',              v_lb.total,
    'revealed',           v_revealed,
    'reveal_at',          (select max(ends_at) from public.exam_windows where exam_id = p_exam_id),
    'questions', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id',              q.id,
                 'position',        q.position,
                 'body',            q.body,
                 'options',         q.options,
                 'image_url',       q.image_url,
                 'points',          q.points,
                 'selected_option', aa.selected_option,
                 'flagged',         coalesce(aa.flagged, false)
               )
               || case when v_revealed then jsonb_build_object(
                    'correct_option', k.correct_option,
                    'is_correct',     aa.selected_option is not null and aa.selected_option = k.correct_option)
                  else '{}'::jsonb end
               order by q.position)
      from public.questions q
      left join public.attempt_answers aa on aa.attempt_id = v_attempt.id and aa.question_id = q.id
      left join public.answer_keys k     on k.question_id = q.id
      where q.exam_id = p_exam_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_leaderboard: top N plus the caller's own row (pinned), no user ids.
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

  return jsonb_build_object(
    'exam_id', p_exam_id,
    'title',   (select title from public.exams where id = p_exam_id),
    'total',   coalesce((select max(total) from private.leaderboard where exam_id = p_exam_id), 0),
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
-- Realtime: ping 'leaderboard:<exam_id>' when a result appears or changes. The message
-- carries only the exam id — clients re-fetch through get_leaderboard (authorised).
-- Never allowed to break a submit: failures are swallowed.
-- ---------------------------------------------------------------------------
create or replace function public.attempts_notify_leaderboard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.submitted_at is not null
     and (old.submitted_at is null or new.score is distinct from old.score) then
    begin
      perform realtime.send(
        jsonb_build_object('exam_id', new.exam_id),
        'changed',
        'leaderboard:' || new.exam_id::text,
        false
      );
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

revoke execute on function public.attempts_notify_leaderboard() from public, anon, authenticated;

create trigger attempts_notify_leaderboard
  after update of submitted_at, score on public.attempts
  for each row execute function public.attempts_notify_leaderboard();

-- ---------------------------------------------------------------------------
-- student_dashboard v2: adds rank / total for completed attempts.
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
      (select to_jsonb(x) from (
         select a.id, a.attempt_no, a.started_at, a.deadline_at, a.submitted_at,
                a.auto_submitted, a.score, a.max_score, lb.rank, lb.total
         from public.attempts a
         left join private.leaderboard lb on lb.attempt_id = a.id
         where a.exam_id = e.id and a.user_id = v_uid
         order by a.attempt_no desc limit 1) x)                                   as attempt,
      exists (select 1 from public.retake_grants g
              where g.exam_id = e.id and g.user_id = v_uid and not g.used)        as has_retake,
      exists (select 1 from public.reexam_requests r
              where r.exam_id = e.id and r.user_id = v_uid and r.status = 'pending') as reexam_pending,
      private.answers_revealed(e.id)                                              as revealed
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
           'attempt', attempt, 'has_retake', has_retake, 'reexam_pending', reexam_pending,
           'revealed', revealed
         ) order by coalesce(live_ends_at, next_starts_at, last_ends_at)), '[]'::jsonb)
    into v_exams
  from ex
  where last_ends_at is not null;

  return jsonb_build_object('server_now', clock_timestamp(), 'banned', false, 'exams', v_exams);
end;
$$;

grant execute on function public.get_my_result(uuid)            to authenticated;
grant execute on function public.get_leaderboard(uuid, integer) to authenticated;
