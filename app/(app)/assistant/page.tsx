import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { hasUsableKey } from "@/lib/ai-keys";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { AssistantClient } from "./AssistantClient";

export const metadata: Metadata = { title: "Ask The BRIAN" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { searchParams: Promise<{ q?: string; voice?: string }> };

export default async function AssistantPage({ searchParams }: Props) {
  const { q, voice } = await searchParams;
  const userId = await currentUserId();
  const ready = userId ? await hasUsableKey(userId) : false;
  let askFirst = true;
  if (userId) {
    const supabase = await createClient();
    const { data } = await supabase.from("user_settings").select("ask_before_changes").maybeSingle();
    askFirst = data?.ask_before_changes !== false;
  }

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="sparkle"
        title="Ask The BRIAN"
        lede="Ask for help with schoolwork, or ask it to do things in the site, like “make me a study plan for this week”. You'll see what it plans to change before anything happens."
      />
      {!ready ? <AiNotice /> : null}
      <AssistantClient initial={typeof q === "string" ? q.slice(0, 4000) : ""} initialVoice={voice === "1"} askFirst={askFirst} />
    </main>
  );
}
