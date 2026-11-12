-- RULE: before every window of an exam has ended, a student can get NO score, percentage,
-- rank or leaderboard data — their own or anyone else's — by ANY route. Admins can.
-- Run: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures: exam with an OPEN window; two students submitted and graded.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('50000000-0000-0000-0000-000000000001', 'h1@t.local', '{"provider":"email"}', '{"full_name":"Hidden One"}'),
  ('50000000-0000-0000-0000-000000000002', 'h2@t.local', '{"provider":"email"}', '{"full_name":"Hidden Two"}'),
  ('50000000-0000-0000-0000-000000000003', 'h3@t.local', '{"provider":"email"}', '{"full_name":"Not Taken"}'),
  ('50000000-0000-0000-0000-00000000000a', 'ha@t.local', '{"provider":"email"}', '{"full_name":"Admin H"}');
update public.profiles set school = 'School H', stream = 'natural' where id::text like '50000000-%';
update public.profiles set role = 'admin' where id = '50000000-0000-0000-0000-00000000000a';
update public.profiles set telegram_username = 'hidden_one_tg' where id = '50000000-0000-0000-0000-000000000001';

insert into public.exams (id, title, subject, stream, duration_minutes, published_at) values
  ('51000000-0000-0000-0000-000000000001', 'H exam', 'Math', 'both', 60, now());
insert into public.exam_windows (id, exam_id, starts_at, ends_at) values
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
   now() - interval '1 hour', now() + interval '3 hours');
insert into public.questions (id, exam_id, position, body, options, points) values
  ('53000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 1, 'Q1', '["a","b","c","d"]', 1);
insert into public.answer_keys (question_id, correct_option) values ('53000000-0000-0000-0000-000000000001', 'A');

insert into public.attempts (id, exam_id, window_id, user_id, deadline_at) values
  ('54000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
   '52000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', now()),
  ('54000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001',
   '52000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', now());
insert into public.attempt_answers (attempt_id, question_id, selected_option) values
  ('54000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'A'),
  ('54000000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000001', 'B');
update public.attempts set submitted_at = now() + interval '5 minutes' where id::text like '54000000-%';
select private.grade_attempts('51000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Student who submitted, while the window is still open
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select set_config('t.r', public.get_my_result('51000000-0000-0000-0000-000000000001')::text, true);
select is((current_setting('t.r')::jsonb ->> 'released')::boolean, false, 'get_my_result: not released');
select ok(
  not (current_setting('t.r')::jsonb ?| array['score', 'max_score', 'rank', 'total', 'percentage',
                                               'time_taken_seconds', 'questions']),
  'get_my_result: NO score, max, rank, total, time or question review before close');
select is(position('correct' in current_setting('t.r')), 0, 'get_my_result: no correct answers before close');
select ok(current_setting('t.r')::jsonb ?& array['submitted_at', 'auto_submitted', 'release_at'],
  'get_my_result: only submitted-at / auto-submitted / release time');
select is((current_setting('t.r')::jsonb ->> 'release_at')::timestamptz, now() + interval '3 hours',
  'release time = end of the last window');

select throws_ok($$ select score from public.attempts $$, '42501', null,
  'student CANNOT read their own score column directly');
select throws_ok($$ select max_score from public.attempts $$, '42501', null,
  'student CANNOT read max_score directly');
select throws_ok($$ select * from public.attempts $$, '42501', null,
  'student CANNOT select * on attempts (it includes score)');
select lives_ok($$ select id, submitted_at, auto_submitted from public.attempts $$,
  'student can still read their non-score attempt columns');

select set_config('t.lb', public.get_leaderboard('51000000-0000-0000-0000-000000000001')::text, true);
select is((current_setting('t.lb')::jsonb ->> 'released')::boolean, false, 'get_leaderboard: not released');
select ok(not (current_setting('t.lb')::jsonb ?| array['rows', 'me', 'total']),
  'get_leaderboard: NO rows, own rank or participant count before close');

select set_config('t.d', (
  select x::text from jsonb_array_elements(public.student_dashboard() -> 'exams') x
  where x ->> 'id' = '51000000-0000-0000-0000-000000000001'), true);
select ok(
  not ((current_setting('t.d')::jsonb -> 'attempt') ?| array['score', 'max_score', 'rank', 'total'])
  and (current_setting('t.d')::jsonb ->> 'released')::boolean = false,
  'student_dashboard: NO score or rank before close');
select is((current_setting('t.d')::jsonb ->> 'results_at')::timestamptz, now() + interval '3 hours',
  'student_dashboard: tells when results are published');

select throws_ok($$ select * from private.leaderboard $$, '42501', null,
  'student CANNOT read the leaderboard view directly');
select throws_ok($$ select public.admin_exam_results('51000000-0000-0000-0000-000000000001') $$, '42501', null,
  'student CANNOT read scores through the admin results RPC');
select throws_ok($$ select public.admin_get_student('50000000-0000-0000-0000-000000000002') $$, '42501', null,
  'student CANNOT read a classmate''s attempt history');

-- A classmate who has not taken it yet can't see anyone's score either.
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select ok(not (public.get_leaderboard('51000000-0000-0000-0000-000000000001') ?| array['rows', 'me', 'total']),
  'other students CANNOT see anyone''s score or rank before close');
reset role;

select ok(
  not exists (select 1 from realtime.messages
              where topic = 'leaderboard:51000000-0000-0000-0000-000000000001'
                and payload ?| array['score', 'rank', 'max_score']),
  'Realtime pings carry no score data');

-- ---------------------------------------------------------------------------
-- Public landing page (anon): no podium for an open exam, never any identity
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$ select public.public_home() $$, 'public_home: callable by logged-out visitors');
select set_config('t.ph', public.public_home()::text, true);
select ok((current_setting('t.ph')::jsonb #>> '{podium,exam_id}') is distinct from '51000000-0000-0000-0000-000000000001',
  'public_home: NO podium for an exam that is still open');
select ok(position('Hidden' in current_setting('t.ph')) = 0 and position('School H' in current_setting('t.ph')) = 0
          and position('hidden_one_tg' in current_setting('t.ph')) = 0
          and position('50000000-' in current_setting('t.ph')) = 0,
  'public_home: no names, schools, Telegram usernames or user ids before close');
reset role;

-- ---------------------------------------------------------------------------
-- Admins see everything at any time
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('t.alb', public.get_leaderboard('51000000-0000-0000-0000-000000000001')::text, true);
select is((current_setting('t.alb')::jsonb ->> 'released')::boolean, true, 'admin: leaderboard available before close');
select results_eq(
  $$ select r ->> 'full_name', (r ->> 'rank')::int, (r ->> 'score')::int
     from jsonb_array_elements(current_setting('t.alb')::jsonb -> 'rows') r order by 2 $$,
  $$ values ('Hidden One', 1, 1), ('Hidden Two', 2, 0) $$,
  'admin: full ranking with scores before close');
reset role;

-- And once the window ends, the student gets everything.
update public.exam_windows set starts_at = now() - interval '5 hours', ends_at = now() - interval '1 second'
  where id = '52000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$ select (r ->> 'released')::boolean, (r ->> 'score')::int, (r ->> 'rank')::int
     from (select public.get_my_result('51000000-0000-0000-0000-000000000001') r) x $$,
  $$ values (true, 1, 1) $$,
  'after the last window ends the student sees score and rank');
reset role;

-- Released: the public podium shows first name + last initial only.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('t.ph', public.public_home()::text, true);
select results_eq(
  $$ select current_setting('t.ph')::jsonb #>> '{podium,exam_id}', r ->> 'name', (r ->> 'rank')::int, (r ->> 'score')::int
     from jsonb_array_elements(current_setting('t.ph')::jsonb #> '{podium,rows}') r order by 3 $$,
  $$ values ('51000000-0000-0000-0000-000000000001', 'Hidden O.', 1, 1),
            ('51000000-0000-0000-0000-000000000001', 'Hidden T.', 2, 0) $$,
  'public_home: podium of the latest released exam, short names only');
select ok(position('Hidden One' in current_setting('t.ph')) = 0 and position('Hidden Two' in current_setting('t.ph')) = 0
          and position('School H' in current_setting('t.ph')) = 0
          and position('hidden_one_tg' in current_setting('t.ph')) = 0
          and position('50000000-' in current_setting('t.ph')) = 0,
  'public_home: no full names, schools, Telegram usernames or user ids after release');
select throws_ok($$ select public.get_leaderboard('51000000-0000-0000-0000-000000000001') $$, 'P0001', 'not_authenticated',
  'anon CANNOT read the full leaderboard');
reset role;
select is(private.short_name('  Abebe   Kebede Tesfaye '), 'Abebe K.', 'short_name: first name + last initial');

select * from finish();
rollback;
