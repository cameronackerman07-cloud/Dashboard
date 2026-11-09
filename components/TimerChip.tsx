"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { clock, remainingSeconds, type StudySession } from "@/lib/study-time";

// The small "timer running" pill shown on every page while a session is open.
export function TimerChip({ session, serverNow }: { session: StudySession | null; serverNow: number }) {
  const pathname = usePathname();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!session) return;
    const offset = serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session, serverNow]);
  if (!session || pathname === "/timer" || now === null) return null;
  const left = remainingSeconds(session, now);
  const label = left <= 0 ? "Time's up" : `${clock(left)}${session.status === "paused" ? " paused" : ""}`;
  return (
    <Link href="/timer" className="timer-chip" aria-label={`Study timer: ${label}, ${session.subject}. Open the timer.`}>
      <Icon name="timer" size={16} />
      <span>{label}</span>
      <span className="timer-chip-sub">{session.subject}</span>
    </Link>
  );
}
