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
