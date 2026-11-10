-- Attempts and per-question answers. All writes happen through RPCs (Phase 3).

create table public.attempts (
  id              uuid primary key default gen_random_uuid(),
  exam_id         uuid not null references public.exams (id) on delete cascade,
  window_id       uuid not null references public.exam_windows (id) on delete restrict,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  attempt_no      smallint not null default 1 check (attempt_no >= 1),
  retake_grant_id uuid,  -- FK added after retake_grants exists
  started_at      timestamptz not null default now(),
  -- Server-calculated: least(started_at + duration, window.ends_at). Fixed at start,
  -- so resume, auto-submit and late-submit checks all read the same value.
  deadline_at     timestamptz not null,
  submitted_at    timestamptz,
  auto_submitted  boolean not null default false,
  score           integer,
  max_score       integer,
  constraint attempts_one_per_number unique (exam_id, user_id, attempt_no),
  constraint attempts_deadline_after_start check (deadline_at > started_at),
  constraint attempts_submit_after_start check (submitted_at is null or submitted_at >= started_at)
);

-- At most one in-progress attempt per student per exam.
create unique index attempts_one_open_idx
  on public.attempts (exam_id, user_id) where submitted_at is null;
-- pg_cron auto-submit scan.
create index attempts_open_deadline_idx
  on public.attempts (deadline_at) where submitted_at is null;
-- Leaderboard.
create index attempts_leaderboard_idx
  on public.attempts (exam_id, score desc) where submitted_at is not null;
create index attempts_user_idx on public.attempts (user_id);

create table public.attempt_answers (
  attempt_id      uuid not null references public.attempts (id) on delete cascade,
  question_id     uuid not null references public.questions (id) on delete cascade,
  selected_option public.answer_option,
  flagged         boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index attempt_answers_question_idx on public.attempt_answers (question_id);
