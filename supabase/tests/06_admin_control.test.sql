-- Phase 5: admin control. Run: npm run db:test
-- Students can't call admin functions or see others' data; a ban blocks a student mid-exam;
-- windows can change only BEFORE release; re-exams / requests / retakes follow CLAUDE.md.
begin;
create extension if not exists pgtap with schema extensions;

select plan(67);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('60000000-0000-0000-0000-000000000001', 's1@t.local', '{"provider":"email"}', '{"full_name":"Took It"}'),
  ('60000000-0000-0000-0000-000000000002', 's2@t.local', '{"provider":"email"}', '{"full_name":"Writing Now"}'),
  ('60000000-0000-0000-0000-000000000003', 's3@t.local', '{"provider":"email"}', '{"full_name":"Missed It"}'),
  ('60000000-0000-0000-0000-000000000004', 's4@t.local', '{"provider":"email"}', '{"full_name":"Also Missed"}'),
  ('60000000-0000-0000-0000-000000000005', 's5@t.local', '{"provider":"email"}', '{"full_name":"Third Missed"}'),
  ('60000000-0000-0000-0000-00000000000a', 'a6@t.local', '{"provider":"email"}', '{"full_name":"Admin Six"}');
update public.profiles set school = 'School Six', stream = 'natural' where id::text like '60000000-%';
update public.profiles set role = 'admin' where id = '60000000-0000-0000-0000-00000000000a';

-- Exam A: window open now, closes in 10 minutes (shorter than the 60-minute duration).
insert into public.exams (id, title, subject, stream, duration_minutes, published_at) values
  ('61000000-0000-0000-0000-000000000001', 'A exam', 'Math', 'both', 60, now() - interval '1 day'),
  ('61000000-0000-0000-0000-000000000002', 'B exam', 'Math', 'both', 60, now() - interval '1 day');
insert into public.exam_windows (id, exam_id, starts_at, ends_at) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001',
   now() - interval '30 minutes', now() + interval '10 minutes'),
  ('62000000-0000-0000-0000-000000000009', '61000000-0000-0000-0000-000000000002',
   now() + interval '1 day', now() + interval '2 days');
insert into public.questions (id, exam_id, position, body, options, points) values
  ('63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 1, 'Q1', '["q1a","q1b","q1c","q1d"]', 1),
  ('63000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001', 2, 'Q2', '["q2a","q2b","q2c","q2d"]', 1),
  ('63000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000001', 3, 'Q3', '["q3a","q3b","q3c","q3d"]', 2);
insert into public.answer_keys (question_id, correct_option) values
  ('63000000-0000-0000-0000-000000000001', 'A'),
  ('63000000-0000-0000-0000-000000000002', 'B'),
  ('63000000-0000-0000-0000-000000000003', 'D');

-- s1 took and submitted A; s2 is writing it right now.
insert into public.attempts (id, exam_id, window_id, user_id, deadline_at) values
  ('64000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001',
   '62000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', now()),
  ('64000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001',
   '62000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', now());
insert into public.attempt_answers (attempt_id, question_id, selected_option) values
  ('64000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', 'A'),
  ('64000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000002', 'C');
update public.attempts set submitted_at = now() + interval '5 minutes' where id = '64000000-0000-0000-0000-000000000001';
select private.grade_attempts('61000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Students can't call admin functions or read admin data
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select throws_ok($$ select public.admin_set_ban('60000000-0000-0000-0000-000000000001', true, 'nope nope') $$,
  '42501', null, 'student CANNOT ban');
select throws_ok($$ select public.admin_list_students() $$, '42501', null, 'student CANNOT list students');
select throws_ok($$ select public.admin_get_student('60000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'student CANNOT read another student''s detail');
select throws_ok($$ select public.admin_exam_results('61000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'student CANNOT read admin results');
select throws_ok($$ select public.admin_extend_window('62000000-0000-0000-0000-000000000001', now() + interval '5 hours') $$,
  '42501', null, 'student CANNOT extend a window');
select throws_ok($$ select public.admin_add_window('61000000-0000-0000-0000-000000000001', now(), now() + interval '2 hours') $$,
  '42501', null, 'student CANNOT add a window');
select throws_ok($$ select public.admin_grant_retake('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'student CANNOT grant themselves a retake');
select throws_ok($$ select public.admin_create_reexam('61000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'student CANNOT create a re-exam');
select throws_ok($$ select public.admin_list_reexam_requests() $$, '42501', null, 'student CANNOT list requests');
select throws_ok($$ select public.admin_overview() $$, '42501', null, 'student CANNOT read the admin overview');
select throws_ok($$ select public.admin_update_profile('60000000-0000-0000-0000-000000000003', null, null, 'social') $$,
  '42501', null, 'student CANNOT change their stream through the admin RPC');
select throws_ok($$ insert into public.reexam_requests (exam_id, reason) values ('61000000-0000-0000-0000-000000000001', 'direct insert') $$,
  '42501', null, 'student CANNOT insert a request directly (only via request_reexam)');
select throws_ok($$ select public.request_reexam('61000000-0000-0000-0000-000000000001', 'I was sick that day') $$,
  'P0001', 'not_closed', 'no re-exam request while the exam is still open');
reset role;

-- ---------------------------------------------------------------------------
-- Windows BEFORE release (as admin)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is(
  (public.admin_extend_window('62000000-0000-0000-0000-000000000001', now() + interval '2 hours') ->> 'extended_attempts')::int,
  1, 'extend window: the capped open attempt is extended');
select throws_ok($$ select public.admin_extend_window('62000000-0000-0000-0000-000000000001', now() + interval '1 hour') $$,
  '22023', null, 'extend window: cannot shorten');
select set_config('t.w2', public.admin_add_window('61000000-0000-0000-0000-000000000001',
  now() + interval '3 hours', now() + interval '5 hours', array['60000000-0000-0000-0000-000000000004']::uuid[])::text, true);
select throws_ok($$ select public.admin_add_window('61000000-0000-0000-0000-000000000001',
  now() + interval '4 hours', now() + interval '6 hours') $$, '23P01', null, 'add window: overlap rejected');
select throws_ok($$ select public.admin_add_window('61000000-0000-0000-0000-000000000001',
  now() + interval '10 hours', now() + interval '10 hours 30 minutes') $$, '22023', null,
  'add window: shorter than the duration rejected');

select lives_ok($$ select public.admin_grant_retake('61000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001', 'power cut') $$, 'retake granted before release');
select throws_ok($$ select public.admin_grant_retake('61000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001') $$, '55000', null, 'only one unused retake per student and exam');
select throws_ok($$ select public.admin_grant_retake('61000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000003') $$, '55000', null, 'no retake for a student who has not taken it');
select throws_ok($$ select public.admin_grant_retake('61000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000002') $$, '55000', null, 'no retake while the student is writing');
select throws_ok($$ select public.admin_create_reexam('61000000-0000-0000-0000-000000000001') $$,
  '55000', null, 'no re-exam before results are released');
reset role;

select is((select deadline_at from public.attempts where id = '64000000-0000-0000-0000-000000000002'),
  now() + interval '60 minutes', 'extended attempt now gets its full 60 minutes');

-- Restricted window is visible only to the selected student.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.exam_windows where exam_id = '61000000-0000-0000-0000-000000000001'),
  1, 'other students do not see the restricted window');
select is((select count(*)::int from public.admin_audit_log), 0, 'student CANNOT read the audit log');
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.exam_windows where exam_id = '61000000-0000-0000-0000-000000000001'),
  2, 'the selected student sees the restricted window');
reset role;

-- ---------------------------------------------------------------------------
-- Ban mid-exam
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.admin_set_ban('60000000-0000-0000-0000-000000000002', true, '') $$,
  '22023', null, 'ban needs a reason');
select throws_ok($$ select public.admin_set_ban('60000000-0000-0000-0000-00000000000a', true, 'self ban') $$,
  '42501', null, 'admin cannot ban themselves');
select is(jsonb_array_length(public.admin_set_ban('60000000-0000-0000-0000-000000000002', true, 'Phone in exam') -> 'closed_attempts'),
  1, 'ban closes the student''s open attempt');

select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.save_answers('64000000-0000-0000-0000-000000000002',
  '[{"question_id":"63000000-0000-0000-0000-000000000001","selected_option":"A"}]') $$,
  'P0001', 'banned', 'banned student mid-exam CANNOT save');
select throws_ok($$ select public.submit_exam('64000000-0000-0000-0000-000000000002', null) $$,
  'P0001', 'banned', 'banned student mid-exam CANNOT submit');
select throws_ok($$ select public.start_exam('61000000-0000-0000-0000-000000000001') $$,
  'P0001', 'banned', 'banned student CANNOT start or resume');
reset role;

select results_eq(
  $$ select submitted_at is not null, auto_submitted from public.attempts where id = '64000000-0000-0000-0000-000000000002' $$,
  $$ values (true, true) $$, 'the banned student''s attempt was closed as auto-submitted');
select results_eq(
  $$ select is_banned, ban_reason from public.profiles where id = '60000000-0000-0000-0000-000000000002' $$,
  $$ values (true, 'Phone in exam') $$, 'profile is banned with the reason');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$ select public.admin_set_ban('60000000-0000-0000-0000-000000000002', false) $$, 'unban');
reset role;
select results_eq(
  $$ select is_banned, banned_at is null, ban_reason is null from public.profiles where id = '60000000-0000-0000-0000-000000000002' $$,
  $$ values (false, true, true) $$, 'unban clears the ban fields');

-- ---------------------------------------------------------------------------
-- Release: the restricted window is removed and the main one ends.
-- ---------------------------------------------------------------------------
delete from public.exam_windows where id = current_setting('t.w2')::uuid;
update public.exam_windows set starts_at = now() - interval '5 hours', ends_at = now() - interval '1 minute'
  where id = '62000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.admin_extend_window('62000000-0000-0000-0000-000000000001', now() + interval '1 hour') $$,
  '55000', null, 'after release: extending a window is blocked');
select throws_ok($$ select public.admin_add_window('61000000-0000-0000-0000-000000000001',
  now() + interval '1 hour', now() + interval '3 hours') $$, '55000', null, 'after release: adding a window is blocked');
select throws_ok($$ select public.admin_grant_retake('61000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000002') $$, '55000', null, 'after release: no retake grants');
reset role;

-- Backstop: even code running as the table owner cannot reopen a released exam.
select throws_ok($$ insert into public.exam_windows (exam_id, starts_at, ends_at)
  values ('61000000-0000-0000-0000-000000000001', now() + interval '1 hour', now() + interval '3 hours') $$,
  '55000', 'results_released', 'after release: direct window insert is blocked (trigger)');
select throws_ok($$ update public.exam_windows set ends_at = now() + interval '1 hour'
  where id = '62000000-0000-0000-0000-000000000001' $$,
  '55000', 'results_released', 'after release: direct window update is blocked (trigger)');

-- ---------------------------------------------------------------------------
-- Re-exam requests
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.request_reexam('61000000-0000-0000-0000-000000000001', 'I want a better score') $$,
  'P0001', 'already_taken', 'a student who took the exam cannot request a re-exam');

select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.request_reexam('61000000-0000-0000-0000-000000000001', 'sick') $$,
  'P0001', 'invalid_reason', 'reason must be at least 5 characters');
select set_config('t.req3', public.request_reexam('61000000-0000-0000-0000-000000000001', 'I was in hospital') ->> 'id', true);
select throws_ok($$ select public.request_reexam('61000000-0000-0000-0000-000000000001', 'Asking a second time') $$,
  'P0001', 'request_pending', 'one pending request per exam');
select results_eq(
  $$ select x -> 'reexam_request' ->> 'status', (x ->> 'can_request_reexam')::boolean
     from jsonb_array_elements(public.student_dashboard() -> 'exams') x
     where x ->> 'id' = '61000000-0000-0000-0000-000000000001' $$,
  $$ values ('pending', false) $$, 'dashboard shows the pending request');

select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select set_config('t.req4', public.request_reexam('61000000-0000-0000-0000-000000000001', 'Network was down') ->> 'id', true);
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select set_config('t.req5', public.request_reexam('61000000-0000-0000-0000-000000000001', 'Forgot the date') ->> 'id', true);
select is((select count(*)::int from public.reexam_requests), 1, 'a student sees only their own requests');

-- Admin reviews.
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.admin_create_reexam('61000000-0000-0000-0000-000000000002') $$,
  '55000', null, 'no re-exam for an exam that is not released');
select set_config('t.rev3', public.admin_review_reexam_request(current_setting('t.req3')::uuid, true, 'OK')::text, true);
select is((current_setting('t.rev3')::jsonb ->> 'created_reexam')::boolean, true, 'first approval creates a re-exam');
select set_config('t.rx', current_setting('t.rev3')::jsonb ->> 'reexam_id', true);
select is(public.admin_review_reexam_request(current_setting('t.req4')::uuid, true) ->> 'reexam_id',
  current_setting('t.rx'), 'second approval joins the same unreleased re-exam');
select lives_ok($$ select public.admin_review_reexam_request(current_setting('t.req5')::uuid, false, 'No proof given') $$,
  'reject with a note');
select throws_ok($$ select public.admin_review_reexam_request(current_setting('t.req5')::uuid, true) $$,
  '55000', null, 'a reviewed request cannot be reviewed again');
reset role;

-- The re-exam: draft copy, shuffled, keys remapped, original untouched.
select results_eq(
  $$ select published_at is null, reexam_of from public.exams where id = current_setting('t.rx')::uuid $$,
  $$ values (true, '61000000-0000-0000-0000-000000000001'::uuid) $$, 're-exam starts as a draft linked to the original');
select is((select count(*)::int from public.questions where exam_id = current_setting('t.rx')::uuid), 3,
  're-exam has every question');
select is(
  (select count(*)::int
   from public.questions rq
   join public.answer_keys rk on rk.question_id = rq.id
   join public.questions oq on oq.exam_id = '61000000-0000-0000-0000-000000000001' and oq.body = rq.body
   join public.answer_keys ok on ok.question_id = oq.id
   where rq.exam_id = current_setting('t.rx')::uuid
     and rq.options ->> (ascii(rk.correct_option::text) - 65) = oq.options ->> (ascii(ok.correct_option::text) - 65)
     and (select array_agg(x order by x) from jsonb_array_elements_text(rq.options) x)
       = (select array_agg(x order by x) from jsonb_array_elements_text(oq.options) x)),
  3, 'every remapped key points at the same correct option text, with the same options');
select results_eq(
  $$ select q.position, q.body, q.options, k.correct_option::text from public.questions q
     join public.answer_keys k on k.question_id = q.id
     where q.exam_id = '61000000-0000-0000-0000-000000000001' order by q.position $$,
  $$ values (1, 'Q1', '["q1a","q1b","q1c","q1d"]'::jsonb, 'A'), (2, 'Q2', '["q2a","q2b","q2c","q2d"]'::jsonb, 'B'),
            (3, 'Q3', '["q3a","q3b","q3c","q3d"]'::jsonb, 'D') $$,
  'the original exam is untouched');
select set_eq(
  $$ select user_id from public.reexam_students where exam_id = current_setting('t.rx')::uuid $$,
  $$ values ('60000000-0000-0000-0000-000000000003'::uuid), ('60000000-0000-0000-0000-000000000004'::uuid) $$,
  'only the approved students are on the re-exam');

-- Publish the re-exam with an open window (as the editor would).
update public.exams set published_at = now() - interval '1 minute' where id = current_setting('t.rx')::uuid;
insert into public.exam_windows (exam_id, starts_at, ends_at)
values (current_setting('t.rx')::uuid, now() - interval '1 minute', now() + interval '2 hours');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.exams where id = current_setting('t.rx')::uuid), 0,
  'an unapproved student CANNOT see the re-exam');
select ok(not exists (select 1 from jsonb_array_elements(public.student_dashboard() -> 'exams') x
                      where x ->> 'id' = current_setting('t.rx')),
  'the re-exam is not on an unapproved student''s dashboard');
select throws_ok($$ select public.start_exam(current_setting('t.rx')::uuid) $$,
  'P0001', 'exam_not_found', 'an unapproved student CANNOT start the re-exam');
select results_eq(
  $$ select x -> 'reexam_request' ->> 'status', x -> 'reexam_request' ->> 'admin_note'
     from jsonb_array_elements(public.student_dashboard() -> 'exams') x
     where x ->> 'id' = '61000000-0000-0000-0000-000000000001' $$,
  $$ values ('rejected', 'No proof given') $$, 'the rejected student sees the status and note');

select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select ok(exists (select 1 from jsonb_array_elements(public.student_dashboard() -> 'exams') x
                  where x ->> 'id' = current_setting('t.rx') and (x ->> 'is_reexam')::boolean),
  'the approved student sees the re-exam');
select set_config('t.att', public.start_exam(current_setting('t.rx')::uuid) ->> 'attempt_id', true);
select lives_ok($$ select public.submit_exam(current_setting('t.att')::uuid, null) $$, 'the approved student takes the re-exam');
reset role;

-- Separate results: the re-exam attempt is not on the original's leaderboard.
select is((select count(*)::int from private.leaderboard
           where exam_id = '61000000-0000-0000-0000-000000000001'
             and user_id = '60000000-0000-0000-0000-000000000003'), 0,
  'the re-exam result is not on the original leaderboard');
select is((select count(*)::int from private.leaderboard where exam_id = current_setting('t.rx')::uuid), 1,
  'the re-exam has its own leaderboard');

-- ---------------------------------------------------------------------------
-- Admin results and audit
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('t.res', public.admin_exam_results('61000000-0000-0000-0000-000000000001')::text, true);
select is(jsonb_array_length(current_setting('t.res')::jsonb -> 'rows'), 2, 'admin results: one row per student');
select results_eq(
  $$ select (q ->> 'position')::int, (q ->> 'correct')::int, (q -> 'counts' ->> 'C')::int
     from jsonb_array_elements(current_setting('t.res')::jsonb -> 'questions') q order by 1 $$,
  $$ values (1, 1, 0), (2, 0, 1), (3, 0, 0) $$, 'admin results: per-question correct counts and choices');
reset role;

select set_eq(
  $$ select action from public.admin_audit_log $$,
  $$ values ('window_extend'), ('window_add'), ('retake_grant'), ('ban'), ('unban'),
            ('reexam_create'), ('reexam_approve'), ('reexam_reject') $$,
  'every admin action was audited');

select * from finish();
rollback;
