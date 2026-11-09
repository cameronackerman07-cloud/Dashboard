import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { getMySubjects } from "@/lib/my-subjects";
import { aiReadyFor, availableModels } from "@/lib/ai";
import { currentUserId } from "@/lib/supabase/server";
import { PracticeClient } from "./PracticeClient";

export const metadata: Metadata = { title: "HSC practice" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function HscPracticePage() {
  const userId = await currentUserId();
  const enabled = await aiReadyFor(userId);

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="hsc"
        title="HSC practice"
        lede="Generate HSC-style questions by subject and topic, type or draw your working, and submit it for marking, with feedback and a worked solution. Links to the real past papers below."
      />
      {enabled ? <PracticeClient courses={await getMySubjects()} models={await availableModels(userId)} /> : <AiNotice />}
    </main>
  );
}
