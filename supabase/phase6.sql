-- Dashboard phase 6: study timer, HSC countdown dates, big uploads (PowerPoint),
-- My life planner and voice.
--
-- How to run it: run supabase/schema.sql and supabase/agents.sql first, then
-- paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again whenever it changes. Never edit the older SQL files; add new ones.
--
-- Every table has Row Level Security ON and an "all own" policy, so each person
-- only ever sees their own rows.

-- A helper that adds the standard "all own" policy and user_id index to a table.
create or replace function public.dash_own_table(t text) returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || ': all own', t);
  execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || ': all own', t);
  execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
end
$$;

-- ===========================================================================
-- Stage M: study timer
-- ===========================================================================
create table if not exists public.study_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject            text not null default 'Study',
  topic              text,
  kind               text not null default 'focus' check (kind in ('focus', 'flashcards', 'practice', 'reading', 'other')),
  planned_seconds    integer not null check (planned_seconds between 60 and 43200),
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  paused_seconds     integer not null default 0 check (paused_seconds >= 0),
  paused_at          timestamptz,
  status             text not null default 'running' check (status in ('running', 'paused', 'completed', 'abandoned', 'auto_closed')),
  counted_seconds    integer check (counted_seconds >= 0),
  source             text not null default 'timer' check (source in ('timer', 'manual', 'siri', 'planner', 'voice')),
  planner_block_id   uuid,
  group_id           uuid,
  notes              text,
  counts_as_external boolean not null default true,
  alerted_at         timestamptz,            -- when the "Time's up" push went out
  created_at         timestamptz not null default now(),
  unique (id, user_id)
);
select public.dash_own_table('study_sessions');
create index if not exists study_sessions_started_idx on public.study_sessions (user_id, started_at desc);
-- At most one running or paused session per person.
create unique index if not exists study_sessions_one_active on public.study_sessions (user_id) where status in ('running', 'paused');

create table if not exists public.study_settings (
  user_id                uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  target_total_hours     integer check (target_total_hours between 1 and 5000),
  weekly_target_hours    integer check (weekly_target_hours between 1 and 100),
  default_minutes        integer not null default 25 check (default_minutes between 1 and 720),
  break_reminder_minutes integer not null default 90 check (break_reminder_minutes between 15 and 600),
  pomodoro               boolean not null default false,
  pomodoro_focus         integer not null default 25 check (pomodoro_focus between 5 and 120),
  pomodoro_short         integer not null default 5 check (pomodoro_short between 1 and 60),
  pomodoro_long          integer not null default 15 check (pomodoro_long between 1 and 90),
  sound                  boolean not null default true,
  vibration              boolean not null default true,
  updated_at             timestamptz not null default now()
);
alter table public.study_settings enable row level security;
drop policy if exists "study_settings: all own" on public.study_settings;
create policy "study_settings: all own" on public.study_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ===========================================================================
-- Stage N: my own key dates (exams, trials, assessments, end of term)
-- ===========================================================================
create table if not exists public.key_dates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  starts_at  timestamptz not null,
  kind       text not null default 'custom' check (kind in ('exam', 'trial', 'assessment', 'term', 'custom')),
  course     text,
  pinned     boolean not null default false,
  notes      text,
  created_at timestamptz not null default now()
);
select public.dash_own_table('key_dates');
create index if not exists key_dates_starts_idx on public.key_dates (user_id, starts_at);

-- ===========================================================================
-- Stage O: uploads straight to Storage, PowerPoint slides, resumable jobs
-- ===========================================================================
alter table public.uploads add column if not exists kind          text not null default 'pdf';
alter table public.uploads add column if not exists slide_count   integer;
alter table public.uploads add column if not exists storage_path  text;
alter table public.uploads add column if not exists status        text not null default 'ready';
alter table public.uploads add column if not exists keep_original boolean not null default false;
alter table public.uploads add column if not exists size_bytes    integer;
alter table public.uploads add column if not exists notes         jsonb not null default '{}'::jsonb;
alter table public.uploads drop constraint if exists uploads_kind_check;
alter table public.uploads add constraint uploads_kind_check check (kind in ('pdf', 'docx', 'pptx', 'txt', 'md'));
alter table public.uploads drop constraint if exists uploads_status_check;
alter table public.uploads add constraint uploads_status_check check (status in ('uploading', 'processing', 'ready', 'failed'));

create table if not exists public.upload_slides (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  upload_id uuid not null,
  position  integer not null,
  title     text,
  body      text not null default '',
  notes     text,
  hidden    boolean not null default false,
  low_text  boolean not null default false,
  foreign key (upload_id, user_id) references public.uploads (id, user_id) on delete cascade,
  unique (upload_id, position)
);
select public.dash_own_table('upload_slides');

create table if not exists public.upload_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  upload_id    uuid not null,
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  total_chunks integer not null default 0,
  done_chunks  integer not null default 0,
  chunks       jsonb not null default '[]'::jsonb,   -- [{from, to}] slide (or part) ranges
  results      jsonb not null default '[]'::jsonb,   -- one entry per finished chunk
  quick        boolean not null default false,
  error        text,
  locked_until timestamptz,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  foreign key (upload_id, user_id) references public.uploads (id, user_id) on delete cascade,
  unique (upload_id)
);
select public.dash_own_table('upload_jobs');

-- Private Storage bucket "uploads" (25 MB per file). Files live under "<user_id>/…".
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "uploads bucket: read own" on storage.objects;
create policy "uploads bucket: read own" on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "uploads bucket: add own" on storage.objects;
create policy "uploads bucket: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "uploads bucket: change own" on storage.objects;
create policy "uploads bucket: change own" on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "uploads bucket: delete own" on storage.objects;
create policy "uploads bucket: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===========================================================================
-- Stage P: My life
-- ===========================================================================
create table if not exists public.life_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 120),
  category          text not null default 'other' check (category in ('social', 'fitness', 'family', 'work', 'hobby', 'rest', 'errands', 'travel', 'other')),
  kind              text not null default 'one_off' check (kind in ('one_off', 'recurring')),
  starts_at         timestamptz,
  ends_at           timestamptz,
  recurrence        jsonb,       -- {"days":[2,4], "start":"18:00", "end":"19:00", "until":"2027-11-05"}
  travel_before_min integer not null default 0 check (travel_before_min between 0 and 600),
  travel_after_min  integer not null default 0 check (travel_after_min between 0 and 600),
  importance        smallint not null default 3 check (importance between 1 and 5),
  flexibility       text not null default 'movable' check (flexibility in ('fixed', 'movable', 'optional')),
  energy            text not null default 'medium' check (energy in ('low', 'medium', 'high')),
  notes             text,
  status            text not null default 'planned' check (status in ('planned', 'confirmed', 'skipped', 'done')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id)
);
select public.dash_own_table('life_items');
create index if not exists life_items_starts_idx on public.life_items (user_id, starts_at);

create table if not exists public.life_preferences (
  user_id                  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  sleep_hours              numeric(3,1) not null default 8.5 check (sleep_hours between 6 and 11),
  school_wake              text not null default '06:45',
  weekend_lie_in_min       integer not null default 60 check (weekend_lie_in_min between 0 and 240),
  wind_down_min            integer not null default 45 check (wind_down_min between 0 and 120),
  exercise_per_week        integer not null default 3 check (exercise_per_week between 0 and 14),
  social_hours_per_week    numeric(4,1) not null default 6 check (social_hours_per_week between 0 and 40),
  downtime_min_per_day     integer not null default 60 check (downtime_min_per_day between 0 and 300),
  max_study_school_day_min integer not null default 180 check (max_study_school_day_min between 0 and 600),
  max_study_weekend_min    integer not null default 300 check (max_study_weekend_min between 0 and 720),
  rest_blocks_per_week     integer not null default 1 check (rest_blocks_per_week between 0 and 7),
  meal_times               jsonb not null default '{"breakfast":"07:00","lunch":"12:30","dinner":"18:30"}'::jsonb,
  updated_at               timestamptz not null default now()
);
alter table public.life_preferences enable row level security;
drop policy if exists "life_preferences: all own" on public.life_preferences;
create policy "life_preferences: all own" on public.life_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.schedule_decisions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id    uuid,
  asked_at   timestamptz not null default now(),
  verdict    text not null,
  factors    jsonb not null default '{}'::jsonb,
  suggestion jsonb not null default '{}'::jsonb,
  my_choice  text
);
select public.dash_own_table('schedule_decisions');

-- ===========================================================================
-- Stage Q: voice. Only a timestamp per clip, for the hourly limit. No audio, ever.
-- ===========================================================================
create table if not exists public.voice_clips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
select public.dash_own_table('voice_clips');
create index if not exists voice_clips_created_idx on public.voice_clips (user_id, created_at desc);

alter table public.user_settings add column if not exists speak_replies boolean;
alter table public.user_settings add column if not exists speech_rate   numeric(3,2) not null default 1.0;
