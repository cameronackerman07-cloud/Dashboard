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
- `app/(app)/page.tsx` — Home. Today, Due soon (tasks + dated to-dos), Habits this week, Next
  shift, The BRIAN's latest briefing, the Ask bar and Spotify are live; countdowns and weather are still examples.
- `app/(app)/[section]/page.tsx` — placeholder page for every sidebar item that isn't built yet.
  When you build a real page, create `app/(app)/<slug>/page.tsx` AND set `built: true` on that item
  in `lib/nav.ts` (the placeholder skips built slugs in `generateStaticParams`, so they don't clash).
- Built pages so far: `assignments` (due-date tracker), `timetable`, `notes` (+ `notes/[id]` editor),
  `planner`, `hsc-practice`, `tutor`, `summaries`, `flashcards`, `calendar`, `todo`, `shifts`, `pay`,
  `habits`, `inbox`, `ai-agents`, `assistant`, `coach`, `money-ideas`, `profile` (About me). Each has `page.tsx` (server, fetches data), usually a `*Client.tsx` (interactivity,
  optimistic updates) and `actions.ts` (server actions, RLS-scoped, return `Reply` from
  `lib/validate.ts`; `components/useAction.tsx` runs them and shows the reply).
- Personal pages: all times are Australia/Sydney — store `timestamptz`, parse and show with the
  helpers in `lib/time.ts` (`dayKey`, `sydneyInstant`, `mondayOf`, `monthRange`…), never the server's
  timezone. Money is integer cents (`lib/money.ts`). Shift maths (paid minutes, pay, clashes) is
  `lib/shifts.ts`; budget categories `lib/budget.ts`; streaks `lib/habits.ts`.
- Subjects: `lib/subjects.ts` — `SUBJECT_GROUPS` (every NSW Stage 6 subject from NESA's 2026 HSC
  course list, "My courses" first), `SYLLABUS` suggested modules (the seven courses come from
  `lib/hsc.ts` TOPICS), `cleanSubject`/`optionalSubject`. `components/SubjectSelect.tsx` is the picker
  used on Summaries, Flashcards, To-do and Notes. Modules and topics stay free text.
- Study planner (`/planner`): dated blocks (`study_blocks.starts_at/ends_at`, `plan_id` → `study_plans`) plus the
  older repeating blocks (`day_of_week/start_min`, still shown under "Every week"). `lib/planner/free-time.ts` works
  out free windows; the AI only picks subjects/topics/kinds, then `lib/planner/validate.ts` checks every block (inside
  a free window, no overlaps, 20–120 min, daily caps from `user_settings`, rest day, one rest block). Never trust the
  AI's times.
- Assistant (`/assistant`, "Ask The BRIAN"): JSON reply `{mode, reply, actions}` parsed by `lib/assistant/schema.ts`
  (strict allowlist, no deleting/editing existing data). Actions are previewed and only run on Apply (or at once for
  tiny ones if "Ask before changing things" is off); `lib/assistant/apply.ts` writes with the user's RLS client and
  logs created row ids in `assistant_actions` for Undo. Only the student's typed message reaches the model.
- `components/PageHeader.tsx` — shared breadcrumb + icon + title + lede for built pages.
- `components/DueSoon.tsx` — Home's live "Due soon" card. `lib/tasks.ts` — shared task shape +
  `formatDue` (pass `now` only after mount to avoid hydration mismatches).
- `app/(app)/settings/page.tsx` — Connections screen. Its server actions are `app/(app)/settings/actions.ts`.
  "Your week" card (`components/WeekSettings.tsx`, `settings/week-actions.ts`): pay-week start + weather town
  (Open-Meteo geocoding, town only, location rounded) → `user_settings.pay_week_start/region/lat/lng`.
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
  flashcards automatically (subject = course, module = practice topic, topic "Practice mistakes").
- `aiJson(messages, parse, opts)` in `lib/ai.ts` asks for a JSON object, strips code fences, validates
  with `parse` and retries once on the same model. `GEMINI_MODEL` / `GROQ_MODEL` / `OPENROUTER_MODEL` /
  `MISTRAL_MODEL` env vars put a model first for that provider; `budgetMs` sets the total time.
- Summaries: upload PDF/DOCX/TXT/MD (4 MB max; photos not yet) → `lib/extract.ts` (unpdf, mammoth) →
  `lib/summarise.ts` (redacts emails/phones, caps at 30k chars, ~11k-char chunks in parallel, JSON
  title/subject/sections/flashcards) → `uploads` row (extracted text only, never the file) + new
  `flashcards` with `upload_id`, skipping any question whose `norm_key` the user already has.
  Deleting an upload keeps its cards unless "also delete its flashcards" is ticked.
- Flashcards (`flashcards` table: subject not null, module, topic, norm_key, reps, lapses, ease,
  interval_days, due_at, upload_id, deduped_at, duplicate_of): browse Subject → Module → Topic
  ("General" when empty), study due / any group / all / random 20, edit and move cards, keyboard
  1–4 and Space. `lib/flashcards.ts`: SM-2 `nextReview`, `normKey`.
- Duplicate check: `lib/dedupe.ts` `dedupeUser` — exact `norm_key` matches in code, then the AI groups
  same-meaning questions (fronts only, 150 per batch at most); keeps the most-reviewed/oldest card,
  sets `duplicate_of` on the others (soft archive, restorable), stamps `deduped_at`. Only unchecked
  cards can be hidden and subjects with nothing new are skipped. Runs daily from
  `app/api/cron/dedupe-flashcards/route.ts` (Vercel Cron in `vercel.json`, 19:00 UTC, needs
  `Authorization: Bearer $CRON_SECRET`, service-role client, one user at a time, logs counts only)
  and from the "Check for duplicates now" button.

## Agents (docs/TASK-agents.md has the full spec)
- Per-user AI keys: each person adds their own free keys (Settings → AI keys, `user_api_keys`, encrypted,
  no RLS policies). Site env keys only serve `OWNER_EMAIL` (or friends if `SHARED_AI_FOR_FRIENDS`). `AI_MOCK=1` fakes AI locally.
- Tables for agents, push, Google/Spotify, Siri tokens, planner, budget plans, coach, money ideas and About me are
  in `supabase/agents.sql` (run after schema.sql; re-runnable). Compass was removed everywhere.
- Framework: `lib/agents/` (types, schedule in Sydney time, context, engine, registry, custom agents).
  `/api/agents/tick` (Bearer `AGENT_SECRET`, service-role, every query scoped by user_id, specialists before
  The BRIAN, ~45 s budget) is called every 30 min by GitHub Actions (`docs/github/agents-tick.yml`).
- Built-ins (`lib/agents/builtin/`): `brian` (chief: briefing 07:00, Sunday reset 18:30, urgent alerts),
  `assignments` (hourly, `lib/agents/watch.ts`), `deadlines` (2-hourly, `lib/deadlines.ts`), `cleaning_hours`
  (Wed 07:00, `lib/cleaning.ts`, jobs.weekly_hours_report), `study` (16:00), `school_coach` (Mon 16:30, `lib/coach.ts`),
  `opportunities` (Money ideas, daily 09:00 + Saturday strategy, `lib/money-ideas.ts`), `about_me` (Sun 17:00,
  `lib/about-me.ts` + `lib/about-me-server.ts`). Prefer plain code; AI only for wording/ideas, with template fallbacks.
- Safety: scheduled agents are read-only on user data; they only write findings, reports, external_items,
  money_ideas, About me suggestions and run logs. Never email, message, apply, buy or edit calendars. Fetched
  content is untrusted data in `<data>` blocks; AI JSON is validated strictly; every AI input goes through
  `sanitizeForAI`; logs hold counts only. Only the assistant (`/assistant`) changes data, after the user asks and confirms.
- About me: only confirmed facts reach agents (`getProfileContext` → style guide, no names/contacts). Sensitive
  topics are filtered out (`isSensitive`). Learning sources are opt-in switches, default off.
- Real SMS (`lib/sms.ts`) is a stub that stays off; the iPhone Shortcut automation is the free texting route.

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
- **Atlantis Timetable / Sentral** (Compass support was removed): no public API — use their calendar subscription (.ics)
  links, an .ics file, or the Timetable paste importer. Never store school passwords.
- **Apple Calendar**: expose a private, unguessable `.ics` feed URL of the dashboard's calendar.
- **Apple Reminders / Siri**: provide an iOS Shortcut that calls a JSON endpoint
  (`/api/shortcuts/due`) authenticated with a per-user secret token.

## AI
- One router in `lib/ai.ts`: the picked model first, otherwise Gemini → Groq → OpenRouter → Mistral;
  on any failure move to the next, and show the student the real reason if all fail. All four are
  OpenAI-compatible chat endpoints. Keep model IDs in `MODELS` (they change often).
- Free tiers may use prompts for training: never send names, emails, tokens or other personal
  details to a model. Send only the school content needed (Summaries redacts emails and phone
  numbers and never sends the filename; the duplicate check sends card fronts only). The upload
  page tells students not to upload anything with personal details.
- Tutor: hints first; full worked solution only when the user asks.
- Agents (scheduled): see the Agents section above.

## HSC practice
- Link each course/topic to NESA's official past papers and marking guidelines (link, don't copy the
  papers into this repo or re-host them).
- Generate NEW HSC-style questions per syllabus topic; mark answers against the style of NESA
  marking guidelines and show the marking criteria used.
- Exam mode with real HSC time limits.

## Build phases
1. Home, timetable, calendar, combined due-date tracker (incl. Canvas) — done
2. HSC practice + marking, flashcards (spaced repetition), study planner — done
3. AI agents, tutor chat, summaries — done (agents spec: docs/TASK-agents.md, progress: docs/PROGRESS.md)
4. Personal: notes, to-do, shifts, pay & budget, habits — done

## Working style
- Small, reviewable commits. Run `npm run build` before committing; it must pass.
- Explain any manual step the user must do (accounts, keys, settings) in plain language with
  numbered steps — the user is new to coding.
