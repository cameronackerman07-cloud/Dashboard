"use client";

import { useState, useTransition } from "react";
import type { Reply } from "@/lib/validate";

// Runs a server action, keeps its reply for display, and turns a network
// failure into a message instead of an unhandled error.
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState<Reply | null>(null);

  function run(action: () => Promise<Reply>, after?: () => void) {
    setReply(null);
    startTransition(async () => {
      try {
        const res = await action();
        setReply(res);
        if (res.ok) after?.();
      } catch {
        setReply({ ok: false, message: "Couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  return { pending, reply, setReply, run };
}

export function ReplyLine({ reply }: { reply: Reply | null }) {
  if (!reply) return null;
  return (
    <p className={reply.ok ? "mark-cards" : "ai-error"} role={reply.ok ? "status" : "alert"}>
      {reply.message}
    </p>
  );
}
