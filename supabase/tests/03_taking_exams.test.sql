-- Phase 3: start / save / submit / auto-submit. Run: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('30000000-0000-0000-0000-000000000001', 's1@t.local', '{"provider":"email"}', '{"full_name":"Nat One"}'),
  ('30000000-0000-0000-0000-000000000002', 's2@t.local', '{"provider":"email"}', '{"full_name":"Nat Two"}'),
  ('30000000-0000-0000-0000-000000000003', 's3@t.local', '{"provider":"email"}', '{"full_name":"Banned Nat"}'),
  ('30000000-0000-0000-0000-000000000004', 's4@t.local', '{"provider":"email"}', '{}'),
  ('30000000-0000-0000-0000-000000000005', 's5@t.local', '{"provider":"email"}', '{"full_name":"Soc Five"}');
update public.profiles set school = 'School X', stream = 'natural'
  where id in ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
               '30000000-0000-0000-0000-000000000003');
update public.profiles set is_banned = true where id = '30000000-0000-0000-0000-000000000003';
update public.profiles set school = 'School Y', stream = 'social' where id = '30000000-0000-0000-0000-000000000005';

insert into public.exams (id, title, subject, stream, duration_minutes, published_at) values
  ('31000000-0000-0000-0000-000000000001', 'X live',       'Math',    'natural', 30, now()),
  ('31000000-0000-0000-0000-000000000002', 'Y scheduled',  'Physics', 'natural', 30, now()),
  ('31000000-0000-0000-0000-000000000003', 'Z draft',      'Chem',    'natural', 30, null),
  ('31000000-0000-0000-0000-000000000004', 'R restricted', 'Bio',     'natural', 30, now());
insert into public.exam_windows (id, exam_id, starts_at, ends_at, restricted) values
  ('32000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 day', false),
  ('32000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', now() + interval '1 day',  now() + interval '2 days', false),
  ('32000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000003', now() - interval '1 hour', now() + interval '1 day', false),
  ('32000000-0000-0000-0000-000000000004', '31000000-0000-0000-0000-000000000004', now() - interval '1 hour', now() + interval '1 day', true);
insert into public.questions (id, exam_id, position, body, options, points) values
  ('33000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 1, 'Q1', '["a","b","c","d"]', 2),
  ('33000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', 2, 'Q2', '["a","b","c","d"]', 1),
  ('33000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000001', 3, 'Q3', '["a","b","c","d"]', 1),
  ('33000000-0000-0000-0000-000000000009', '31000000-0000-0000-0000-000000000002', 1, 'Y1', '["a","b","c","d"]', 1);
insert into public.answer_keys (question_id, correct_option) values
  ('33000000-0000-0000-0000-000000000001', 'B'),
  ('33000000-0000-0000-0000-000000000002', 'C'),
  ('33000000-0000-0000-0000-000000000003', 'A'),
  ('33000000-0000-0000-0000-000000000009', 'A');

-- ---------------------------------------------------------------------------
-- Student 2 starts X (used later for the cross-user and late-submit tests)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select isnt(set_config('t.a2', public.start_exam('31000000-0000-0000-0000-000000000001') ->> 'attempt_id', true),
            null, 'student 2 starts the live exam');

-- ---------------------------------------------------------------------------
-- Student 1: start, resume, save, submit
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('t.p1', public.start_exam('31000000-0000-0000-0000-000000000001')::text, true);

select is(jsonb_array_length(current_setting('t.p1')::jsonb -> 'questions'), 3,
  'start_exam returns the questions');
select is(position('correct' in current_setting('t.p1')), 0,
  'start_exam payload contains NO correct answers');
select is((current_setting('t.p1')::jsonb ->> 'deadline_at')::timestamptz, now() + interval '30 minutes',
  'server-calculated deadline = start + duration');
select is(public.start_exam('31000000-0000-0000-0000-000000000001') ->> 'attempt_id',
          current_setting('t.p1')::jsonb ->> 'attempt_id',
  'starting again while in progress resumes the same attempt');
select is(public.get_open_attempt('31000000-0000-0000-0000-000000000001') ->> 'attempt_id',
          current_setting('t.p1')::jsonb ->> 'attempt_id',
  'get_open_attempt resumes without creating');

select lives_ok(
  $$ select public.save_answer((current_setting('t.p1')::jsonb ->> 'attempt_id')::uuid,
                               '33000000-0000-0000-0000-000000000001', 'B', true) $$,
  'student saves an answer (and a flag)');
select is(
  (select flagged from public.attempt_answers
   where attempt_id = (current_setting('t.p1')::jsonb ->> 'attempt_id')::uuid
     and question_id = '33000000-0000-0000-0000-000000000001'),
  true, 'flag is stored');
select throws_ok(
  $$ select public.save_answer(current_setting('t.a2')::uuid, '33000000-0000-0000-0000-000000000001', 'A') $$,
  'P0001', 'attempt_not_found', 'student CANNOT save into another student''s attempt');
select throws_ok(
  $$ select public.save_answer((current_setting('t.p1')::jsonb ->> 'attempt_id')::uuid,
                               '33000000-0000-0000-0000-000000000009', 'A') $$,
  'P0001', 'invalid_answers', 'student CANNOT answer a question from another exam');
select throws_ok(
  $$ insert into public.attempt_answers (attempt_id, question_id, selected_option)
     values ((current_setting('t.p1')::jsonb ->> 'attempt_id')::uuid, '33000000-0000-0000-0000-000000000002', 'C') $$,
  '42501', null, 'student CANNOT write answers directly (only through RPCs)');

select is(
  public.submit_exam((current_setting('t.p1')::jsonb ->> 'attempt_id')::uuid,
    '[{"question_id":"33000000-0000-0000-0000-000000000002","selected_option":"C"}]'::jsonb) ->> 'late',
  'false', 'student submits on time, flushing a final answer');
select is(
  (select score from public.attempts where id = (current_setting('t.p1')::jsonb ->> 'attempt_id')::uuid),
  3, 'graded server-side: Q1 (2 pts) + Q2 (1 pt)');
select is(
  public.submit_exam((current_setting('t.p1')::jsonb ->> 'attempt_id')::uuid) ->> 'already',
  'true', 'submitting twice is harmless (idempotent)');
select throws_ok(
  $$ select public.start_exam('31000000-0000-0000-0000-000000000001') $$,
  'P0001', 'already_taken', 'student CANNOT start the same exam twice');
select throws_ok(
  $$ select public.save_answer((current_setting('t.p1')::jsonb ->> 'attempt_id')::uuid,
                               '33000000-0000-0000-0000-000000000003', 'A') $$,
  'P0001', 'already_submitted', 'student CANNOT change answers after submitting');

-- Visibility / eligibility
select throws_ok($$ select public.start_exam('31000000-0000-0000-0000-000000000002') $$,
  'P0001', 'not_open', 'cannot start before the window opens');
select throws_ok($$ select public.start_exam('31000000-0000-0000-0000-000000000003') $$,
  'P0001', 'exam_not_found', 'cannot start a draft exam');
select throws_ok($$ select public.start_exam('31000000-0000-0000-0000-000000000004') $$,
  'P0001', 'not_open', 'cannot use a restricted window you are not listed on');
select set_eq(
  $$ select x ->> 'title' from jsonb_array_elements(public.student_dashboard() -> 'exams') x
     where x ->> 'id' like '31000000-%' $$,
  array['X live', 'Y scheduled'],
  'dashboard shows published exams with usable windows only (no draft, no restricted)');
select throws_ok($$ select private.auto_submit_expired() $$, '42501', null,
  'student CANNOT call internal functions');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.start_exam('31000000-0000-0000-0000-000000000001') $$,
  'P0001', 'banned', 'banned student CANNOT start');
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$ select public.start_exam('31000000-0000-0000-0000-000000000001') $$,
  'P0001', 'profile_incomplete', 'student with an incomplete profile CANNOT start');
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok($$ select public.start_exam('31000000-0000-0000-0000-000000000001') $$,
  'P0001', 'exam_not_found', 'social student CANNOT start a natural-stream exam');
reset role;

-- ---------------------------------------------------------------------------
-- Late submit: push student 2's deadline into the past (beyond the 30 s grace)
-- ---------------------------------------------------------------------------
alter table public.attempts disable trigger attempts_guard_update;
update public.attempts set started_at = now() - interval '2 hours', deadline_at = now() - interval '1 minute'
  where id = current_setting('t.a2')::uuid;
alter table public.attempts enable trigger attempts_guard_update;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.save_answer(current_setting('t.a2')::uuid, '33000000-0000-0000-0000-000000000001', 'B') $$,
  'P0001', 'time_up', 'student CANNOT save after the deadline');
select is(
  public.submit_exam(current_setting('t.a2')::uuid,
    '[{"question_id":"33000000-0000-0000-0000-000000000001","selected_option":"B"}]'::jsonb) ->> 'late',
  'true', 'late submit is rejected (closed as auto-submitted)');
select is(
  (select score from public.attempts where id = current_setting('t.a2')::uuid), 0,
  'answers sent with a late submit are ignored');
reset role;

-- ---------------------------------------------------------------------------
-- Retake grant: student 1 may take X a second time
-- ---------------------------------------------------------------------------
insert into public.retake_grants (exam_id, user_id, granted_by)
values ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('t.p1b', public.start_exam('31000000-0000-0000-0000-000000000001')::text, true);
select is((current_setting('t.p1b')::jsonb ->> 'attempt_no')::int, 2, 'retake grant allows a second attempt');
reset role;
select is(
  (select used from public.retake_grants where user_id = '30000000-0000-0000-0000-000000000001'),
  true, 'the grant is consumed');

-- ---------------------------------------------------------------------------
-- pg_cron job: expired attempts are auto-submitted and graded
-- ---------------------------------------------------------------------------
alter table public.attempts disable trigger attempts_guard_update;
update public.attempts set started_at = now() - interval '2 hours', deadline_at = now() - interval '5 minutes'
  where id = (current_setting('t.p1b')::jsonb ->> 'attempt_id')::uuid;
alter table public.attempts enable trigger attempts_guard_update;

select cmp_ok(private.auto_submit_expired(), '>=', 1, 'auto-submit job closes expired attempts');
select results_eq(
  $$ select auto_submitted, submitted_at = deadline_at, score is not null
     from public.attempts where id = (current_setting('t.p1b')::jsonb ->> 'attempt_id')::uuid $$,
  $$ values (true, true, true) $$,
  'auto-submitted at the deadline and graded');

select * from finish();
rollback;
