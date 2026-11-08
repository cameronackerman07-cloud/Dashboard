import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { DEFAULT_SETTINGS, PUSH_CATEGORIES, pushConfigured, type NotificationSettings } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/time";
import { NotificationsClient } from "./NotificationsClient";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: devices }] = await Promise.all([
    supabase.from("notification_settings").select("*").maybeSingle(),
    supabase.from("push_subscriptions").select("id, device_label, created_at, last_success_at").order("created_at", { ascending: true }),
  ]);
  const s: NotificationSettings = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };

  return (
    <main className="main main-narrow">
      <PageHeader icon="bell" title="Notifications" lede="Briefings, alerts and reports on your phone, iPad or Mac." />
      <NotificationsClient
        configured={pushConfigured()}
        settings={s}
        categories={PUSH_CATEGORIES}
        devices={((devices ?? []) as { id: string; device_label: string | null; created_at: string; last_success_at: string | null }[]).map((d) => ({
          id: d.id,
          label: d.device_label || "A device",
          added: formatShortDate(new Date(d.created_at).getTime()),
          lastSent: d.last_success_at ? formatShortDate(new Date(d.last_success_at).getTime()) : null,
        }))}
      />
    </main>
  );
}
