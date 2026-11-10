-- Correct answers live in their own table that no API role can touch.
-- Admins read/write keys only through security definer RPCs (Phase 2: create_exam,
-- admin_get_exam, update_exam). Students get them only via result RPCs after the
-- exam's last window has closed (Phase 4).

create table public.answer_keys (
  question_id    uuid primary key references public.questions (id) on delete cascade,
  correct_option public.answer_option not null,
  updated_at     timestamptz not null default now()
);

create trigger answer_keys_set_updated_at
  before update on public.answer_keys
  for each row execute function public.set_updated_at();

alter table public.answer_keys enable row level security;
alter table public.answer_keys force row level security;
-- No policies on purpose, and no table privileges for API roles (revoked in the RLS migration).
