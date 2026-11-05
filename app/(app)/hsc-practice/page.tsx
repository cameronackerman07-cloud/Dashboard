import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { COURSES } from "@/lib/nav";
import { aiConfigured } from "@/lib/ai";
import { PracticeClient } from "./PracticeClient";

export const metadata: Metadata = { title: "HSC practice" };
export const dynamic = "force-dynamic";

export default function HscPracticePage() {
  const enabled = aiConfigured();

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="hsc"
        title="HSC practice"
        lede="Generate HSC-style questions by subject and topic, write your answer, and get it marked against NESA-style criteria. Links to the real past papers below."
      />
      {enabled ? <PracticeClient courses={COURSES} /> : <AiNotice />}
    </main>
  );
}
