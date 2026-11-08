"use client";

import { useEffect, useState } from "react";

type Device = "iphone" | "ipad" | "mac-safari" | "chromium" | "android" | "other";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function detect(): Device {
  const ua = navigator.userAgent;
  // iPadOS Safari says it's a Mac; a touch screen gives it away.
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ipad";
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/Android/.test(ua)) return "android";
  if (/Edg\/|Chrome\//.test(ua) && !/OPR\//.test(ua)) return "chromium";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return "mac-safari";
  return "other";
}

const STEPS: Record<Device, { title: string; steps: string[] }> = {
  iphone: {
    title: "iPhone (Safari)",
    steps: [
      "Open this site in Safari (not Chrome or another app's browser).",
      "Tap the Share button (the square with an arrow pointing up) at the bottom.",
      "Scroll down and tap Add to Home Screen, then Add.",
      "Open Dashboard from your Home Screen from now on.",
    ],
  },
  ipad: {
    title: "iPad (Safari)",
    steps: [
      "Open this site in Safari.",
      "Tap the Share button (square with an arrow) at the top right.",
      "Tap Add to Home Screen, then Add.",
      "Open Dashboard from your Home Screen from now on.",
    ],
  },
  "mac-safari": {
    title: "Mac (Safari)",
    steps: ["In the menu bar, choose File → Add to Dock.", "Click Add. Dashboard opens from your Dock like an app."],
  },
  chromium: {
    title: "Chrome or Edge",
    steps: [
      "Click the Install icon at the right end of the address bar (a screen with a down arrow).",
      "Or open the ⋮ menu → Cast, save and share → Install page as app (Edge: Apps → Install this site as an app).",
      "Click Install.",
    ],
  },
  android: {
    title: "Android (Chrome)",
    steps: ["Tap the ⋮ menu at the top right.", "Tap Add to Home screen or Install app, then Install."],
  },
  other: {
    title: "Your browser",
    steps: ["Open this site in Safari on iPhone, iPad or Mac, or in Chrome or Edge on a computer, then follow the steps for that browser."],
  },
};

export function InstallSteps() {
  const [device, setDevice] = useState<Device | null>(null);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    setDevice(detect());
    setInstalled(isInstalled());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!device) return null;
  if (installed) {
    return (
      <p className="mark-cards" role="status">
        Already installed: you&apos;re using the app right now.
      </p>
    );
  }

  const others = (Object.keys(STEPS) as Device[]).filter((d) => d !== device && d !== "other");
  return (
    <div className="install-steps">
      {prompt ? (
        <button
          type="button"
          className="btn btn-dark auth-submit"
          onClick={async () => {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            if (choice.outcome === "accepted") setInstalled(true);
            setPrompt(null);
          }}
        >
          Install Dashboard
        </button>
      ) : null}
      <div className="steps">
        <span className="field-label">{STEPS[device].title}</span>
        <ol>
          {STEPS[device].steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      <details className="more">
        <summary>Steps for other devices</summary>
        {others.map((d) => (
          <div className="steps" key={d} style={{ marginBottom: 10 }}>
            <span className="field-label">{STEPS[d].title}</span>
            <ol>
              {STEPS[d].steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </details>
    </div>
  );
}
