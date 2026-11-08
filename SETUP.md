# Setup — Supabase, accounts and keys

Do these once. They're all in web dashboards — no coding. Follow them top to bottom.

## 1. Create the Supabase project
1. Go to <https://supabase.com> and sign in (free tier is fine).
2. Click **New project**.
3. Name it `dashboard`, set a database password (save it in your password manager),
   and choose region **Sydney (ap-southeast-2)**.
4. Wait for it to finish setting up (a minute or two).

## 2. Create (or update) the database tables
1. In your project, open **SQL Editor** (left sidebar) → **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) in this repo, copy **everything**, and paste it in.
3. Click **Run** (bottom right). You should see "Success. No rows returned".
4. Check **Table Editor**: every table (profiles, tasks, flashcards, uploads, notes, todos, jobs,
   shifts, transactions, budget_limits, savings_goals, habits, habit_logs and more) shows the
   shield icon, meaning Row Level Security is on.

> Running it again is always safe and never deletes your data. Run it again whenever
> `supabase/schema.sql` changes (the commit message will say so).

## 3. Login settings
1. **Authentication → Sign In / Providers → Email**: keep **Email** enabled. Turn **"Allow new
   users to sign up"** **off**: accounts are only made through the site's Create account form,
   which checks your invite code (it uses the service-role key, so it still works with this off).
   "Confirm email" doesn't matter for accounts made by the form, which are confirmed already.
2. **Authentication → URL Configuration**:
   - **Site URL**: your live site, e.g. `https://your-dashboard.vercel.app`
   - **Redirect URLs** (add each): `https://your-dashboard.vercel.app/auth/confirm`
     and `http://localhost:3000/auth/confirm` (used by "Forgot your password?").

## 4. Copy the Supabase keys
Open **Project Settings → API** and copy these into Vercel (next step):
- **Project URL** → `SUPABASE_URL`
- **anon public / publishable** key → `SUPABASE_PUBLISHABLE_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (needed for Create account and the daily
  flashcard check; keep it secret, never paste it anywhere else)

> The names have no `PUBLIC` prefix on purpose (Vercel rejects those). `next.config.mjs`
> re-exposes the URL and publishable key to the browser as `NEXT_PUBLIC_…` automatically.

## 5. Add the environment variables in Vercel
In **Vercel → your project → Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | the Project URL from step 4 |
| `SUPABASE_PUBLISHABLE_KEY` | the publishable (anon) key from step 4 |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 4 |
| `TOKEN_ENCRYPTION_KEY` | the key I gave you in chat (keep it secret) |
| `INVITE_CODE` | a code you choose and give to friends (e.g. three random words) |
| `CRON_SECRET` | a long random string: run `openssl rand -hex 32` in Terminal and paste the result |

Apply them to **Production, Preview and Development**, then **redeploy** (Deployments → ⋯ → Redeploy).

## 6. For local development
Put the same names in `.env.local` (git-ignored) and run `npm run dev`.

## 7. Your account, and inviting friends
- **You**: if you used the old email-link sign-in, your account already exists. On the sign-in
  page tap **Forgot your password?**, open the emailed link, then set a password in
  **Settings → Your account**. (Or use **Create account** if you never signed in before.)
- **Friends**: send them the site link and the invite code. They tap **Create account** and fill
  in their name, email, password and the code. Each account only ever sees its own data.

## 8. (Optional) Switch on the AI features
The **AI tutor**, **Summaries** and **HSC practice** marking need a free AI key. Add **any one**
of these in **Vercel → Settings → Environment Variables** (Production, Preview, Development),
then **redeploy**. The app tries whichever keys are present, in this order:

| Name | Get a free key at |
|------|-------------------|
| `GROQ_API_KEY` | <https://console.groq.com> (fastest to set up) |
| `GEMINI_API_KEY` | <https://aistudio.google.com> |
| `OPENROUTER_API_KEY` | <https://openrouter.ai> |
| `MISTRAL_API_KEY` | <https://console.mistral.ai> |
| `CEREBRAS_API_KEY` | <https://cloud.cerebras.ai> |

More keys means more models in the dropdown: each provider's other free chat models are listed
under "more models" automatically.

You can then choose a model from the **AI model** dropdown on each of those pages, or leave it on
Auto. Marking a **drawn** answer needs a model that can read images: Gemini, Groq and OpenRouter
have one, and Mistral doesn't.

Free model names change often. If one stops working, you can name a replacement without any code
change: add `GEMINI_MODEL`, `GROQ_MODEL`, `OPENROUTER_MODEL` (a `:free` model) or `MISTRAL_MODEL`
in Vercel and redeploy, and it's tried first for that provider.

Free AI tiers may use what you send to train their models, so only school content is ever sent:
never names, emails or keys (Summaries also blanks out emails and phone numbers in uploads).

Until a key is added, those three pages show a short "add a key" note. Everything else
(Timetable, Notes, Study planner, Assignments) works without any AI key.

## 9. (Optional) Connect your Sentral or Atlantis timetable
No keys needed: this is done on the site itself. The dashboard can't sign in with your school email
and password (neither Sentral nor Atlantis allows that for other apps), so use one of these:

**A calendar link (best, keeps itself up to date)**
1. Sign in to **Sentral** or **Atlantis** and open your timetable or calendar.
2. Look for **Subscribe**, **Sync**, **iCal**, **Calendar** or **Export**, and copy the link (often `webcal://…`).
3. On the dashboard, open **Settings → Timetable & calendar**, pick **Sentral** or **Atlantis**, paste the
   link and click **Test & connect**. You can connect both.

**Paste your timetable (when there's no link)**
1. Open your timetable in Atlantis or Sentral, ideally on a computer.
2. Select the whole timetable table, from the row of day names to the last class, and copy it.
3. On the dashboard, open **Timetable → Paste from Atlantis or Sentral**, click in the box and paste.
4. Check the classes it found, untick any mistakes, and click **Save**. Teacher names are left out.

**A calendar file**: got a **.ics** download? Use **Import a calendar file** on the Settings card.

## 10. (Optional) Connect Canvas
1. In Canvas, click **Account → Settings**. Under **Approved Integrations**, click **+ New Access Token**,
   name it "Dashboard" and click **Generate Token**. Copy it straight away (Canvas only shows it once).
2. On the dashboard, open **Settings → Canvas**, paste your school's Canvas address (e.g.
   `yourschool.instructure.com`) and the token, then click **Test & connect**.
3. Your Canvas work appears on **Assignments**, **Home** and **Calendar**, and things you've submitted
   are ticked off. It checks again whenever you open Assignments or Home (at most every 30 minutes),
   or click **Sync now**.

No **New Access Token** button? Your school has turned tokens off. Choose **Calendar feed link** instead:
in Canvas open **Calendar → Calendar Feed**, copy the link and paste it in. To cut off access later,
delete the token in Canvas, or click **Disconnect** on the dashboard.

## 11. Daily flashcard duplicate check
`vercel.json` asks Vercel to call `/api/cron/dedupe-flashcards` every day at 19:00 UTC
(about 6 am Sydney in summer, 5 am in winter). It only runs if `CRON_SECRET` is set (step 5).
On the free Hobby plan a daily job can run up to an hour late. It only looks at cards added since
the last check and sends just the question text to the AI. You can also press
**Check for duplicates now** on the Flashcards page; hidden cards can be restored there.
To see it ran: Vercel → your project → **Logs**, search "Flashcard dedupe".
