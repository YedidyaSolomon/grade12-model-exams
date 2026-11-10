-- Extensions and shared types.
-- pg_cron is enabled in Phase 3 together with the auto-submit job that uses it.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;  -- uuid "=" in exclusion constraints

create type public.user_role     as enum ('student', 'admin');
create type public.stream_type   as enum ('natural', 'social');            -- a student's stream
create type public.exam_stream   as enum ('natural', 'social', 'both');    -- who an exam is for
create type public.answer_option as enum ('A', 'B', 'C', 'D');
create type public.reexam_status as enum ('pending', 'approved', 'rejected');

-- Generic updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
