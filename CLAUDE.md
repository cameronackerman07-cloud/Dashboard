# CLAUDE.md — Dashboard

Personal school + life dashboard for Cameron (Year 11 NSW, starting the HSC course, Term 4 2026).
Read this before every task. Keep it up to date when decisions change.

## Stack (keep it free)
- Next.js 16 (App Router, TypeScript), plain CSS in `app/globals.css` — no Tailwind, no UI kit.
- Hosting: Vercel (free). Code: GitHub (private repo).
- Database, login, file storage: Supabase free tier (region: Sydney, ap-southeast-2).
  Env names: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (safe for the browser), `SUPABASE_SERVICE_ROLE_KEY`
  (server only). Vercel wouldn't accept names containing "PUBLIC", so `next.config.mjs` passes the URL and
  publishable key to the browser as `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
  Use those NEXT_PUBLIC_ names in client code; never expose the service role key.
- Scheduled agents: Vercel Cron (free tier limits) or GitHub Actions or Supabase cron.
- Weather: Open-Meteo (no key). Music: Spotify Web API.

## Design rules (Option A — chosen)
- White background, black text (`--ink #0a0a0a`), greys only. No colour accents, no gradients, no emoji.
- Font: Inter. Cards: 1px `--line` border, 16px radius. Primary buttons are black.
- Collapsible sidebar (`components/Sidebar.tsx`): expanded = icon + full label; collapsed = 92px rail
  with icon + short label underneath (labels must always be visible). Choice is saved in localStorage.
  On phones (≤760px) it becomes a "Menu" button + slide-in drawer.
- Every icon-only button needs `aria-label`. Touch targets ≥ 44px. Text contrast ≥ 4.5:1.
- Must work well on iPhone (installed to Home Screen as a PWA) and on laptop/school PC.

## Structure
- `lib/nav.ts` — single source of truth for sidebar groups, labels, icons and each page's plan.
- Signed-in pages live in the `app/(app)/` route group (shares `app/(app)/layout.tsx`, which
  renders the sidebar and redirects signed-out users to `/login`). The `(app)` folder name is a
  route group — it does not appear in the URL, so `app/(app)/page.tsx` is still `/`.
- `app/(app)/page.tsx` — Home. `lib/sample.ts` holds sample data; replace each block with live data
  and delete the sample when done.
- `app/(app)/[section]/page.tsx` — placeholder page for every sidebar item that isn't built yet.
  When you build a real page, create `app/(app)/<slug>/page.tsx` AND set `built: true` on that item
  in `lib/nav.ts` (the placeholder skips built slugs in `generateStaticParams`, so they don't clash).
- Built pages so far: `assignments` (due-date tracker), `timetable`, `notes`, `planner`,
  `hsc-practice`, `tutor`, `summaries`, `flashcards`. Each has `page.tsx` (server, fetches data), usually a
  `*Client.tsx` (interactivity, optimistic updates) and `actions.ts` (server actions, RLS-scoped).
- `components/PageHeader.tsx` — shared breadcrumb + icon + title + lede for built pages.
- `components/DueSoon.tsx` — Home's live "Due soon" card. `lib/tasks.ts` — shared task shape +
  `formatDue` (pass `now` only after mount to avoid hydration mismatches).
- `app/(app)/settings/page.tsx` + `components/CanvasConnect.tsx` — Connections screen.
- `app/privacy/page.tsx`, `app/terms/page.tsx` — public legal pages (outside `(app)`, no sidebar,
  no login) for Google's OAuth consent screen. Keep them reachable while signed out.
- `components/Icon.tsx` — inline stroke icons. Add new ones to `PATHS`.

## Auth & data (Supabase, phase 1A)
- Email magic-link login via `@supabase/ssr`. `proxy.ts` (Next 16 middleware) refreshes the session
  and gates every route; only `/login`, `/auth/*`, `/privacy` and `/terms` are public.
- Supabase clients: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server
  components / route handlers), `lib/supabase/middleware.ts` (used by `proxy.ts`). Client code reads
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (mapped in `next.config.mjs`).
- Sign-in page: `app/login/page.tsx`. Magic-link lands on `app/auth/confirm/route.ts`; sign-out is
  `app/auth/signout/route.ts`.
- SQL schema + RLS: `supabase/migrations/`. `0001_init.sql` (profiles, connections, tasks, events,
  flashcards); `0002_phase1_more.sql` (timetable, notes, study_blocks). Run each in the Supabase SQL
  editor. See `SETUP.md` for the one-time dashboard steps.
- `lib/crypto.ts` — AES-256-GCM encrypt/decrypt for saved tokens, server-only (`TOKEN_ENCRYPTION_KEY`).
- `lib/ai.ts` — server-only AI router (`aiChat`, `aiConfigured`, `availableModels`). `MODELS` lists
  the free OpenAI-compatible models; only those with a key set (GEMINI/GROQ/OPENROUTER/MISTRAL) are
  offered. Model IDs get retired often and then just return errors: update `MODELS` from the
  provider deprecation pages linked in that file. AI pages (`tutor`, `summaries`, `hsc-practice`)
  are `force-dynamic`, `maxDuration = 60` and show `components/AiNotice.tsx` until a key is added.
  Only send school content to models — never names, emails or tokens.
- `components/ModelPicker.tsx` — the model dropdown and `useAiModel` (saved per device in
  localStorage). A pick that fails falls back to the next model, and the page says so.
- `components/DrawingPad.tsx` — handwriting canvas (pen tips, sizes, colours, straighten); exports a
  white-background JPEG. Pen colours are the one exception to the no-colour rule, because they're the
  student's own ink. Drawings need a model with `vision: true`.
- `components/RichTextEditor.tsx` — formatted typed answers, built on the browser's editing commands.
  Formatting is display-only: `toPlainText` sends text with `^`, `_` and `#` to the AI. Paste is
  plain text only, and the HTML is never saved.
- `lib/marking.ts` splits the marker's reply into sections and flashcards. `markAnswer` saves the
  flashcards automatically; `lib/flashcards.ts` schedules reviews, shown on `app/(app)/flashcards`.

## Secrets — non-negotiable
- API keys and tokens live ONLY in Vercel → Settings → Environment Variables (and `.env.local` for
  local dev, which is git-ignored). Names are listed in `.env.example`.
- Never hard-code a key, never commit `.env*`, never print keys in logs or the UI.
- User-supplied tokens (Canvas access token, Google refresh tokens) are stored in Supabase,
  encrypted with `TOKEN_ENCRYPTION_KEY` (AES-256-GCM), and only decrypted server-side.
- Supabase tables must have Row Level Security on; each row belongs to `auth.uid()`.

## Courses (use these exact names)
Engineering Studies · Mathematics Advanced · Mathematics Extension 1 · Mathematics Extension 2 ·
Physics · VET Entertainment · English Standard  (see `COURSES` in `lib/nav.ts`)

## Data sources
- **Canvas**: two methods. (1) Calendar feed — user pastes the `.ics` feed URL; parse VEVENTs
  (assignments appear as events). (2) Access token — REST API at `https://<school>.instructure.com/api/v1/`
  e.g. `/users/self/todo`, `/courses?enrollment_state=active`, `/courses/:id/assignments?bucket=upcoming`,
  `/announcements`. Token goes in the `Authorization: Bearer` header, server-side only.
- **Google**: OAuth 2.0, multiple accounts per user (personal + school). Scopes (read-only):
  `calendar.readonly`, `classroom.courses.readonly`, `classroom.coursework.me.readonly`,
  `drive.readonly`. Store refresh token per linked account. School accounts may be blocked by the
  school's admin — show a clear message suggesting sharing the school calendar to the personal account.
  The OAuth app must be published "In production" (unverified is fine) so refresh tokens don't expire
  after 7 days.
- **Compass / Atlantis Timetable**: no public API — use their calendar subscription (.ics) links.
- **Apple Calendar**: expose a private, unguessable `.ics` feed URL of the dashboard's calendar.
- **Apple Reminders / Siri**: provide an iOS Shortcut that calls a JSON endpoint
  (`/api/shortcuts/due`) authenticated with a per-user secret token.

## AI
- One router in `lib/ai.ts`: the picked model first, otherwise Gemini → Groq → OpenRouter → Mistral;
  on any failure move to the next, and show the student the real reason if all fail. All four are
  OpenAI-compatible chat endpoints. Keep model IDs in `MODELS` (they change often).
- Free tiers may use prompts for training: never send names, emails, tokens or other personal
  details to a model. Send only the school content needed.
- Tutor: hints first; full worked solution only when the user asks.
- Agents (scheduled): morning briefing (7am Sydney, push to iPhone), new-assignment catcher
  (hourly), upload summariser (on upload).

## HSC practice
- Link each course/topic to NESA's official past papers and marking guidelines (link, don't copy the
  papers into this repo or re-host them).
- Generate NEW HSC-style questions per syllabus topic; mark answers against the style of NESA
  marking guidelines and show the marking criteria used.
- Exam mode with real HSC time limits.

## Build phases
1. Home, timetable, calendar, combined due-date tracker (incl. Canvas) — **current**
2. HSC practice + marking, flashcards (spaced repetition), study planner
3. AI agents, tutor chat, summaries
4. Personal: notes, to-do, shifts, pay & budget, habits

## Working style
- Small, reviewable commits. Run `npm run build` before committing; it must pass.
- Explain any manual step the user must do (accounts, keys, settings) in plain language with
  numbered steps — the user is new to coding.
