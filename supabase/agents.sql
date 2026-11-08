-- Dashboard: agents, notifications, AI keys and connections.
--
-- How to run it: run supabase/schema.sql first (once), then paste this whole file
-- into Supabase → SQL Editor → New query → Run. Safe to run again whenever it changes.
--
-- Every table has Row Level Security ON. Tables holding secrets (user_api_keys,
-- oauth_connections) have NO policies at all, so the browser can never read them;
-- only server code using the service-role key can, after checking who is signed in.

-- ===========================================================================
-- Push notifications
-- ===========================================================================
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  device_label    text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);

create table if not exists public.notification_settings (
  user_id                     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled                     boolean not null default true,
  quiet_start                 text not null default '22:00',   -- HH:MM, Sydney time
  quiet_end                   text not null default '07:00',
  categories                  jsonb not null default '{"briefing": true, "alerts": true, "reminders": true, "cleaning": true, "money": true, "school": true}'::jsonb,
  hide_details_on_lock_screen boolean not null default false,
  allow_urgent_at_night       boolean not null default false,
  max_per_day                 integer not null default 4 check (max_per_day between 0 and 50),
  sent_day                    date,
  sent_count                  integer not null default 0,
  updated_at                  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions: all own" on public.push_subscriptions;
create policy "push_subscriptions: all own" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.notification_settings enable row level security;
drop policy if exists "notification_settings: all own" on public.notification_settings;
create policy "notification_settings: all own" on public.notification_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ===========================================================================
-- Each user's own AI keys. Encrypted (AES-256-GCM). RLS ON with NO policies:
-- the browser can never read this table. Server code reads it with the
-- service-role key, only after checking who is signed in, scoped by user_id.
-- ===========================================================================
create table if not exists public.user_api_keys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider        text not null check (provider in ('gemini', 'groq', 'openrouter', 'mistral', 'adzuna')),
  ciphertext      text not null,
  iv              text not null,
  auth_tag        text not null,
  key_version     integer not null default 1,
  last4           text,
  status          text not null default 'unchecked' check (status in ('unchecked', 'working', 'invalid', 'rate_limited')),
  last_checked_at timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, provider)
);
alter table public.user_api_keys enable row level security;
-- Deliberately no policies. Remove any that might have been added by hand:
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'user_api_keys' loop
    execute format('drop policy %I on public.user_api_keys', p.policyname);
  end loop;
end
$$;
revoke all on public.user_api_keys from anon, authenticated;

-- AI calls per user per day per provider ("shared-gemini" etc. = the site's own keys).
create table if not exists public.ai_usage (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day      date not null,
  provider text not null,
  calls    integer not null default 0,
  primary key (user_id, day, provider)
);
alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage: read own" on public.ai_usage;
create policy "ai_usage: read own" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

-- Per-user settings used by agents and the AI.
create table if not exists public.user_settings (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  region          text,                                  -- suburb or town only
  lat             double precision,
  lng             double precision,
  timezone        text not null default 'Australia/Sydney',
  ai_daily_budget integer not null default 30 check (ai_daily_budget between 0 and 500),
  sleep_start     text not null default '22:00',
  sleep_end       text not null default '06:30',
  pay_week_start  smallint not null default 3 check (pay_week_start between 1 and 7),  -- 3 = Wednesday
  ask_before_changes boolean not null default true,
  updated_at      timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "user_settings: all own" on public.user_settings;
create policy "user_settings: all own" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ===========================================================================
-- Agents. Scheduled agents only READ the user's data and WRITE findings,
-- reports and run logs. The tick job uses the service-role key and always
-- filters by user_id.
-- ===========================================================================
create table if not exists public.agents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug            text not null,
  role            text not null default 'specialist' check (role in ('specialist', 'chief')),
  name            text not null check (char_length(name) between 1 and 24),
  description     text not null default '',
  enabled         boolean not null default true,
  schedule        jsonb not null default '{"type": "daily", "at": "07:00"}'::jsonb,
  instructions    text not null default '',
  config          jsonb not null default '{}'::jsonb,
  sources         text[] not null default '{}',
  importance_min  integer not null default 3 check (importance_min between 1 and 5),
  daily_ai_budget integer not null default 5 check (daily_ai_budget between 0 and 100),
  is_builtin      boolean not null default false,
  kind            text not null default 'custom' check (kind in ('builtin', 'custom')),
  position        jsonb,
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, slug),
  unique (id, user_id)
);
create index if not exists agents_due_idx on public.agents (next_run_at) where enabled;

create table if not exists public.agent_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id       uuid not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running' check (status in ('running', 'ok', 'error', 'skipped')),
  ai_provider    text,
  ai_calls       integer not null default 0,
  findings_count integer not null default 0,
  error          text,
  foreign key (agent_id, user_id) references public.agents (id, user_id) on delete cascade
);
create index if not exists agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);

create table if not exists public.agent_findings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id    uuid not null,
  run_id      uuid,
  category    text not null default 'info',
  title       text not null,
  body        text not null default '',
  importance  integer not null default 3 check (importance between 1 and 5),
  dedupe_key  text not null,
  data        jsonb not null default '{}'::jsonb,
  action_url  text,
  created_at  timestamptz not null default now(),
  consumed_at timestamptz,
  expires_at  timestamptz,
  unique (user_id, agent_id, dedupe_key),
  foreign key (agent_id, user_id) references public.agents (id, user_id) on delete cascade
);
create index if not exists agent_findings_unconsumed_idx on public.agent_findings (user_id, consumed_at, created_at desc);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('briefing', 'sunday_reset', 'alert', 'strategy', 'cleaning_hours', 'custom')),
  title       text not null,
  headline    text not null default '',
  sections    jsonb not null default '[]'::jsonb,
  finding_ids uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists reports_user_created_idx on public.reports (user_id, created_at desc);

create table if not exists public.external_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source        text not null check (source in ('canvas', 'classroom')),
  external_id   text not null,
  title         text not null,
  course        text,
  due_at        timestamptz,
  url           text,
  status        text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  content_hash  text,
  unique (user_id, source, external_id)
);

do $$
declare t text;
begin
  foreach t in array array['agents', 'agent_runs', 'agent_findings', 'reports', 'external_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ': all own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || ': all own', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end
$$;
