import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { budgetLeft, dailyBudget, keysStorageReady, listKeyMeta } from "@/lib/ai-keys";
import { currentUserId } from "@/lib/supabase/server";
import { AiKeysClient } from "./AiKeysClient";

export const metadata: Metadata = { title: "AI keys" };

export default async function AiKeysPage() {
  const userId = await currentUserId();
  const ready = keysStorageReady();
  const [meta, budget, left] = userId && ready ? await Promise.all([listKeyMeta(userId), dailyBudget(userId), budgetLeft(userId)]) : [[], 30, 30];

  return (
    <main className="main main-narrow">
      <PageHeader icon="sparkle" title="AI keys" lede="The AI features use your own free keys. Each takes about two minutes to get." />
      <p className="privacy-note" role="note">
        Paste your key only here — never in chat, email or screenshots. Free tiers can use prompts for training, and the key belongs
        to your own account with that company; delete it there any time.
      </p>
      {!ready ? (
        <p className="notice">
          Saving keys is switched off until TOKEN_ENCRYPTION_KEY and SUPABASE_SERVICE_ROLE_KEY are set in Vercel. Nothing is ever
          stored unencrypted.
        </p>
      ) : null}
      <AiKeysClient meta={meta} ready={ready} budget={budget} usedToday={Math.max(0, budget - left)} />
    </main>
  );
}
