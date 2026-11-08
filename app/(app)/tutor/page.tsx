import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { aiReadyFor, availableModels } from "@/lib/ai";
import { currentUserId } from "@/lib/supabase/server";
import { TutorClient } from "./TutorClient";

export const metadata: Metadata = { title: "AI tutor" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function TutorPage() {
  const userId = await currentUserId();
  const enabled = await aiReadyFor(userId);

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="tutor"
        title="AI tutor"
        lede="Hints first, full answers when you ask. Pick a model, or leave it on Auto."
      />
      {enabled ? <TutorClient models={await availableModels(userId)} /> : <AiNotice />}
    </main>
  );
}
