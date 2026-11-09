import Link from "next/link";
import type { Metadata } from "next";
import { AccountCard } from "@/components/AccountCard";
import { CalendarConnect } from "@/components/CalendarConnect";
import { CanvasConnect } from "@/components/CanvasConnect";
import { GoogleConnect } from "@/components/GoogleConnect";
import { SpotifyConnect } from "@/components/SpotifyConnect";
import { WeekSettings } from "@/components/WeekSettings";
import { spotifyConfigured } from "@/lib/sources/spotify";
import { listConnections } from "@/lib/oauth-store";
import { googleConfigured } from "@/lib/sources/google";
import { Icon, type IconName } from "@/components/Icon";
import { getCalendarConnections, IMPORT_SOURCE } from "@/lib/calendar";
import { getCanvasStatus } from "@/lib/canvas";
import { isOwner } from "@/lib/ai-keys";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/time";

export const metadata: Metadata = { title: "Settings & connections" };

const MODELS = [
  { name: "Google Gemini", desc: "Main model — reads handwriting and photos of your work", env: "GEMINI_API_KEY" },
  { name: "Groq", desc: "Very fast, with several open models", env: "GROQ_API_KEY" },
  { name: "Cerebras", desc: "Very fast, free daily allowance", env: "CEREBRAS_API_KEY" },
  { name: "OpenRouter (free models)", desc: "Dozens of free models, and a backup when others hit their limit", env: "OPENROUTER_API_KEY" },
  { name: "Mistral", desc: "Extra backup", env: "MISTRAL_API_KEY" },
];

type Props = { searchParams: Promise<{ google?: string; spotify?: string }> };

const GOOGLE_NOTICE: Record<string, string> = {
  connected: "Google connected.",
  cancelled: "No problem: nothing was connected.",
  blocked: "Your school may block this. Ask your school to allow it, or share your school calendar to your personal Google account and connect that instead.",
  expired: "That took too long. Press Connect Google again.",
  failed: "Google didn't finish connecting. Try again.",
  "not-set-up": "Google isn't set up on this site yet.",
};

export default async function SettingsPage({ searchParams }: Props) {
  const { google, spotify } = await searchParams;
  // Server-side check only: shows whether a key exists, never the key itself.
  const keyStatus = (env: string) => (process.env[env] ? "Key set" : "Key not set");

  const supabase = await createClient();
  const [profile, calendars, canvas, imported, week] = await Promise.all([
    getProfile(),
    getCalendarConnections(),
    getCanvasStatus(),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("source", IMPORT_SOURCE),
    supabase.from("user_settings").select("pay_week_start, region").maybeSingle(),
  ]);

  // The site's own (Vercel) keys are only shown to the owner; everyone else
  // manages their own keys on the AI keys page.
  const owner = profile ? await isOwner(profile.id) : false;

  return (
    <main className="main main-narrow" style={{ gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--muted)" }}>
          <Link href="/" style={{ color: "var(--muted)" }}>
            Home
          </Link>{" "}
          / Settings / <span style={{ color: "var(--ink)", fontWeight: 600 }}>Connections</span>
        </nav>
        <h1 className="page-title">Connections</h1>
        <p className="lede">
          Link your school apps, Google, iPhone and AI models. Each one only reads what it needs, and you can
          disconnect it any time.
        </p>
        <div className="note-actions">
          <Link href="/install" className="card-link">
            Install the app →
          </Link>
          <Link href="/settings/notifications" className="card-link">
            Notifications →
          </Link>
          <Link href="/settings/ai-keys" className="card-link">
            AI keys →
          </Link>
          <Link href="/settings/iphone" className="card-link">
            iPhone &amp; Siri →
          </Link>
        </div>
      </div>

      {profile ? <AccountCard displayName={profile.displayName} email={profile.email} /> : null}

      {profile ? <WeekSettings payWeekStart={(week.data?.pay_week_start as number) ?? 3} town={(week.data?.region as string) ?? ""} /> : null}

      <CalendarConnect
        connected={calendars
          .filter((c) => c.status === "connected")
          .map((c) => ({
            source: c.source,
            name: c.name,
            syncedLabel: c.lastSyncedAt ? formatShortDate(new Date(c.lastSyncedAt).getTime()) : null,
          }))}
        importedCount={imported.count ?? 0}
      />

      <GoogleConnect
        accounts={profile ? await listConnections(profile.id, "google") : []}
        configured={googleConfigured()}
        notice={google ? (GOOGLE_NOTICE[google] ?? null) : null}
      />

      <SpotifyConnect
        connected={profile ? (await listConnections(profile.id, "spotify")).length > 0 : false}
        configured={spotifyConfigured()}
        notice={spotify === "connected" ? "Spotify connected." : spotify === "not-allowed" ? "Spotify said no: ask the app owner to add your Spotify email in the Spotify developer dashboard, then connect again." : spotify === "failed" ? "Spotify didn't finish connecting. Ask the app owner to add your Spotify email first, then try again." : null}
      />

      <CanvasConnect
        state={
          canvas
            ? {
                method: canvas.method,
                host: canvas.host,
                needsFixing: canvas.status !== "connected",
                syncedLabel: canvas.lastSyncedAt ? formatShortDate(new Date(canvas.lastSyncedAt).getTime()) : null,
              }
            : null
        }
      />

      {owner ? (
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="AI models">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <h2 className="section-label">Site AI keys (owner only) · Auto tries them in this order</h2>
          <span className="list-desc">Keys live in Vercel → Settings → Environment Variables, never on this page</span>
        </div>
        <div className="list-card">
          {MODELS.map((m, i) => (
            <div className="list-row" key={m.name}>
              <span className="order-num">{i + 1}</span>
              <div className="list-text">
                <span className="list-name">{m.name}</span>
                <span className="list-desc">{m.desc}</span>
              </div>
              <span className="list-desc">{keyStatus(m.env)}</span>
            </div>
          ))}
          <div className="list-row">
            <span className="order-num">{MODELS.length + 1}</span>
            <div className="list-text">
              <span className="list-name">Ollama on your computer</span>
              <span className="list-desc">Free and offline when your computer is on — set up later</span>
            </div>
          </div>
        </div>
      </section>
      ) : null}
    </main>
  );
}
