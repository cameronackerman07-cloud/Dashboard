-- Dashboard: the whole database in one file.
--
-- How to run it: Supabase → your project → SQL Editor → New query → paste this
-- whole file → Run. It is safe to run again whenever this file changes: tables
-- use "if not exists", new columns use "add column if not exists", and every
-- policy is dropped and recreated.
--
-- Privacy: Row Level Security is ON for every table. Each row has a user_id that
-- defaults to the signed-in user (auth.uid()), and the policies only let a user
-- read or change their own rows. Friends with their own accounts never see each
-- other's data.

-- ===========================================================================
-- profiles: one row per account, created automatically on sign-up.
-- ===========================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  full_name    text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles add column if not exists display_name text;

update public.profiles
set display_name = coalesce(nullif(full_name, ''), split_part(email, '@', 1))
where display_name is null;

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Creates the profile when an account is made. The display name comes from the
-- sign-up form (passed as user metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- School
-- ===========================================================================

-- connections: linked accounts and calendar links. Tokens and links are stored
-- encrypted (AES-256-GCM, lib/crypto.ts) and only decrypted on the server.
create table if not exists public.connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider         text not null,
  account_label    text,
  encrypted_token  text,
  status           text not null default 'disconnected',
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- tasks: due dates from Canvas and other school apps, plus ones added by hand.
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source       text,
  external_id  text,
  course       text,
  title        text not null,
  due_at       timestamptz,
  done         boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_at);
create unique index if not exists tasks_user_source_external_idx
  on public.tasks (user_id, source, external_id)
  where external_id is not null;

-- events: imported calendar files.
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

-- timetable: one row per class slot.
create table if not exists public.timetable (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_of_week  smallint not null,            -- 1 = Monday ... 7 = Sunday
  period       text,
  sort_order   smallint not null default 0,
  subject      text not null,
  room         text,
  week         text not null default 'all',   -- 'A' | 'B' | 'all', or a fortnight day
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists timetable_user_idx on public.timetable (user_id, day_of_week, sort_order);

-- study_blocks: weekly study sessions for the planner.
create table if not exists public.study_blocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_of_week  smallint not null,
  start_min    smallint not null,
  duration_min smallint not null default 30,
  subject      text,
  label        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists study_blocks_user_idx on public.study_blocks (user_id, day_of_week, start_min);

-- ===========================================================================
-- Study: uploads (summaries) and flashcards
-- ===========================================================================

-- uploads: one row per summarised file. Only the extracted text is kept, never
-- the original file.
create table if not exists public.uploads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title           text not null,
  filename        text,
  subject         text,
  summary         jsonb not null default '{}'::jsonb,
  extracted_text  text not null default '',
  truncated       boolean not null default false,
  card_count      integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists uploads_user_created_idx on public.uploads (user_id, created_at desc);

create table if not exists public.flashcards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course        text,                          -- old name for subject, kept so nothing breaks
  topic         text,
  front         text not null,
  back          text not null,
  due_at        timestamptz,
  interval_days integer not null default 0,
  ease          real not null default 2.5,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.flashcards add column if not exists subject      text;
alter table public.flashcards add column if not exists module       text;
alter table public.flashcards add column if not exists upload_id    uuid;
alter table public.flashcards add column if not exists norm_key     text;   -- normalised front, for duplicates
alter table public.flashcards add column if not exists deduped_at   timestamptz;
alter table public.flashcards add column if not exists duplicate_of uuid;   -- set = hidden as a duplicate
alter table public.flashcards add column if not exists reps         integer not null default 0;
alter table public.flashcards add column if not exists lapses       integer not null default 0;

update public.flashcards set subject = coalesce(nullif(course, ''), 'General / Other') where subject is null;
alter table public.flashcards alter column subject set default 'General / Other';
alter table public.flashcards alter column subject set not null;

update public.flashcards set due_at = created_at where due_at is null;
alter table public.flashcards alter column due_at set default now();

-- Lowercase, strip punctuation, collapse spaces (lib/flashcards.ts does the same).
update public.flashcards
set norm_key = trim(regexp_replace(regexp_replace(lower(front), '[^[:alnum:][:space:]]', '', 'g'), '[[:space:]]+', ' ', 'g'))
where norm_key is null;

-- Links only to the same user's upload / card. Dropped and re-added so this
-- file can run again.
alter table public.flashcards drop constraint if exists flashcards_duplicate_of_fkey;
alter table public.flashcards drop constraint if exists flashcards_upload_fkey;
alter table public.flashcards drop constraint if exists flashcards_id_user_key;
alter table public.flashcards add constraint flashcards_id_user_key unique (id, user_id);
alter table public.flashcards add constraint flashcards_upload_fkey
  foreign key (upload_id, user_id) references public.uploads (id, user_id) on delete set null (upload_id);
alter table public.flashcards add constraint flashcards_duplicate_of_fkey
  foreign key (duplicate_of, user_id) references public.flashcards (id, user_id) on delete set null (duplicate_of);

create index if not exists flashcards_user_due_idx on public.flashcards (user_id, due_at);
-- Finds an existing card with the same question quickly. Not a hard unique rule,
-- so a card you add on purpose is never refused; uploads skip matches in code,
-- and the daily check hides any that slip through.
create index if not exists flashcards_user_subject_norm_idx
  on public.flashcards (user_id, subject, norm_key)
  where duplicate_of is null;

-- ===========================================================================
-- Personal
-- ===========================================================================

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null default 'Untitled',
  body       text not null default '',
  course     text,                             -- old name for subject
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.notes add column if not exists subject text;
alter table public.notes add column if not exists pinned  boolean not null default false;
update public.notes set subject = course where subject is null and course is not null;
create index if not exists notes_user_idx on public.notes (user_id, updated_at desc);

create table if not exists public.todos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null,
  due_on     date,
  subject    text,
  priority   smallint not null default 2 check (priority between 1 and 3),  -- 1 = high
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists todos_user_due_idx on public.todos (user_id, done, due_on);

create table if not exists public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null,
  default_rate_cents integer not null default 0 check (default_rate_cents >= 0),
  kind               text not null default 'work' check (kind in ('work', 'sport-ref', 'gig', 'other')),
  created_at         timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.shifts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id               uuid not null,
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  unpaid_break_minutes integer not null default 0 check (unpaid_break_minutes >= 0),
  rate_override_cents  integer check (rate_override_cents >= 0),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);
create index if not exists shifts_user_start_idx on public.shifts (user_id, starts_at);

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type         text not null check (type in ('income', 'expense')),
  amount_cents integer not null check (amount_cents > 0),
  category     text not null default 'Other',
  note         text,
  occurred_on  date not null default ((now() at time zone 'Australia/Sydney')::date),
  created_at   timestamptz not null default now()
);
create index if not exists transactions_user_day_idx on public.transactions (user_id, occurred_on);

create table if not exists public.budget_limits (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category            text not null,
  monthly_limit_cents integer not null check (monthly_limit_cents >= 0),
  created_at          timestamptz not null default now(),
  unique (user_id, category)
);

create table if not exists public.savings_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  target_cents integer not null check (target_cents > 0),
  saved_cents  integer not null default 0 check (saved_cents >= 0),
  created_at   timestamptz not null default now()
);

create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id   uuid not null,
  day        date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, day),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);
create index if not exists habit_logs_user_day_idx on public.habit_logs (user_id, day);

-- ===========================================================================
-- Row Level Security for every table with a user_id: only your own rows.
-- ===========================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'connections', 'tasks', 'events', 'timetable', 'study_blocks',
    'uploads', 'flashcards',
    'notes', 'todos', 'jobs', 'shifts', 'transactions', 'budget_limits',
    'savings_goals', 'habits', 'habit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ': all own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || ': all own', t
    );
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end
$$;
