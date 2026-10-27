# Setup — Phase 1A (Supabase login + database)

Do these once. They're all in web dashboards — no coding. Follow them top to bottom.

## 1. Create the Supabase project
1. Go to <https://supabase.com> and sign in (free tier is fine).
2. Click **New project**.
3. Name it `dashboard`, set a database password (save it in your password manager),
   and choose region **Sydney (ap-southeast-2)**.
4. Wait for it to finish setting up (a minute or two).

## 2. Create the database tables
1. In your project, open **SQL Editor** (left sidebar) → **New query**.
2. Open the file [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in this repo,
   copy **everything**, and paste it into the editor.
3. Click **Run** (bottom right). You should see "Success. No rows returned".
4. Check **Table Editor** — you should now see `profiles`, `connections`, `tasks`,
   `events` and `flashcards`. Each one has the shield icon meaning Row Level Security is on.

> Re-running the file later is safe — it won't duplicate anything.

## 3. Turn on email magic-link login
1. Open **Authentication → Sign In / Providers → Email**.
2. Make sure **Email** is enabled and **"Confirm email"** is on. (Password can stay off —
   we only use magic links.)
3. Open **Authentication → URL Configuration** and set:
   - **Site URL**: your live site, e.g. `https://your-dashboard.vercel.app`
   - **Redirect URLs** (add each): `https://your-dashboard.vercel.app/auth/confirm`
     and `http://localhost:3000/auth/confirm`
4. **(Optional — you can skip this.)** The sign-in link in the default email already works,
   because `app/auth/confirm/route.ts` handles Supabase's default link format too.
   If you want to tidy the link anyway: left sidebar **Authentication → Emails → Templates**
   tab → **Magic Link**, and set the link `href` to:
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
   ```
   then Save. (On new free-tier projects this editor can be read-only unless you add custom
   SMTP — that's fine, just skip it.)

## 4. Copy the Supabase keys
Open **Project Settings → API** and copy these into Vercel (next step):
- **Project URL** → `SUPABASE_URL`
- **anon public / publishable** key → `SUPABASE_PUBLISHABLE_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (optional for now; keep it secret)

> The names have no `PUBLIC` prefix on purpose (Vercel rejects those). `next.config.mjs`
> re-exposes the URL and publishable key to the browser as `NEXT_PUBLIC_…` automatically.

## 5. Add the environment variables in Vercel
In **Vercel → your project → Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | the Project URL from step 4 |
| `SUPABASE_PUBLISHABLE_KEY` | the publishable (anon) key from step 4 |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key (optional now) |
| `TOKEN_ENCRYPTION_KEY` | the key I gave you in chat (keep it secret) |

Apply them to **Production, Preview and Development**, then **redeploy**.

## 6. For local development
Open `.env.local` (already created, git-ignored) and replace the two `REPLACE-ME`
placeholders in `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` with your Project URL
and publishable key. The `TOKEN_ENCRYPTION_KEY` is already filled in. Then run `npm run dev`.

## 7. Invite yourself
The site only lets in accounts you add. In **Authentication → Users → Add user →
Create new user**, add your email (or just sign in once with your email and approve
the magic link). After that, open the site, enter your email, and click the link.
