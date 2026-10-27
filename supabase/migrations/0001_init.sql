-- Phase 1A — initial schema for the Dashboard.
-- Every table has Row Level Security ON; a row belongs to the signed-in user
-- (auth.uid()) and is only ever visible to that user.
--
-- Safe to run more than once: tables use "if not exists" and every policy is
-- dropped first, then recreated.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created automatically on sign-up.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Create a profile row automatically whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- connections: a linked external account (Canvas, Google, Spotify, ...).
-- The access/refresh token is stored encrypted (AES-256-GCM, see lib/crypto.ts)
-- and only ever decrypted server-side.
-- ---------------------------------------------------------------------------
create table if not exists public.connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider         text not null,            -- e.g. 'canvas', 'google', 'spotify', 'compass', 'atlantis'
  account_label    text,                     -- e.g. 'Personal Google', 'School Canvas'
  encrypted_token  text,                     -- AES-256-GCM ciphertext, never the raw token
  status           text not null default 'disconnected',  -- 'connected' | 'disconnected' | 'error'
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists connections_user_idx on public.connections (user_id);

alter table public.connections enable row level security;

drop policy if exists "connections: all own" on public.connections;
create policy "connections: all own"
  on public.connections for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- tasks: due-date items from Canvas / Classroom / Compass, plus manual ones.
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source       text,                         -- 'canvas', 'classroom', 'compass', 'manual'
  external_id  text,                          -- id from the source system, null for manual tasks
  course       text,                          -- one of the COURSES in lib/nav.ts
  title        text not null,
  due_at       timestamptz,
  done         boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tasks_user_due_idx on public.tasks (user_id, due_at);

-- Don't import the same source item twice for a user.
create unique index if not exists tasks_user_source_external_idx
  on public.tasks (user_id, source, external_id)
  where external_id is not null;

alter table public.tasks enable row level security;

drop policy if exists "tasks: all own" on public.tasks;
create policy "tasks: all own"
  on public.tasks for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- events: calendar entries merged from Google / Canvas / Compass / Atlantis.
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source       text,
  external_id  text,
  title        text,
  location     text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists events_user_start_idx on public.events (user_id, starts_at);

create unique index if not exists events_user_source_external_idx
  on public.events (user_id, source, external_id)
  where external_id is not null;

alter table public.events enable row level security;

drop policy if exists "events: all own" on public.events;
create policy "events: all own"
  on public.events for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- flashcards: placeholder for phase 2 (spaced repetition). Schema is here so
-- RLS is in place from the start; the study logic is built later.
-- ---------------------------------------------------------------------------
create table if not exists public.flashcards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course        text,
  topic         text,
  front         text not null,
  back          text not null,
  due_at        timestamptz,                  -- when this card is next due for review
  interval_days integer not null default 0,
  ease          real not null default 2.5,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists flashcards_user_due_idx on public.flashcards (user_id, due_at);

alter table public.flashcards enable row level security;

drop policy if exists "flashcards: all own" on public.flashcards;
create policy "flashcards: all own"
  on public.flashcards for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
