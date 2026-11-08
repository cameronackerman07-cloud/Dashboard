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
