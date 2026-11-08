import type { Metadata } from "next";
import { inviteRequired } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = { title: "Sign in" };
// Reads whether an invite code is needed at request time.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginClient connected={supabaseConfigured()} needsInvite={inviteRequired()} />;
}
