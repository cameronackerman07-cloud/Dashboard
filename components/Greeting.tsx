"use client";

import { useEffect, useState } from "react";

const TZ = "Australia/Sydney";

function parts(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now)
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const date = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(now);
  return { greeting, date };
}

export function Greeting({ name }: { name: string }) {
  // Render nothing time-specific on the server, then fill in with the device's clock.
  const [p, setP] = useState<{ greeting: string; date: string } | null>(null);

  useEffect(() => {
    setP(parts(new Date()));
    const id = window.setInterval(() => setP(parts(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="eyebrow">{p ? p.date : " "}</span>
      <h1 className="page-title">
        {p ? p.greeting : "Hello"}, {name}
      </h1>
    </div>
  );
}
