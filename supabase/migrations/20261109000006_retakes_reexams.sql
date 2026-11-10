-- Re-exam requests from students and retake grants from admins.

create table public.reexam_requests (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references public.exams (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  reason      text not null check (char_length(btrim(reason)) between 5 and 1000),
  status      public.reexam_status not null default 'pending',
  admin_note  text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- One open request per student per exam.
create unique index reexam_requests_one_pending_idx
  on public.reexam_requests (exam_id, user_id) where status = 'pending';
create index reexam_requests_status_idx on public.reexam_requests (status, created_at);

create table public.retake_grants (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.exams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  request_id uuid references public.reexam_requests (id) on delete set null,
  granted_by uuid references public.profiles (id) on delete set null default auth.uid(),
  used       boolean not null default false,
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  constraint retake_grants_used_consistent check (used = (used_at is not null))
);

-- One unused grant per student per exam.
create unique index retake_grants_one_unused_idx
  on public.retake_grants (exam_id, user_id) where not used;

alter table public.attempts
  add constraint attempts_retake_grant_fk
  foreign key (retake_grant_id) references public.retake_grants (id) on delete set null;
