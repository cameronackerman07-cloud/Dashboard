import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { aiConfigured, availableModels } from "@/lib/ai";
import { TutorClient } from "./TutorClient";

export const metadata: Metadata = { title: "AI tutor" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default function TutorPage() {
  const enabled = aiConfigured();

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="tutor"
        title="AI tutor"
        lede="Hints first, full answers when you ask. Pick a model, or leave it on Auto."
      />
      {enabled ? <TutorClient models={availableModels()} /> : <AiNotice />}
    </main>
  );
}
