-- Phase 2: admin exam RPCs and the attempt deadline rule. Run: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'adm2@test.local', '{"provider":"email"}', '{"full_name":"Admin Two"}'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'st2@test.local',  '{"provider":"email"}', '{"full_name":"Student Two"}');
update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
update public.profiles set school = 'School Two', stream = 'natural' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Exam D: 30 min, window closes in 10 min -> deadline = window end.
-- Exam E: 30 min, window open for 1 day   -> deadline = start + 30 min.
-- Exam F: window already closed.
insert into public.exams (id, title, subject, stream, duration_minutes, published_at) values
  ('dddddddd-0000-0000-0000-00000000000d', 'Short window', 'Math', 'both', 30, now()),
  ('dddddddd-0000-0000-0000-00000000000e', 'Long window',  'Math', 'both', 30, now()),
  ('dddddddd-0000-0000-0000-00000000000f', 'Closed',       'Math', 'both', 30, now());
insert into public.exam_windows (id, exam_id, starts_at, ends_at) values
  ('eeeeeeee-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-00000000000d', now() - interval '2 hours', now() + interval '10 minutes'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'dddddddd-0000-0000-0000-00000000000e', now() - interval '1 hour',  now() + interval '1 day'),
  ('eeeeeeee-0000-0000-0000-00000000000f', 'dddddddd-0000-0000-0000-00000000000f', now() - interval '2 days',  now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- deadline_at = least(started_at + duration, window.ends_at), computed by the DB
-- ---------------------------------------------------------------------------
insert into public.attempts (id, exam_id, window_id, user_id, started_at, deadline_at) values
  ('ffffffff-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-00000000000d',
   'eeeeeeee-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001',
   now() - interval '5 hours', now() + interval '10 years'),       -- bogus values must be ignored
  ('ffffffff-0000-0000-0000-00000000000e', 'dddddddd-0000-0000-0000-00000000000e',
   'eeeeeeee-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001',
   now() - interval '5 hours', now() + interval '10 years');

select is(
  (select deadline_at from public.attempts where id = 'ffffffff-0000-0000-0000-00000000000d'),
  now() + interval '10 minutes',
  'deadline = window end when the window closes before the duration is up');
select is(
  (select deadline_at from public.attempts where id = 'ffffffff-0000-0000-0000-00000000000e'),
  now() + interval '30 minutes',
  'deadline = started_at + duration when the window is long enough');
select is(
  (select started_at from public.attempts where id = 'ffffffff-0000-0000-0000-00000000000e'),
  now(), 'started_at is the server clock, not the supplied value');
select throws_ok(
  $$ insert into public.attempts (exam_id, window_id, user_id, deadline_at)
     values ('dddddddd-0000-0000-0000-00000000000f', 'eeeeeeee-0000-0000-0000-00000000000f',
             'aaaaaaaa-0000-0000-0000-000000000001', now()) $$,
  '55000', 'Exam window is not open', 'cannot start an attempt in a closed window');
select throws_ok(
  $$ insert into public.attempts (exam_id, window_id, user_id, deadline_at)
     values ('dddddddd-0000-0000-0000-00000000000f', 'eeeeeeee-0000-0000-0000-00000000000e',
             'aaaaaaaa-0000-0000-0000-000000000001', now()) $$,
  '23503', 'Window does not belong to this exam', 'cannot use another exam''s window');
select throws_ok(
  $$ update public.attempts set deadline_at = deadline_at + interval '1 hour'
     where id = 'ffffffff-0000-0000-0000-00000000000e' $$,
  '42501', 'Attempt identity and timing cannot be changed', 'deadline cannot be extended afterwards');

-- ---------------------------------------------------------------------------
-- Student cannot use admin RPCs
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select public.create_exam('{}'::jsonb) $$, '42501', 'Admin only',
  'student CANNOT create exams');
select throws_ok($$ select public.admin_get_exam('dddddddd-0000-0000-0000-00000000000e') $$, '42501', 'Admin only',
  'student CANNOT read an exam with its answers');
select throws_ok($$ select * from public.admin_list_exams() $$, '42501', 'Admin only',
  'student CANNOT list exams through the admin RPC');
select throws_ok(
  $$ select public.update_answer_keys('dddddddd-0000-0000-0000-00000000000e', '[]'::jsonb) $$,
  '42501', 'Admin only', 'student CANNOT change answer keys');
reset role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ select public.create_exam('{
       "title":"Bad exam","subject":"Math","stream":"natural","duration_minutes":30,
       "questions":[{"body":"Q","options":["a","b","c"],"correct_option":"A"},
                    {"body":"","options":["a","b","c","d"]}]}'::jsonb) $$,
  '22023', null, 'create_exam rejects 3 options, empty question and missing answer');
select throws_ok(
  $$ select public.create_exam('{
       "title":"No window","subject":"Math","stream":"natural","duration_minutes":30,"publish":true,
       "questions":[{"body":"Q","options":["a","b","c","d"],"correct_option":"A"}]}'::jsonb) $$,
  '22023', null, 'publishing requires a window');
select throws_ok(
  $$ select public.create_exam(jsonb_build_object(
       'title','Too short','subject','Math','stream','natural','duration_minutes',120,'publish',true,
       'window', jsonb_build_object('starts_at', now() + interval '1 hour', 'ends_at', now() + interval '2 hours'),
       'questions', '[{"body":"Q","options":["a","b","c","d"],"correct_option":"A"}]'::jsonb)) $$,
  '22023', null, 'window shorter than the duration is rejected');

select isnt(
  set_config('t.exam', public.create_exam(jsonb_build_object(
    'title','Biology Model 1','subject','Biology','stream','natural','duration_minutes',30,'publish',true,
    'window', jsonb_build_object('starts_at', now() - interval '1 hour', 'ends_at', now() + interval '1 day'),
    'questions', '[{"body":"Q1","options":[" a ","b","c","d"],"correct_option":"B","points":2},
                   {"body":"Q2","options":["a","b","c","d"],"correct_option":"D"}]'::jsonb))::text, true),
  null, 'admin creates and publishes a valid exam');

select is(
  public.admin_get_exam(current_setting('t.exam')::uuid) -> 'questions' -> 0 ->> 'correct_option',
  'B', 'admin_get_exam returns questions WITH correct answers');
select is(
  public.admin_get_exam(current_setting('t.exam')::uuid) -> 'questions' -> 0 -> 'options' ->> 0,
  'a', 'options are trimmed');
select is(
  (select status::text from public.admin_list_exams() where id = current_setting('t.exam')::uuid),
  'live', 'admin_list_exams reports the derived status');

select lives_ok(
  $$ select public.update_exam(current_setting('t.exam')::uuid, jsonb_build_object(
       'title','Biology Model 1 (edited)','subject','Biology','stream','natural','duration_minutes',30,'publish',true,
       'window', jsonb_build_object('starts_at', now() - interval '1 hour', 'ends_at', now() + interval '1 day'),
       'questions', (public.admin_get_exam(current_setting('t.exam')::uuid) -> 'questions'))) $$,
  'update_exam works while there are no attempts');
reset role;

-- A student attempt on the admin-created exam: answered Q1 = 'C' (wrong), submitted.
insert into public.attempts (id, exam_id, window_id, user_id, deadline_at)
select '99999999-0000-0000-0000-000000000001', e.id, w.id, 'aaaaaaaa-0000-0000-0000-000000000001', now()
from public.exams e join public.exam_windows w on w.exam_id = e.id
where e.id = current_setting('t.exam')::uuid;
insert into public.attempt_answers (attempt_id, question_id, selected_option)
select '99999999-0000-0000-0000-000000000001', q.id, 'C'
from public.questions q where q.exam_id = current_setting('t.exam')::uuid and q.position = 1;
update public.attempts set submitted_at = now() where id = '99999999-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ select public.update_exam(current_setting('t.exam')::uuid, jsonb_build_object(
       'title','Changed','subject','Biology','stream','natural','duration_minutes',30,
       'questions', (public.admin_get_exam(current_setting('t.exam')::uuid) -> 'questions'))) $$,
  '55000', null, 'update_exam is blocked once an attempt exists');
select throws_ok(
  $$ select public.delete_exam(current_setting('t.exam')::uuid) $$,
  '55000', null, 'delete_exam is blocked once an attempt exists');

select is(
  public.update_answer_keys(
    current_setting('t.exam')::uuid,
    jsonb_build_array(jsonb_build_object(
      'question_id', public.admin_get_exam(current_setting('t.exam')::uuid) -> 'questions' -> 0 ->> 'id',
      'correct_option', 'C'))) ->> 'regraded',
  '1', 'fixing an answer key after attempts is allowed and re-grades');
reset role;
select is(
  (select score from public.attempts where id = '99999999-0000-0000-0000-000000000001'),
  2, 're-graded score reflects the corrected key (Q1 worth 2 points)');

select * from finish();
rollback;
