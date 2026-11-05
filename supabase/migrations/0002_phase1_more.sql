-- Phase 1 (continued) — tables for the Timetable, Notes and Study planner.
-- Same rules as 0001: Row Level Security ON, every row owned by auth.uid().
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- timetable: one row per class slot in the user's weekly timetable.
-- ---------------------------------------------------------------------------
create table if not exists public.timetable (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_of_week  smallint not null,            -- 1 = Monday ... 7 = Sunday
  period       text,                          -- e.g. 'Period 1', 'Recess'
  sort_order   smallint not null default 0,   -- order of a slot within its day
  subject      text not null,
  room         text,
  week         text not null default 'all',   -- 'A' | 'B' | 'all' for A/B rotations
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists timetable_user_idx on public.timetable (user_id, day_of_week, sort_order);

alter table public.timetable enable row level security;

drop policy if exists "timetable: all own" on public.timetable;
create policy "timetable: all own"
  on public.timetable for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notes: quick notes, newest first.
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null default 'Untitled',
  body       text not null default '',
  course     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_idx on public.notes (user_id, updated_at desc);

alter table public.notes enable row level security;

drop policy if exists "notes: all own" on public.notes;
create policy "notes: all own"
  on public.notes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- study_blocks: weekly recurring study sessions for the planner.
-- ---------------------------------------------------------------------------
create table if not exists public.study_blocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_of_week  smallint not null,            -- 1 = Monday ... 7 = Sunday
  start_min    smallint not null,             -- minutes from midnight (e.g. 16:00 = 960)
  duration_min smallint not null default 30,
  subject      text,
  label        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists study_blocks_user_idx on public.study_blocks (user_id, day_of_week, start_min);

alter table public.study_blocks enable row level security;

drop policy if exists "study_blocks: all own" on public.study_blocks;
create policy "study_blocks: all own"
  on public.study_blocks for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
