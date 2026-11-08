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
  `hsc-practice`, `tutor`, `summaries`, `flashcards`, `calendar`. Each has `page.tsx` (server, fetches data), usually a
  `*Client.tsx` (interactivity, optimistic updates) and `actions.ts` (server actions, RLS-scoped).
- `components/PageHeader.tsx` — shared breadcrumb + icon + title + lede for built pages.
- `components/DueSoon.tsx` — Home's live "Due soon" card. `lib/tasks.ts` — shared task shape +
  `formatDue` (pass `now` only after mount to avoid hydration mismatches).
- `app/(app)/settings/page.tsx` — Connections screen. Its server actions are `app/(app)/settings/actions.ts`.
- Calendar links: `components/CalendarConnect.tsx`. One link per source (`lib/calendar-sources.ts`:
  providers `sentral`, `atlantis`, `ical`), stored encrypted in `connections`. `lib/calendar.ts`
  fetches them server-side (checks in `lib/safe-fetch.ts`: https only, public hosts, checked redirects,
  3 MB cap), caches 15 min, and merges imported .ics files (`events`, source `sentral-file`) and due tasks.
- No password logins for Sentral or Atlantis: neither offers one for other apps, Atlantis's terms ban
  sharing logins, and the school password must not be stored here. Links, .ics files, or the paste
  importer instead (`app/(app)/timetable/TimetablePaste.tsx` + `lib/timetable-paste.ts`): reads a
  copied timetable table, tab-separated text or typed lines in the browser, keeps subject, room and
  period only, then `importClasses` saves to `timetable`.
- Canvas: `components/CanvasConnect.tsx` + `lib/canvas.ts`. Address + access token (planner API) or
  calendar feed link, saved encrypted as JSON in `connections` (provider `canvas`). Syncs into `tasks`
  (source `canvas`, external_id like `assignment:123`) on connect, "Sync now", and when Assignments or
  Home opens if the last sync is over 30 min old. The token is only sent to the saved Canvas origin:
  redirects aren't followed and pagination links to other origins are ignored. Submitted work is
  ticked off; a sync never un-ticks. `lib/courses.ts` maps school class names to COURSES.
  `lib/ics.ts` parses .ics (time zones, daily/weekly repeats); `lib/time.ts` formats in Sydney time
  so server and browser output match. Used by `calendar`, `timetable` and Home's Today card.
- `app/privacy/page.tsx`, `app/terms/page.tsx` — public legal pages (outside `(app)`, no sidebar,
  no login) for Google's OAuth consent screen. Keep them reachable while signed out.
- `components/Icon.tsx` — inline stroke icons. Add new ones to `PATHS`.

## Auth & data (Supabase)
- Email + password accounts for Cameron and invited friends; every row is private to its owner (RLS).
  `app/login/` has Sign in / Create account tabs and "Forgot your password?" (emails a one-time
  link via `app/auth/confirm`, which only redirects to paths on this site; then set a password in Settings).
- Sign-in, sign-up and the forgot-password email are route handlers in `app/api/auth/*`. Sign-up uses the
  service-role client (`lib/supabase/admin.ts`) to `auth.admin.createUser({ email_confirm: true })`, so
  no confirmation email. If `INVITE_CODE` is set, sign-up needs it (`lib/auth.ts`, compared in constant time).
- `proxy.ts` (Next 16 middleware) refreshes the session and gates every route; public: `/login`,
  `/auth/*`, `/api/auth/*`, `/api/cron/*` (checks `CRON_SECRET` itself), `/privacy`, `/terms`, manifest, icons.
- Supabase clients: `lib/supabase/client.ts` (browser), `server.ts` (server components, route handlers,
  actions; `currentUserId()`), `middleware.ts` (used by `proxy.ts`), `admin.ts` (service role: sign-up and
  cron only). `lib/supabase/env.ts` → `supabaseConfigured()`: with no Supabase env vars the build still
  passes and every page shows "Supabase isn't connected yet".
- `profiles.display_name` (set at sign-up, editable in Settings → Your account) feeds the sidebar and
  the Home greeting via `lib/profile.ts` (`getProfile`, cached per request).
- ALL schema + RLS lives in one re-runnable file, `supabase/schema.sql` (paste into Supabase → SQL
  Editor → Run, again after every change). Every table has `user_id default auth.uid()` and an
  "all own" policy; links between a user's rows use composite foreign keys `(id, user_id)` so no one
  can point at someone else's row.
- `lib/crypto.ts` — AES-256-GCM encrypt/decrypt for saved tokens, server-only (`TOKEN_ENCRYPTION_KEY`).
- `lib/ai.ts` — server-only AI router (`aiChat`, `aiConfigured`, `availableModels`). `MODELS` is the
  recommended list Auto tries; the picker also lists every other chat model each provider's `/models`
  endpoint returns for the key (cached an hour; OpenRouter filtered to free models). Keys:
  GEMINI/GROQ/OPENROUTER/MISTRAL/CEREBRAS. Model IDs get retired often and then just return errors: update `MODELS` from the
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
- `lib/hsc.ts` — band levels (E1–E4 for Extension courses), syllabus topics per course (`TOPICS`, with
  suggested Refine keywords; Maths and English follow the 2024 syllabuses, first HSC 2027; Physics
  stays on the 2017 syllabus until the 2028 HSC), the multiple-choice shape, and per-course past-paper links. Past papers are linked, never copied or scraped (NESA's and schools'
  copyright); "My own question" lets the student paste one in to be marked.
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
- **Compass / Atlantis Timetable / Sentral**: no public API — use their calendar subscription (.ics)
  links, an .ics file, or the Timetable paste importer. Never store school passwords.
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
