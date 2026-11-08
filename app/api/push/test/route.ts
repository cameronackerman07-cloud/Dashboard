import { NextResponse } from "next/server";
import { pushConfigured, sendPush } from "@/lib/push";
import { currentUserId } from "@/lib/supabase/server";

// "Send test notification": ignores quiet hours and the daily cap.
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ ok: false, message: "Push isn't set up yet: the VAPID keys haven't been added in Vercel." });
  const res = await sendPush(userId, { title: "Test notification", body: "Notifications are working on this device.", url: "/settings/notifications", category: "reminders" }, { force: true });
  return NextResponse.json(
    res.sent > 0
      ? { ok: true, message: `Sent to ${res.sent} device${res.sent === 1 ? "" : "s"}.` }
      : { ok: false, message: res.skipped === "no devices" ? "No devices yet. Turn on notifications on this device first." : "Couldn't send. Try turning notifications off and on again." },
  );
}
