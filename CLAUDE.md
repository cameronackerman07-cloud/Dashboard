# CLAUDE.md — Dashboard

Personal school + life dashboard for Cameron (Year 11 NSW, starting the HSC course, Term 4 2026).
Read this before every task. Keep it up to date when decisions change.

## Stack (keep it free)
- Next.js 16 (App Router, TypeScript), plain CSS in `app/globals.css` — no Tailwind, no UI kit.
- Hosting: Vercel (free). Code: GitHub (private repo).
- Database, login, file storage: Supabase free tier (region: Sydney, ap-southeast-2).
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
- `app/page.tsx` — Home. `lib/sample.ts` holds sample data; replace each block with live data and
  delete the sample when done.
- `app/[section]/page.tsx` — placeholder page for every sidebar item. When building a real page,
  create `app/<slug>/page.tsx`; it overrides the placeholder automatically.
- `app/settings/page.tsx` + `components/CanvasConnect.tsx` — Connections screen.
- `components/Icon.tsx` — inline stroke icons. Add new ones to `PATHS`.

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
- One router in `lib/ai.ts`: try providers in order Gemini → Groq → OpenRouter (`:free` models) →
  Mistral; on rate-limit/5xx move to the next. Groq, OpenRouter and Mistral are OpenAI-compatible
  chat endpoints; Gemini has an OpenAI-compatible endpoint too. Keep model IDs in one config object
  (they change often — check each provider's docs when building).
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
