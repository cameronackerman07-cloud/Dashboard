# Dashboard

A free, black-and-white school and personal dashboard: timetable, assignments from Canvas /
Google Classroom / Compass, HSC practice with AI marking, flashcards, a study planner, AI agents,
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

## For Claude Code

Project rules, design, data sources and build phases are in `CLAUDE.md`.
