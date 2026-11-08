"use client";

import { useEffect } from "react";

// Registers public/sw.js (push notifications and the offline page). Production
// only, so it never gets in the way while developing.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* not supported here: the site still works without it */
    });
  }, []);
  return null;
}
