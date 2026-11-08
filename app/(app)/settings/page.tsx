import Link from "next/link";
import type { Metadata } from "next";
import { AccountCard } from "@/components/AccountCard";
import { CalendarConnect } from "@/components/CalendarConnect";
import { CanvasConnect } from "@/components/CanvasConnect";
import { Icon, type IconName } from "@/components/Icon";
import { getCalendarConnections, IMPORT_SOURCE } from "@/lib/calendar";
import { getCanvasStatus } from "@/lib/canvas";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/time";

export const metadata: Metadata = { title: "Settings & connections" };

type Row = { name: string; desc: string; action: string; icon: IconName };

const SCHOOL: Row[] = [
  { name: "Google — personal", desc: "Calendar, Drive and Google Classroom", action: "Connect", icon: "google" },
  { name: "Google — school", desc: "Add a second account. If your school blocks it, share the calendar to your personal account instead.", action: "Connect", icon: "google" },
  { name: "Compass", desc: "For now, paste its calendar link into the calendar card above, under Other link", action: "Add link", icon: "link" },
];

const DEVICES: Row[] = [
  { name: "Siri & Shortcuts", desc: "“Hey Siri, what’s due?” and Reminders sync", action: "Get Shortcut", icon: "mic" },
  { name: "Apple Calendar", desc: "Subscribe to your dashboard calendar", action: "Copy link", icon: "phone" },
  { name: "Spotify", desc: "Now playing on the home screen", action: "Connect", icon: "music" },
];

const MODELS = [
  { name: "Google Gemini", desc: "Main model — reads handwriting and photos of your work", env: "GEMINI_API_KEY" },
  { name: "Groq", desc: "Very fast, with several open models", env: "GROQ_API_KEY" },
  { name: "Cerebras", desc: "Very fast, free daily allowance", env: "CEREBRAS_API_KEY" },
  { name: "OpenRouter (free models)", desc: "Dozens of free models, and a backup when others hit their limit", env: "OPENROUTER_API_KEY" },
  { name: "Mistral", desc: "Extra backup", env: "MISTRAL_API_KEY" },
];

function ConnectionList({ rows }: { rows: Row[] }) {
  return (
    <div className="list-card">
      {rows.map((r) => (
        <div className="list-row" key={r.name}>
          <span className="list-icon">
            <Icon name={r.icon} size={18} />
          </span>
          <div className="list-text">
            <span className="list-name">{r.name}</span>
            <span className="list-desc">{r.desc}</span>
          </div>
          <span className="list-desc">Not connected</span>
          <button type="button" className="btn" disabled title="Coming in the next build step" style={{ minHeight: 40, fontSize: 13 }}>
            {r.action}
          </button>
        </div>
      ))}
    </div>
  );
}

export default async function SettingsPage() {
  // Server-side check only: shows whether a key exists, never the key itself.
  const keyStatus = (env: string) => (process.env[env] ? "Key set" : "Key not set");

  const supabase = await createClient();
  const [profile, calendars, canvas, imported] = await Promise.all([
    getProfile(),
    getCalendarConnections(),
    getCanvasStatus(),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("source", IMPORT_SOURCE),
  ]);

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
        </div>
      </div>

      {profile ? <AccountCard displayName={profile.displayName} email={profile.email} /> : null}

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

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="School and Google">
        <h2 className="section-label">School &amp; Google</h2>
        <ConnectionList rows={SCHOOL} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="iPhone and apps">
        <h2 className="section-label">iPhone &amp; apps</h2>
        <ConnectionList rows={DEVICES} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="AI models">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <h2 className="section-label">Free AI models · Auto tries them in this order</h2>
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
    </main>
  );
}
