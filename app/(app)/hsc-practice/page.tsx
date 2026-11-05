import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { COURSES } from "@/lib/nav";
import { aiConfigured, availableModels } from "@/lib/ai";
import { PracticeClient } from "./PracticeClient";

export const metadata: Metadata = { title: "HSC practice" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default function HscPracticePage() {
  const enabled = aiConfigured();

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="hsc"
        title="HSC practice"
        lede="Generate HSC-style questions by subject and topic, type or draw your working, and submit it for marking, with feedback and a worked solution. Links to the real past papers below."
      />
      {enabled ? <PracticeClient courses={COURSES} models={availableModels()} /> : <AiNotice />}
    </main>
  );
}
