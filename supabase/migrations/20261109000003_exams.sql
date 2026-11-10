-- Exams, exam windows, questions.
-- Status is NOT stored: draft = published_at is null; scheduled / live / closed are
-- derived from the windows and now() in the exam_status view, so they can never go stale.

create table public.exams (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(btrim(title)) between 3 and 200),
  subject          text not null check (char_length(btrim(subject)) between 2 and 80),
  stream           public.exam_stream not null default 'both',
  duration_minutes integer not null check (duration_minutes between 1 and 600),
  published_at     timestamptz,
  source_file      text,  -- object path in the private exam-sources bucket
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index exams_published_idx on public.exams (stream, published_at) where published_at is not null;

create trigger exams_set_updated_at
  before update on public.exams
  for each row execute function public.set_updated_at();

-- An exam can have several windows; reopening = a new window with is_reopen = true.
-- restricted = only users listed in window_allowed_users may use this window.
create table public.exam_windows (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.exams (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  is_reopen  boolean not null default false,
  restricted boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint exam_windows_valid_range check (ends_at > starts_at),
  -- Windows of the same exam may not overlap, so "the active window" is always unambiguous.
  constraint exam_windows_no_overlap
    exclude using gist (exam_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
);

create index exam_windows_exam_idx on public.exam_windows (exam_id, starts_at);
create index exam_windows_time_idx on public.exam_windows (starts_at, ends_at);

create table public.window_allowed_users (
  window_id  uuid not null references public.exam_windows (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (window_id, user_id)
);

create index window_allowed_users_user_idx on public.window_allowed_users (user_id);

-- ---------------------------------------------------------------------------
-- Questions: options is a JSON array of exactly 4 non-empty strings (A..D in order).
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_options(o jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if o is null or jsonb_typeof(o) <> 'array' or jsonb_array_length(o) <> 4 then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_array_elements(o) e
    where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = ''
  );
end;
$$;

create table public.questions (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.exams (id) on delete cascade,
  position   integer not null check (position > 0),
  body       text not null check (char_length(btrim(body)) > 0),
  options    jsonb not null check (public.is_valid_options(options)),
  image_url  text,
  points     integer not null default 1 check (points between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_exam_position_key unique (exam_id, position) deferrable initially immediate
);

create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();
