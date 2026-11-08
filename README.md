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

Scheduled agents only read your data and write findings and reports; they never send messages,
apply for anything, buy anything or change your calendar.

## Tests

`npm test` runs the unit tests in `tests/` (schedules and daylight saving, the AI sanitiser,
encryption, cleaning-hours weeks, clashes, the planner, budgets, coach maths, money-idea scoring,
About me filters).

## For Claude Code

Project rules, design, data sources and build phases are in `CLAUDE.md`.
