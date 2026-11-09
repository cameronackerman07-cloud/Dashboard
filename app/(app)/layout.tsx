import { redirect } from "next/navigation";
import { AppBadge } from "@/components/AutoRefresh";
import { Sidebar } from "@/components/Sidebar";
import { TimerChip } from "@/components/TimerChip";
import { activeSession } from "@/lib/study-sessions";
import { ensureDefaultAgents } from "@/lib/agents/defaults";
import { initials } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Layout for every signed-in page. The proxy already gates access, but we check
// again here (never trust the proxy alone) and hand the user's name to the
// sidebar. Using the session makes these pages render per-request.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured()) return <NotConnected />;

  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Badge the Assignments nav item with the number of tasks still to do.
  const supabase = await createClient();
  const [{ count }, { count: unread }, , timer] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("done", false),
    supabase.from("reports").select("id", { count: "exact", head: true }).is("read_at", null),
    ensureDefaultAgents(profile.id).catch(() => undefined),
    activeSession(supabase, profile.id).catch(() => null),
  ]);

  return (
    <div className="shell">
      <Sidebar
        badges={{ assignments: count ?? 0, inbox: unread ?? 0, ...(timer ? { timer: "ON" } : {}) }}
        displayName={profile.displayName}
        initials={initials(profile.displayName)}
        userEmail={profile.email}
      />
      {children}
      <TimerChip session={timer} serverNow={Date.now()} />
      <AppBadge count={unread ?? 0} />
    </div>
  );
}

// Shown on every page until the Supabase env vars are added in Vercel.
function NotConnected() {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-logo">D</span>
          Dashboard
        </div>
        <h1 className="auth-title">Supabase isn&apos;t connected yet</h1>
        <p className="auth-lede">
          The dashboard keeps your data in Supabase. Add SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and
          SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables, run supabase/schema.sql in the Supabase
          SQL Editor, then redeploy. SETUP.md walks through each step.
        </p>
      </div>
    </main>
  );
}
