import { NextResponse } from "next/server";
import { createClient, currentUserId } from "@/lib/supabase/server";

// "Download my data" for About me: your facts, samples and switches as JSON.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentUserId())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const supabase = await createClient();
  const [facts, samples, settings] = await Promise.all([
    supabase.from("profile_facts").select("category, text, source, origin, confidence, status, created_at"),
    supabase.from("writing_samples").select("title, text, include_in_ai, created_at"),
    supabase.from("profile_settings").select("questionnaire, use_behaviour, use_samples, include_notes, use_style, ai_pass, updated_at").maybeSingle(),
  ]);
  const body = JSON.stringify({ exported_at: new Date().toISOString(), facts: facts.data ?? [], writing_samples: samples.data ?? [], settings: settings.data ?? null }, null, 2);
  return new NextResponse(body, {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="about-me.json"', "cache-control": "no-store" },
  });
}
