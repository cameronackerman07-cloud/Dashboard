import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { COURSES } from "@/lib/nav";
import { aiConfigured, availableModels } from "@/lib/ai";
import { SummariesClient } from "./SummariesClient";

export const metadata: Metadata = { title: "Summaries" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SummariesPage() {
  const enabled = aiConfigured();

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="summaries"
        title="Summaries"
        lede="Paste notes or a worksheet and get a short summary with key points — then save it straight to your Notes."
      />
      {enabled ? <SummariesClient courses={COURSES} models={await availableModels()} /> : <AiNotice />}
    </main>
  );
}
