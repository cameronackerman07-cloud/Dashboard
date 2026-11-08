import "server-only";
import webpush from "web-push";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { dayKey, timeKey } from "@/lib/time";

// Web Push (free): sends a notification to every device a user turned it on for,
// respecting their quiet hours, category switches, daily cap and lock-screen
// privacy. Uses the service-role client, so every query is scoped by user_id.

export type PushCategory = "briefing" | "alerts" | "reminders" | "cleaning" | "money" | "school";
export const PUSH_CATEGORIES: { id: PushCategory; label: string }[] = [
  { id: "briefing", label: "Morning briefing and Sunday reset" },
  { id: "alerts", label: "Urgent alerts (clashes, overdue work)" },
  { id: "reminders", label: "Reminders" },
  { id: "cleaning", label: "Cleaning hours report" },
  { id: "money", label: "Money ideas" },
  { id: "school", label: "School coach" },
];

export type PushMessage = {
  title: string;
  body: string;
  url?: string; // a path on this site, e.g. "/inbox"
  category: PushCategory;
  importance?: number; // 1–5; 5 may break quiet hours if the user allows it
  tag?: string;
};

export type PushResult = { sent: number; skipped?: string };

export function pushConfigured(): boolean {
  return !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY && adminConfigured();
}

export type NotificationSettings = {
  enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  categories: Partial<Record<PushCategory, boolean>>;
  hide_details_on_lock_screen: boolean;
  allow_urgent_at_night: boolean;
  max_per_day: number;
  sent_day: string | null;
  sent_count: number;
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  quiet_start: "22:00",
  quiet_end: "07:00",
  categories: {},
  hide_details_on_lock_screen: false,
  allow_urgent_at_night: false,
  max_per_day: 4,
  sent_day: null,
  sent_count: 0,
};

// True when "HH:MM" now falls inside quiet hours (which can wrap past midnight).
export function inQuietHours(now: string, start: string, end: string): boolean {
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

const GENERIC: Record<PushCategory, string> = {
  briefing: "New briefing is ready",
  alerts: "Something needs your attention",
  reminders: "You have a reminder",
  cleaning: "Your hours report is ready",
  money: "New money ideas to look at",
  school: "Your school coach has an update",
};

// Decides whether a push may go out now. Pure, so it's easy to test.
export function decide(
  s: NotificationSettings,
  msg: Pick<PushMessage, "category" | "importance">,
  nowMs: number,
): { ok: true } | { ok: false; reason: string } {
  if (!s.enabled) return { ok: false, reason: "notifications are off" };
  if (s.categories[msg.category] === false) return { ok: false, reason: "category is off" };
  const urgent = (msg.importance ?? 3) >= 5 && s.allow_urgent_at_night;
  if (!urgent && inQuietHours(timeKey(nowMs), s.quiet_start, s.quiet_end)) return { ok: false, reason: "quiet hours" };
  const today = dayKey(nowMs);
  const sentToday = s.sent_day === today ? s.sent_count : 0;
  if (sentToday >= s.max_per_day) return { ok: false, reason: "daily limit reached" };
  return { ok: true };
}

function configure() {
  const subject = process.env.VAPID_SUBJECT || process.env.SITE_URL || "https://example.com";
  webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
}

export async function sendPush(userId: string, msg: PushMessage, opts: { force?: boolean } = {}): Promise<PushResult> {
  if (!pushConfigured()) return { sent: 0, skipped: "push isn't set up (VAPID keys missing)" };
  const db = createAdminClient();
  const now = Date.now();

  const { data: row } = await db.from("notification_settings").select("*").eq("user_id", userId).maybeSingle();
  const settings: NotificationSettings = { ...DEFAULT_SETTINGS, ...(row ?? {}) };
  if (!opts.force) {
    const verdict = decide(settings, msg, now);
    if (!verdict.ok) return { sent: 0, skipped: verdict.reason };
  }

  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs || subs.length === 0) return { sent: 0, skipped: "no devices" };

  configure();
  const hidden = settings.hide_details_on_lock_screen;
  const payload = JSON.stringify({
    title: hidden ? "Dashboard" : msg.title.slice(0, 80),
    body: hidden ? GENERIC[msg.category] : msg.body.slice(0, 240),
    url: msg.url && msg.url.startsWith("/") && !msg.url.startsWith("//") ? msg.url : "/inbox",
    tag: msg.tag,
  });

  let sent = 0;
  for (const s of subs as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 });
      sent++;
      await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", s.id).eq("user_id", userId);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // The device unsubscribed or the browser forgot it: tidy up.
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id).eq("user_id", userId);
      else console.error(`Push: send failed (${status ?? "network"})`);
    }
  }

  if (sent > 0) {
    const today = dayKey(now);
    const count = settings.sent_day === today ? settings.sent_count + 1 : 1;
    await db.from("notification_settings").upsert({ user_id: userId, sent_day: today, sent_count: count }, { onConflict: "user_id" });
  }
  return { sent };
}
