import type { Metadata } from "next";
import { supabaseConfigured } from "@/lib/supabase/env";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = { title: "Sign in" };
// Reads whether Supabase is connected at request time.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginClient connected={supabaseConfigured()} />;
}
