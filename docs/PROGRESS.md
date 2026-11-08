# Progress: agents task (spec in docs/TASK-agents.md)

Update this after every stage. A new session continues from the first unchecked item.

- [x] Prerequisites checked — login + RLS (supabase/schema.sql), lib/ai.ts router, lib/subjects.ts, dedupe cron all exist.
- [x] Stage A — installable app: manifest + shortcuts, iOS tags, public/sw.js (push, clicks, offline), /offline, /install, tablet rail default, safe areas, AutoRefresh on Home. AppBadge component exists; wire it to the Inbox unread count in Stage E.
- [x] Stage B — push: web-push + `npm run vapid`, NEXT_PUBLIC_VAPID_PUBLIC_KEY mapping, supabase/agents.sql (push_subscriptions, notification_settings), lib/push.ts sendPush/decide, /api/push/subscribe + /test, /settings/notifications. Unit tests for decide/inQuietHours still to write (Housekeeping).
- [x] Stage C — per-user keys: user_api_keys (RLS, no policies, revoked; PGlite-tested), lib/crypto encryptSecret/decryptSecret + PREVIOUS key + `npm run reencrypt`, lib/redact.ts, lib/ai-keys.ts (resolveKeys, budgets, ai_usage, markKey), lib/ai.ts aiChat({userId…})/callAI/aiReadyFor, AI_MOCK via lib/ai-mock.ts, /settings/ai-keys (save/test/remove, 10 tests/hour, daily budget). All callers pass userId. Owner-only env key list in Settings.
- [x] Stage D — agents/agent_runs/agent_findings/reports/external_items in agents.sql; lib/agents/{types,schedule,sanitize,context,custom,engine,registry}.ts; /api/agents/tick (AGENT_SECRET, lib/bearer.ts) + /api/agents/run; docs/github/agents-tick.yml (Cameron adds it on GitHub); safe-fetch fetchPage/htmlToText (robots, 1 MB, 10 s, 6 h cache); `npm test` (tests/register.mjs + tests/core.test.ts: DST schedule, sanitizer, redact, crypto rotation, push rules); docs/ADDING_AN_AGENT.md. Registry is empty until Stage E/K add built-ins.
- [ ] Stage E — The BRIAN, /inbox, /ai-agents orbit hub, ensureDefaultAgents
- [ ] Stage F — Google OAuth + /calendar views, remove Compass
- [ ] Stage G — iPhone & Siri (device tokens, /api/shortcuts/*, .ics feed, recipes)
- [ ] Stage H — Spotify
- [ ] Stage I — Study planner (dated blocks, free-time, validation) + assistant (actions, preview, undo)
- [ ] Stage J — Pay: AI weekly budget plan
- [ ] Stage K — specialist agents (assignments, deadlines, cleaning_hours, study, school_coach + /coach, opportunities + /money-ideas)
- [ ] Stage L — About me (/profile, facts, samples, getProfileContext)
- [ ] Housekeeping — env.example, nav, icons, CLAUDE.md, README, ADDING_AN_AGENT.md, tests, viewport checks, final summary for Cameron

## How to build here
The repo is in iCloud and its node_modules folder is empty. Build in a scratch copy:
`rsync -a --delete --exclude node_modules --exclude .next --exclude .git --exclude .env.local <repo>/ <scratch>/app/`, then `npm ci` once in `<scratch>/app`, then `npx tsc --noEmit && npm run build` (no env vars). If you add packages, run `npm i` in the scratch copy and copy package.json + package-lock.json back.
Git in the iCloud folder is slow: run commits and pushes in the Terminal panel (one-line commands; put multi-line messages in a file and use `git commit -F`). Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `.env*`.

## Notes
- The scheduler workflow lives at docs/github/agents-tick.yml: Cameron must create .github/workflows/agents-tick.yml in GitHub's website (the local token can't push workflow files).
- IMPORTANT for Cameron: AI now uses each person's own keys. Site (Vercel) keys only work for OWNER_EMAIL, so set OWNER_EMAIL to his email in Vercel (or add his own key in Settings → AI keys).
