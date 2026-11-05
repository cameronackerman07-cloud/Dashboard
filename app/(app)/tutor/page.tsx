import type { Metadata } from "next";
import { AiNotice } from "@/components/AiNotice";
import { PageHeader } from "@/components/PageHeader";
import { aiConfigured } from "@/lib/ai";
import { TutorClient } from "./TutorClient";

export const metadata: Metadata = { title: "AI tutor" };
export const dynamic = "force-dynamic";

export default function TutorPage() {
  const enabled = aiConfigured();

  return (
    <main className="main main-narrow">
      <PageHeader
        icon="tutor"
        title="AI tutor"
        lede="Hints first, full answers when you ask. It switches between free AI models automatically."
      />
      {enabled ? <TutorClient /> : <AiNotice />}
    </main>
  );
}
