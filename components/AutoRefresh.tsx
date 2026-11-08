"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Keeps a page in step with your other devices without any extra service:
// refreshes when you come back to the tab and every 60 seconds while it's visible.
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, everyMs]);
  return null;
}

// Shows a number on the installed app's icon (where the device supports it).
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    (count > 0 ? nav.setAppBadge(count) : (nav.clearAppBadge?.() ?? Promise.resolve())).catch(() => {});
  }, [count]);
  return null;
}
