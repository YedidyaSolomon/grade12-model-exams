-- attempts.deadline_at is computed by the database, never by the caller:
--   started_at  = now()                                   (server clock)
--   deadline_at = least(started_at + exam duration, window.ends_at)
-- The trigger also rejects a window that belongs to another exam or isn't open, and makes
-- identity/timing columns immutable afterwards. start_exam (Phase 3) relies on this.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
comment on schema private is 'Internal helpers. Not exposed through the API.';

create or replace function public.attempts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  w   public.exam_windows;
  dur integer;
begin
  select * into w
  from public.exam_windows
  where id = new.window_id and exam_id = new.exam_id;
  if not found then
    raise exception 'Window does not belong to this exam' using errcode = '23503';
  end if;

  select duration_minutes into dur from public.exams where id = new.exam_id;

  new.started_at := now();
  if new.started_at < w.starts_at or new.started_at >= w.ends_at then
    raise exception 'Exam window is not open' using errcode = '55000';
  end if;

  new.deadline_at    := least(new.started_at + make_interval(mins => dur), w.ends_at);
  new.submitted_at   := null;
  new.auto_submitted := false;
  new.score          := null;
  new.max_score      := null;
  return new;
end;
$$;

create trigger attempts_set_deadline
  before insert on public.attempts
  for each row execute function public.attempts_before_insert();

create or replace function public.attempts_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.exam_id     is distinct from old.exam_id
  or new.window_id   is distinct from old.window_id
  or new.user_id     is distinct from old.user_id
  or new.attempt_no  is distinct from old.attempt_no
  or new.started_at  is distinct from old.started_at
  or new.deadline_at is distinct from old.deadline_at then
    raise exception 'Attempt identity and timing cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger attempts_guard_update
  before update on public.attempts
  for each row execute function public.attempts_guard_update();

revoke execute on function public.attempts_before_insert() from public, anon, authenticated;
revoke execute on function public.attempts_guard_update()  from public, anon, authenticated;
