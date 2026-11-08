import { headers } from "next/headers";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { IphoneClient } from "./IphoneClient";

export const metadata: Metadata = { title: "iPhone & Siri" };

export default async function IphonePage() {
  const supabase = await createClient();
  const [{ data: tokens }, { data: cal }] = await Promise.all([
    supabase.from("device_tokens").select("id, label, scope, last_used_at, created_at").is("revoked_at", null).order("created_at", { ascending: true }),
    supabase.from("calendar_tokens").select("created_at").maybeSingle(),
  ]);
  const h = await headers();
  const site = process.env.SITE_URL?.replace(/\/$/, "") || `https://${h.get("host") ?? "your-site"}`;
  return (
    <main className="main main-narrow">
      <PageHeader icon="mic" title="iPhone & Siri" lede="Ask Siri what's due, add to-dos by voice, text yourself your cleaning hours, and see everything in Apple Calendar." />
      <IphoneClient
        site={site}
        tokens={((tokens ?? []) as { id: string; label: string; scope: string; last_used_at: string | null }[]).map((t) => ({ id: t.id, label: t.label, scope: t.scope, lastUsed: t.last_used_at }))}
        hasCalendar={!!cal}
      />
    </main>
  );
}
