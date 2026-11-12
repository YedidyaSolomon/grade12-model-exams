-- Public landing page data (logged-out visitors, so `anon` may call it).
--
-- Returns ONLY:
--   * counts: registered students, exams held (closed original exams);
--   * what's on: the exam(s) live right now and the next scheduled one (title, subject,
--     stream, length). Re-exams and restricted windows are never listed;
--   * a podium for the LATEST exam whose results are released: rank, score and a short
--     name ("Abebe K."). Students are minors, so no full name, school, region, Telegram
--     username or user id ever leaves this function. Unreleased exams are never used
--     (private.results_released), so it can't leak scores early.

-- "Abebe Kebede Tesfaye" -> "Abebe K."; "Abebe" -> "Abebe"; null -> null.
create or replace function private.short_name(p_full_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when n = '' then null
           when position(' ' in n) = 0 then n
           else split_part(n, ' ', 1) || ' ' || upper(left(split_part(n, ' ', 2), 1)) || '.'
         end
  from (select regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g') as n) x;
$$;

create or replace function public.public_home()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with open_windows as (
    -- Exams anyone in a stream could take: published, not a re-exam, unrestricted window.
    select e.id, e.title, e.subject, e.stream, e.duration_minutes, w.starts_at, w.ends_at
    from public.exams e
    join public.exam_windows w on w.exam_id = e.id and not w.restricted
    where e.published_at is not null and e.reexam_of is null
  ),
  podium_exam as (
    select e.id, e.title, e.subject, private.results_release_at(e.id) as released_at
    from public.exams e
    where e.published_at is not null
      and e.reexam_of is null
      and private.results_released(e.id)
      and exists (select 1 from private.leaderboard lb where lb.exam_id = e.id)
    order by private.results_release_at(e.id) desc
    limit 1
  )
  select jsonb_build_object(
    'server_now', clock_timestamp(),
    'students',   (select count(*) from public.profiles
                   where role = 'student' and is_complete and not is_banned),
    'exams_held', (select count(*) from public.exams e
                   where e.published_at is not null and e.reexam_of is null
                     and private.results_released(e.id)
                     and exists (select 1 from public.attempts a
                                 where a.exam_id = e.id and a.submitted_at is not null)),
    'live', coalesce((
      select jsonb_agg(x order by x ->> 'ends_at') from (
        select jsonb_build_object(
                 'title', o.title, 'subject', o.subject, 'stream', o.stream,
                 'duration_minutes', o.duration_minutes,
                 'question_count', (select count(*) from public.questions q where q.exam_id = o.id),
                 'ends_at', max(o.ends_at)) x
        from open_windows o
        where now() >= o.starts_at and now() < o.ends_at
        group by o.id, o.title, o.subject, o.stream, o.duration_minutes
        order by max(o.ends_at)
        limit 3
      ) t
    ), '[]'::jsonb),
    'next', (
      select jsonb_build_object(
               'title', o.title, 'subject', o.subject, 'stream', o.stream,
               'duration_minutes', o.duration_minutes,
               'question_count', (select count(*) from public.questions q where q.exam_id = o.id),
               'starts_at', o.starts_at)
      from open_windows o
      where o.starts_at > now()
        and not exists (select 1 from open_windows l
                        where l.id = o.id and now() >= l.starts_at and now() < l.ends_at)
      order by o.starts_at
      limit 1
    ),
    'podium', (
      select jsonb_build_object(
               'exam_id', pe.id, 'title', pe.title, 'subject', pe.subject,
               'released_at', pe.released_at,
               'rows', (
                 select jsonb_agg(jsonb_build_object(
                          'rank', r.rank, 'name', private.short_name(p.full_name),
                          'score', r.score, 'max_score', r.max_score) order by r.rank, r.ord)
                 from (
                   select lb.user_id, lb.rank, lb.score, lb.max_score,
                          row_number() over (order by lb.rank, lb.time_taken_seconds, lb.attempt_id) as ord
                   from private.leaderboard lb
                   where lb.exam_id = pe.id and lb.rank <= 3
                 ) r
                 join public.profiles p on p.id = r.user_id
                 where r.ord <= 3))
      from podium_exam pe
    )
  );
$$;

revoke execute on function private.short_name(text) from public;
revoke execute on function public.public_home() from public;
grant execute on function public.public_home() to anon, authenticated;
