-- Phase 1 security tests. Run: npm run db:test  (supabase test db)
-- Everything runs inside one transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('11111111-0000-0000-0000-000000000001', 'a@test.local', '{"provider":"email"}', '{"full_name":"Student A"}'),
  ('11111111-0000-0000-0000-000000000002', 'b@test.local', '{"provider":"email"}', '{"full_name":"Student B"}'),
  ('11111111-0000-0000-0000-000000000003', 'banned@test.local', '{"provider":"email"}', '{"full_name":"Banned C"}'),
  ('11111111-0000-0000-0000-00000000000a', 'admin@test.local', '{"provider":"email"}', '{"full_name":"Admin"}'),
  ('11111111-0000-0000-0000-000000000004', 'tg@test.local',
     '{"provider":"custom:telegram"}',
     '{"name":"Telegram User","preferred_username":"tg_user","picture":"https://t.me/i/u.jpg","sub":"987654"}');

update public.profiles set school = 'School B', stream = 'social'
  where id = '11111111-0000-0000-0000-000000000002';
update public.profiles set school = 'School C', stream = 'natural', is_banned = true
  where id = '11111111-0000-0000-0000-000000000003';
update public.profiles set role = 'admin'
  where id = '11111111-0000-0000-0000-00000000000a';

insert into public.exams (id, title, subject, stream, duration_minutes, published_at) values
  ('22222222-0000-0000-0000-000000000001', 'Natural exam', 'Math',    'natural', 30, now()),
  ('22222222-0000-0000-0000-000000000002', 'Both exam',    'English', 'both',    30, now()),
  ('22222222-0000-0000-0000-000000000003', 'Social exam',  'History', 'social',  30, now()),
  ('22222222-0000-0000-0000-000000000004', 'Draft exam',   'Physics', 'natural', 30, null);

insert into public.exam_windows (id, exam_id, starts_at, ends_at) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002',
   now() - interval '1 hour', now() + interval '1 hour');

insert into public.questions (id, exam_id, position, body, options) values
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 1,
   'Q1', '["a","b","c","d"]');
insert into public.answer_keys (question_id, correct_option) values
  ('44444444-0000-0000-0000-000000000001', 'A');

-- One attempt each for A and B on the 'both' exam.
insert into public.attempts (id, exam_id, window_id, user_id, deadline_at) values
  ('55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002',
   '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', now() + interval '30 minutes'),
  ('55555555-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002',
   '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', now() + interval '30 minutes');
insert into public.attempt_answers (attempt_id, question_id, selected_option) values
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 'A');

-- ---------------------------------------------------------------------------
-- Signup trigger
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select full_name, telegram_username, avatar_url, telegram_id, role::text, is_complete
     from public.profiles where id = '11111111-0000-0000-0000-000000000004' $$,
  $$ values ('Telegram User', 'tg_user', 'https://t.me/i/u.jpg', '987654', 'student', false) $$,
  'signup trigger copies Telegram name/username/picture and defaults to an incomplete student profile'
);

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.exams $$,    '42501', null, 'anon cannot read exams');
reset role;

-- ---------------------------------------------------------------------------
-- Student A (profile not yet complete, stream null)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select * from public.answer_keys $$, '42501', null,
  'student CANNOT read answer_keys');
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '11111111-0000-0000-0000-000000000001' $$,
  '42501', null, 'student CANNOT change their role');
select throws_ok(
  $$ update public.profiles set is_banned = true where id = '11111111-0000-0000-0000-000000000001' $$,
  '42501', null, 'student CANNOT change their ban status');

select lives_ok(
  $$ update public.profiles set full_name = 'Student A', school = 'School A', stream = 'natural'
     where id = '11111111-0000-0000-0000-000000000001' $$,
  'student can complete their own profile (first stream choice allowed)');
select is(
  (select is_complete from public.profiles where id = '11111111-0000-0000-0000-000000000001'),
  true, 'profile is marked complete');
select throws_ok(
  $$ update public.profiles set stream = 'social' where id = '11111111-0000-0000-0000-000000000001' $$,
  '42501', 'Stream can only be changed by an admin', 'student CANNOT change stream after it is set');

update public.profiles set full_name = 'Hacked' where id = '11111111-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from public.profiles), 1, 'student sees only their own profile');

select is(
  (select count(*)::int from public.attempts where user_id <> '11111111-0000-0000-0000-000000000001'),
  0, 'student CANNOT see other students'' attempts');
select is(
  (select count(*)::int from public.attempts), 1, 'student sees their own attempt');
select is(
  (select count(*)::int from public.attempt_answers), 0, 'student CANNOT see other students'' answers');

select throws_ok(
  $$ insert into public.attempts (exam_id, window_id, user_id, deadline_at)
     values ('22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001',
             '11111111-0000-0000-0000-000000000001', now() + interval '1 hour') $$,
  '42501', null, 'student CANNOT insert attempts directly');
select throws_ok(
  $$ update public.attempts set score = 100 where id = '55555555-0000-0000-0000-000000000001' $$,
  '42501', null, 'student CANNOT write a score');

select is((select count(*)::int from public.questions), 0,
  'student CANNOT read questions directly (only via start_exam)');

select set_eq(
  $$ select title from public.exams where id::text like '22222222-%' $$,  -- ignore seed.sql exams
  array['Natural exam', 'Both exam'],
  'natural student sees published natural + both exams, not social or drafts');

select throws_ok(
  $$ select public.admin_update_profile('11111111-0000-0000-0000-000000000001', p_role => 'admin') $$,
  '42501', 'Admin only', 'student CANNOT call admin RPCs');

select throws_ok(
  $$ insert into public.reexam_requests (exam_id, reason, status)
     values ('22222222-0000-0000-0000-000000000002', 'I was sick', 'approved') $$,
  '42501', null, 'student CANNOT self-approve a re-exam request');
select lives_ok(
  $$ insert into public.reexam_requests (exam_id, reason)
     values ('22222222-0000-0000-0000-000000000002', 'I was sick that day') $$,
  'student can file a pending re-exam request');
reset role;

select is(
  (select full_name from public.profiles where id = '11111111-0000-0000-0000-000000000002'),
  'Student B', 'student''s update of another profile changed nothing');

-- ---------------------------------------------------------------------------
-- Banned student
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.exams), 0, 'banned student sees no exams');
reset role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.exams where id::text like '22222222-%'), 4,
  'admin sees all exams including drafts');
select lives_ok(
  $$ select public.admin_update_profile('11111111-0000-0000-0000-000000000001', p_stream => 'social') $$,
  'admin can change a student''s stream');
select throws_ok($$ select * from public.answer_keys $$, '42501', null,
  'even admins cannot read answer_keys directly (only through RPCs)');
reset role;

select * from finish();
rollback;
