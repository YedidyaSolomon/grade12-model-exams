-- Profiles, role helpers, signup trigger, and the guard that protects role / ban / stream.

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text check (full_name is null or char_length(btrim(full_name)) between 2 and 120),
  telegram_id       text unique,
  telegram_username text,
  avatar_url        text,
  school            text check (school is null or char_length(btrim(school)) between 2 and 160),
  stream            public.stream_type,
  role              public.user_role not null default 'student',
  is_banned         boolean not null default false,
  banned_at         timestamptz,
  is_complete       boolean generated always as (
                      full_name is not null and school is not null and stream is not null
                    ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.profiles.is_complete is
  'Required profile fields are filled. RPCs (start_exam etc.) refuse incomplete profiles.';

create index profiles_role_idx on public.profiles (role) where role = 'admin';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so they can read profiles without recursing into
-- profiles' own RLS policies. A banned admin is not treated as an admin.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not is_banned
  );
$$;

create or replace function public.is_banned_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select is_banned from public.profiles where id = auth.uid()),
    true  -- no profile row = treat as not allowed
  );
$$;

create or replace function public.current_stream()
returns public.stream_type
language sql
stable
security definer
set search_path = ''
as $$
  select stream from public.profiles where id = auth.uid();
$$;

revoke execute on function public.is_admin(), public.is_banned_user(), public.current_stream()
  from public, anon;
grant execute on function public.is_admin(), public.is_banned_user(), public.current_stream()
  to authenticated;

-- ---------------------------------------------------------------------------
-- New auth user -> profile row. Copies Telegram data when the provider is Telegram.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  provider    text  := coalesce(new.raw_app_meta_data ->> 'provider', '');
  is_telegram boolean := provider like '%telegram%';
begin
  insert into public.profiles (id, full_name, avatar_url, telegram_id, telegram_username)
  values (
    new.id,
    nullif(btrim(left(coalesce(meta ->> 'full_name', meta ->> 'name', ''), 120)), ''),
    nullif(coalesce(meta ->> 'avatar_url', meta ->> 'picture', ''), ''),
    case when is_telegram then coalesce(meta ->> 'provider_id', meta ->> 'sub') end,
    case when is_telegram then nullif(coalesce(meta ->> 'preferred_username', meta ->> 'user_name', ''), '') end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guard: end users (roles anon/authenticated) can never change role, ban fields,
-- or their stream once it has been set. Column grants already block role/ban;
-- this is the backstop. Trusted code (security definer RPCs owned by postgres,
-- the service role in Edge Functions) runs as a different current_user and passes.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.is_banned is distinct from old.is_banned
       or new.banned_at is distinct from old.banned_at
       or new.telegram_id is distinct from old.telegram_id then
      raise exception 'Not allowed to change protected profile fields'
        using errcode = '42501';
    end if;

    if old.stream is not null and new.stream is distinct from old.stream then
      raise exception 'Stream can only be changed by an admin'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Admin edits of other users' profiles go through this RPC (admins have the same
-- column grants as students). Banning is NOT here: Phase 5 does it via an Edge
-- Function so the auth-level ban and is_banned stay in sync.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_profile(
  p_user_id   uuid,
  p_full_name text default null,
  p_school    text default null,
  p_stream    public.stream_type default null,
  p_role      public.user_role default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if p_role is not null and p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own admin role' using errcode = '42501';
  end if;
  

  update public.profiles
     set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
         school    = coalesce(nullif(btrim(p_school), ''), school),
         stream    = coalesce(p_stream, stream),
         role      = coalesce(p_role, role)
   where id = p_user_id
  returning * into result;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke execute on function public.admin_update_profile(uuid, text, text, public.stream_type, public.user_role)
  from public, anon;
grant execute on function public.admin_update_profile(uuid, text, text, public.stream_type, public.user_role)
  to authenticated;
