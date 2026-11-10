-- LOCAL DEVELOPMENT ONLY. Runs on `supabase db reset` / `supabase start`, never on the cloud
-- project (supabase db push does not run seed files).
--
-- Dev login accounts (password for all: devpass123):
--   admin@dev.local    admin
--   natural@dev.local  student, natural stream, profile complete
--   social@dev.local   student, social stream,  profile complete
--   new@dev.local      student, profile NOT complete (tests the completion redirect)
--   banned@dev.local   student, banned

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-0000-0000-00000000a001'::uuid, 'admin@dev.local',   'Dev Admin'),
      ('00000000-0000-0000-0000-00000000b001'::uuid, 'natural@dev.local', 'Abebe Kebede'),
      ('00000000-0000-0000-0000-00000000b002'::uuid, 'social@dev.local',  'Hana Tesfaye'),
      ('00000000-0000-0000-0000-00000000b003'::uuid, 'new@dev.local',     null),
      ('00000000-0000-0000-0000-00000000b004'::uuid, 'banned@dev.local',  'Banned Student')
    ) as t(id, email, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('devpass123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      case when u.full_name is null then '{}'::jsonb else jsonb_build_object('full_name', u.full_name) end,
      now(), now(), '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id, u.id::text, 'email',
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      now(), now(), now()
    );
  end loop;
end $$;

-- The signup trigger created the profile rows; fill in the rest (runs as postgres, so the
-- guard trigger allows role / ban changes).
update public.profiles set role = 'admin', school = 'Exam Office', stream = 'natural'
  where id = '00000000-0000-0000-0000-00000000a001';
update public.profiles set school = 'Menelik II Preparatory', stream = 'natural', telegram_username = 'abebe_dev'
  where id = '00000000-0000-0000-0000-00000000b001';
update public.profiles set school = 'Entoto Amba Secondary', stream = 'social', telegram_username = 'hana_dev'
  where id = '00000000-0000-0000-0000-00000000b002';
update public.profiles set school = 'Bole Preparatory', stream = 'natural', is_banned = true, banned_at = now()
  where id = '00000000-0000-0000-0000-00000000b004';

-- ---------------------------------------------------------------------------
-- Sample exams, one per status, timed relative to the moment the seed runs.
-- ---------------------------------------------------------------------------
insert into public.exams (id, title, subject, stream, duration_minutes, published_at, created_by) values
  ('00000000-0000-0000-0000-0000000e0001', 'Mathematics Model Exam 1', 'Mathematics', 'natural', 30, now(), '00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-0000000e0002', 'English Model Exam 1',     'English',     'both',    60, now(), '00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-0000000e0003', 'Geography Model Exam 1',   'Geography',   'social',  45, now(), '00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-0000000e0004', 'Physics Model Exam 1',     'Physics',     'natural', 60, null,  '00000000-0000-0000-0000-00000000a001');

insert into public.exam_windows (exam_id, starts_at, ends_at, created_by) values
  -- live now
  ('00000000-0000-0000-0000-0000000e0001', now() - interval '1 hour', now() + interval '1 day',  '00000000-0000-0000-0000-00000000a001'),
  -- scheduled tomorrow
  ('00000000-0000-0000-0000-0000000e0002', now() + interval '1 day',  now() + interval '1 day 3 hours', '00000000-0000-0000-0000-00000000a001'),
  -- closed yesterday
  ('00000000-0000-0000-0000-0000000e0003', now() - interval '2 days', now() - interval '1 day', '00000000-0000-0000-0000-00000000a001');

insert into public.questions (id, exam_id, position, body, options, points) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000e0001', 1,
   'What is the derivative of x²?', '["x", "2x", "x²", "2"]', 1),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000e0001', 2,
   'If log₁₀(x) = 2, what is x?', '["20", "100", "2", "1000"]', 1),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000e0001', 3,
   'What is the sum of the interior angles of a triangle?', '["90°", "360°", "180°", "270°"]', 1),
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000e0003', 1,
   'Which is the longest river in Africa?', '["Congo", "Niger", "Zambezi", "Nile"]', 1);

insert into public.answer_keys (question_id, correct_option) values
  ('00000000-0000-0000-0000-00000000f001', 'B'),
  ('00000000-0000-0000-0000-00000000f002', 'B'),
  ('00000000-0000-0000-0000-00000000f003', 'C'),
  ('00000000-0000-0000-0000-00000000f101', 'D');
