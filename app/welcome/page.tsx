import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSchool } from "@/lib/my-subjects";
import { getProfile } from "@/lib/profile";
import { supabaseConfigured } from "@/lib/supabase/env";
import { WelcomeClient } from "./WelcomeClient";

export const metadata: Metadata = { title: "Welcome" };
// Per person, read at request time.
export const dynamic = "force-dynamic";

// Straight after sign-up (and for anyone who hasn't picked yet): your year and
// subjects, so every subject list, the planner and the AI know what you study.
export default async function WelcomePage() {
  if (!supabaseConfigured()) redirect("/login");
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const school = await getSchool();
  if (school.missing) redirect("/"); // phase7.sql not run yet: nothing to save to
  return (
    <main className="auth">
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <span className="brand-logo">D</span>
          Dashboard
        </div>
        <h1 className="auth-title">Welcome! What do you study?</h1>
        <p className="auth-lede">Pick your year and your subjects. You can change these any time in Settings.</p>
        <WelcomeClient year={school.year} subjects={school.subjects} />
      </div>
    </main>
  );
}
