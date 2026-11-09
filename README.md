# Dashboard

A free, black-and-white school and personal dashboard: timetable, assignments from Canvas /
Google Classroom, HSC practice with AI marking, flashcards, a study planner, AI agents,
and personal tools — installable on iPhone.

## Run it on your computer (optional)

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Copy the names from `.env.example` into `.env.local` and fill in
your own values first; without the Supabase ones every page shows "Supabase isn't connected yet".
`npm run build` must pass before every commit.

## First-time setup

Follow `SETUP.md`: create the Supabase project, run `supabase/schema.sql` in the SQL Editor, add
the environment variables in Vercel, then invite friends with the site link and your invite code.

## Deploy

Import this repo into Vercel (Add New → Project). It deploys automatically on every push.

## Keys

Add keys in **Vercel → your project → Settings → Environment Variables**, using the names in
`.env.example`. Never put real keys in this repo.

## Scheduled agents

The agents (The BRIAN, Assignments watcher, Deadlines & clashes, Cleaning hours, Study coach,
School coach, Money ideas, About me) run when something calls `/api/agents/tick` with
`Authorization: Bearer $AGENT_SECRET`. The free way is GitHub Actions every 30 minutes
(`docs/github/agents-tick.yml` → copy it to `.github/workflows/agents-tick.yml` on GitHub, and add the
repo secrets `SITE_URL` and `AGENT_SECRET`). GitHub runs can be **5–30 minutes late**, so for a text at
an exact time use the iPhone Shortcut automation instead.

More precise alternative: in Supabase enable the `pg_cron` and `pg_net` extensions and schedule
`select net.http_post(url := '<SITE_URL>/api/agents/tick', headers := jsonb_build_object('Authorization', 'Bearer <AGENT_SECRET>'));`
every 15 minutes (`*/15 * * * *`). Keep the secret out of this repo.

### Study timer alerts on time (optional)

The 30-minute tick also sends "Time's up" pushes for study timers, but that can be up to 30+ minutes
late. For alerts on the minute, even when the app is closed, run this once in Supabase → SQL Editor
(it enables `pg_cron` and `pg_net`, then calls `/api/timer/sweep` every minute). Replace the two
placeholders; the secret lives only in your Supabase database, never in this repo:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'dashboard-timer-sweep',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://YOUR-SITE.vercel.app/api/timer/sweep',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR-AGENT-SECRET')
     ); $$
);
```

To stop it: `select cron.unschedule('dashboard-timer-sweep');`. If you skip this, timers still work and
count correctly (they're worked out from timestamps), and a forgotten timer is still closed at its
planned end; only the "Time's up" notification may arrive late when the app is closed. While the
timer page is open it chimes on time by itself.

Scheduled agents only read your data and write findings and reports; they never send messages,
apply for anything, buy anything or change your calendar.

## Tests

`npm test` runs the unit tests in `tests/` (schedules and daylight saving, the AI sanitiser,
encryption, cleaning-hours weeks, clashes, the planner, budgets, coach maths, money-idea scoring,
About me filters, the study timer, the HSC countdown, PowerPoint reading with zip-bomb and XXE cases,
My life sleep and balance maths, and the voice fast paths).

## Phase 6 setup

Run `supabase/phase6.sql` after `schema.sql` and `agents.sql`. It creates the timer, key dates, My life
and voice tables, and the private Storage bucket `uploads` with its policies. Voice needs each person's
own free Groq key (Settings → AI keys).

## For Claude Code

Project rules, design, data sources and build phases are in `CLAUDE.md`.
