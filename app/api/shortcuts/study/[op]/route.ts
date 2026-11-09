import { NextResponse } from "next/server";
import { rateLimited, verifyDeviceToken } from "@/lib/device-tokens";
import { activeSession, finishSession, startSession, studySummary } from "@/lib/study-sessions";
import { clock, remainingSeconds } from "@/lib/study-time";
import { createAdminClient } from "@/lib/supabase/admin";

// Siri / Shortcuts study timer:
//   POST /api/shortcuts/study/start   {"minutes": 25, "subject": "Physics", "topic": "…"}
//   POST /api/shortcuts/study/stop
//   GET  /api/shortcuts/study/status?format=text
// Auth: "Authorization: Bearer dash_…" (Settings → iPhone & Siri). Start and stop need a write token.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ op: string }> };

function reply(request: Request, json: Record<string, unknown>, text: string, status = 200) {
  if (new URL(request.url).searchParams.get("format") === "text") {
    return new NextResponse(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.json({ ...json, text }, { status });
}

async function handle(request: Request, { params }: Ctx) {
  const { op } = await params;
  if (!["start", "stop", "status"].includes(op)) return reply(request, { ok: false }, "Unknown shortcut.", 404);
  const who = await verifyDeviceToken(request);
  if (!who) return reply(request, { ok: false }, "That token isn't valid. Make a new one in Settings, iPhone and Siri.", 401);
  if (rateLimited(who.tokenId)) return reply(request, { ok: false }, "Too many requests. Try again in a minute.", 429);
  if (op !== "status" && (who.scope !== "write" || request.method !== "POST")) {
    return reply(request, { ok: false }, "This shortcut needs a token with write access, sent with POST.", 403);
  }
  const db = createAdminClient();
  const uid = who.userId;

  if (op === "status") {
    const [open, sum] = await Promise.all([activeSession(db, uid), studySummary(db, uid)]);
    const running = open ? ` A ${open.subject} timer is ${open.status === "paused" ? "paused" : "running"} with ${clock(Math.max(0, remainingSeconds(open, Date.now())))} left.` : "";
    return reply(request, { ok: true, today_seconds: sum.today, week_seconds: sum.week, total_seconds: sum.total, running: !!open }, `${sum.text}${running}`);
  }

  if (op === "start") {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const res = await startSession(db, uid, {
      minutes: Number(body.minutes ?? 25),
      subject: typeof body.subject === "string" ? body.subject : "Study",
      topic: typeof body.topic === "string" ? body.topic : null,
      source: "siri",
    });
    return reply(request, { ok: res.ok }, res.message, res.ok ? 200 : 409);
  }

  const res = await finishSession(db, uid);
  return reply(request, { ok: res.ok }, res.message, res.ok ? 200 : 404);
}

export const GET = handle;
export const POST = handle;
