-- Phase 4: results and leaderboard AFTER the exam has closed. Run: npm run db:test
-- (What students can NOT see before close is covered by 05_results_hidden.test.sql.)
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('40000000-0000-0000-0000-000000000001', 'fast@t.local',   '{"provider":"email"}', '{"full_name":"Fast Three"}'),
  ('40000000-0000-0000-0000-000000000002', 'slow@t.local',   '{"provider":"email"}', '{"full_name":"Slow Three"}'),
  ('40000000-0000-0000-0000-000000000003', 'low@t.local',    '{"provider":"email"}', '{"full_name":"Low One"}'),
  ('40000000-0000-0000-0000-000000000004', 'banned@t.local', '{"provider":"email"}', '{"full_name":"Banned Top"}'),
  ('40000000-0000-0000-0000-000000000005', 'none@t.local',   '{"provider":"email"}', '{"full_name":"No Attempt"}'),
  ('40000000-0000-0000-0000-000000000006', 'soc@t.local',    '{"provider":"email"}', '{"full_name":"Social Six"}'),
  ('40000000-0000-0000-0000-00000000000a', 'adm@t.local',    '{"provider":"email"}', '{"full_name":"Admin Ten"}');
update public.profiles set school = 'School L', stream = 'natural'
  where id::text like '40000000-0000-0000-0000-00000000000%' and id <> '40000000-0000-0000-0000-000000000006';
update public.profiles set school = 'School S', stream = 'social' where id = '40000000-0000-0000-0000-000000000006';
update public.profiles set role = 'admin' where id = '40000000-0000-0000-0000-00000000000a';

insert into public.exams (id, title, subject, stream, duration_minutes, published_at) values
  ('41000000-0000-0000-0000-000000000001', 'L exam', 'Math', 'natural', 60, now());
insert into public.exam_windows (id, exam_id, starts_at, ends_at) values
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001',
   now() - interval '1 hour', now() + interval '1 day');
insert into public.questions (id, exam_id, position, body, options, points) values
  ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 1, 'Q1', '["a","b","c","d"]', 2),
  ('43000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', 2, 'Q2', '["a","b","c","d"]', 1);
insert into public.answer_keys (question_id, correct_option) values
  ('43000000-0000-0000-0000-000000000001', 'B'),
  ('43000000-0000-0000-0000-000000000002', 'C');

-- Attempts (the deadline trigger sets started_at = now()).
insert into public.attempts (id, exam_id, window_id, user_id, deadline_at)
select ('44000000-0000-0000-0000-00000000000' || n)::uuid, '41000000-0000-0000-0000-000000000001',
       '42000000-0000-0000-0000-000000000001', ('40000000-0000-0000-0000-00000000000' || n)::uuid, now()
from generate_series(1, 4) n;
insert into public.attempts (id, exam_id, window_id, user_id, deadline_at) values
  ('44000000-0000-0000-0000-00000000000a', '41000000-0000-0000-0000-000000000001',
   '42000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-00000000000a', now());

-- fast/slow/banned/admin get both right (3 pts), low gets Q2 only (1 pt).
insert into public.attempt_answers (attempt_id, question_id, selected_option)
select a.id, q.id, k.correct_option
from public.attempts a
cross join public.questions q
join public.answer_keys k on k.question_id = q.id
where a.exam_id = '41000000-0000-0000-0000-000000000001'
  and (a.user_id <> '40000000-0000-0000-0000-000000000003' or q.position = 2);

update public.attempts set submitted_at = now() + interval '10 minutes'
  where id in ('44000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000004',
               '44000000-0000-0000-0000-00000000000a');
update public.attempts set submitted_at = now() + interval '20 minutes' where id = '44000000-0000-0000-0000-000000000002';
update public.attempts set submitted_at = now() + interval '30 minutes' where id = '44000000-0000-0000-0000-000000000003';
select private.grade_attempts('41000000-0000-0000-0000-000000000001');
update public.profiles set is_banned = true where id = '40000000-0000-0000-0000-000000000004';

select ok(
  exists (select 1 from realtime.messages
          where topic = 'leaderboard:41000000-0000-0000-0000-000000000001' and event = 'changed'),
  'submitting broadcasts a content-free leaderboard ping');

-- Close the exam (its only window ends).
update public.exam_windows set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 minute'
  where id = '42000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Student results after close
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select set_config('t.r', public.get_my_result('41000000-0000-0000-0000-000000000001')::text, true);

select results_eq(
  $$ select (r ->> 'score')::int, (r ->> 'max_score')::int, (r ->> 'rank')::int, (r ->> 'total')::int,
            (r ->> 'released')::boolean
     from (select current_setting('t.r')::jsonb r) x $$,
  $$ values (3, 3, 2, 3, true) $$,
  'after close: score, max, rank (2nd: same score, slower) of 3 ranked students');

select set_config('t.lb', public.get_leaderboard('41000000-0000-0000-0000-000000000001')::text, true);
select results_eq(
  $$ select r ->> 'full_name', (r ->> 'rank')::int
     from jsonb_array_elements(current_setting('t.lb')::jsonb -> 'rows') r
     order by (r ->> 'rank')::int $$,
  $$ values ('Fast Three', 1), ('Slow Three', 2), ('Low One', 3) $$,
  'leaderboard: score desc, then time asc; banned and admin excluded');
select is((current_setting('t.lb')::jsonb -> 'me' ->> 'rank')::int, 2, 'own position is returned (pinned)');
select is(position('user_id' in current_setting('t.lb')), 0, 'leaderboard exposes no user ids');
select is(position('40000000' in current_setting('t.lb')), 0, 'leaderboard leaks no ids at all');

select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$ select q ->> 'correct_option', (q ->> 'is_correct')::boolean, q ->> 'selected_option'
     from jsonb_array_elements(public.get_my_result('41000000-0000-0000-0000-000000000001') -> 'questions') q
     order by (q ->> 'position')::int $$,
  $$ values ('B', false, null), ('C', true, 'C') $$,
  'after close: correct answers, right/wrong and own choices per question');
select is(
  (select (x -> 'attempt' ->> 'rank')::int from jsonb_array_elements(public.student_dashboard() -> 'exams') x
   where x ->> 'id' = '41000000-0000-0000-0000-000000000001'),
  3, 'dashboard includes the student''s rank after close');

select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok($$ select public.get_my_result('41000000-0000-0000-0000-000000000001') $$,
  'P0001', 'no_result', 'no result for a student who did not submit');
select is((public.get_leaderboard('41000000-0000-0000-0000-000000000001') -> 'me'), 'null'::jsonb,
  'non-participant can view the released leaderboard but has no own row');

select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$ select public.get_leaderboard('41000000-0000-0000-0000-000000000001') $$,
  'P0001', 'exam_not_found', 'other-stream student CANNOT see this leaderboard');

select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$ select public.get_my_result('41000000-0000-0000-0000-000000000001') $$,
  'P0001', 'banned', 'banned student CANNOT read results');
select throws_ok($$ select * from private.leaderboard $$, '42501', null,
  'leaderboard view is not directly readable');
reset role;

-- ---------------------------------------------------------------------------
-- Released results are never hidden again: no new window after release (Phase 5 rule;
-- re-exams are separate exams). Window changes before release: 06_admin_control.
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.exam_windows (exam_id, starts_at, ends_at, is_reopen, restricted)
  values ('41000000-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '2 days', true, true) $$,
  '55000', 'results_released', 'after release: a reopen window cannot be added');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select set_config('t.r3', public.get_my_result('41000000-0000-0000-0000-000000000001')::text, true);
select is((current_setting('t.r3')::jsonb ->> 'released')::boolean, true, 'results stay released');
select ok(current_setting('t.r3')::jsonb ?& array['score', 'rank', 'questions'],
  'score, rank and answers stay visible');
reset role;

select * from finish();
rollback;
