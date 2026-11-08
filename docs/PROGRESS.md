# Progress: agents task (spec in docs/TASK-agents.md)

Update this after every stage. A new session continues from the first unchecked item.

- [x] Prerequisites checked — login + RLS (supabase/schema.sql), lib/ai.ts router, lib/subjects.ts, dedupe cron all exist.
- [x] Stage A — installable app: manifest + shortcuts, iOS tags, public/sw.js (push, clicks, offline), /offline, /install, tablet rail default, safe areas, AutoRefresh on Home. AppBadge component exists; wire it to the Inbox unread count in Stage E.
- [ ] Stage B — push notifications (web-push, VAPID, push_subscriptions, notification_settings, Settings → Notifications, lib/push.ts)
- [ ] Stage C — per-user AI keys (user_api_keys, encryptSecret/decryptSecret + rotation, redactSecrets, /settings/ai-keys, callAI({userId,…}), shared fallback, budgets, AI_MOCK)
- [ ] Stage D — agent framework (supabase/agents.sql, lib/agents/*, schedule + DST tests, tick + run routes, GitHub Actions workflow, safe-fetch upgrades, sanitizeForAI)
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
