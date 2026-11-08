"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isInstalled } from "@/app/install/InstallSteps";
import { ReplyLine, useAction } from "@/components/useAction";
import type { NotificationSettings, PushCategory } from "@/lib/push";
import { saveNotificationSettings } from "./actions";

type Device = { id: string; label: string; added: string; lastSent: string | null };

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android phone";
  if (/Windows/.test(ua)) return "Windows computer";
  return "Browser";
}

export function NotificationsClient({
  configured,
  settings,
  categories,
  devices,
}: {
  configured: boolean;
  settings: NotificationSettings;
  categories: { id: PushCategory; label: string }[];
  devices: Device[];
}) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "unsupported" | "needs-install" | "denied" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = useAction();

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !isInstalled() ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage("");
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Push isn't set up on the server yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), label: deviceLabel() }),
      });
      if (!res.ok) throw new Error("Couldn't save this device. Try again.");
      setState("on");
      setMessage("Notifications are on for this device.");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
      setMessage("Notifications are off for this device.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const res = await fetch("/api/push/test", { method: "POST" }).then((r) => r.json()).catch(() => ({ message: "Couldn't reach the server." }));
    setMessage(res.message);
    setBusy(false);
  }

  async function remove(id: string) {
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    router.refresh();
  }

  return (
    <>
      <section className="card" aria-label="This device">
        <h2 className="card-title">This device</h2>
        {!configured ? (
          <p className="notice">Push isn&apos;t set up yet: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY need adding in Vercel (see SETUP.md).</p>
        ) : null}
        {state === "needs-install" ? (
          <p className="track-empty">
            On iPhone and iPad, notifications only work from the installed app (iOS 16.4 or later).{" "}
            <Link href="/install">Install it first</Link>, open it from your Home Screen, then come back here.
          </p>
        ) : state === "unsupported" ? (
          <p className="track-empty">This browser can&apos;t show notifications. Try Safari on iPhone/iPad (installed app), or Chrome, Edge or Safari on a computer.</p>
        ) : state === "denied" ? (
          <p className="track-empty">Notifications are blocked for this site. Allow them in your browser or device settings, then reload this page.</p>
        ) : (
          <div className="note-actions">
            {state === "on" ? (
              <button type="button" className="btn" disabled={busy} onClick={turnOff}>
                Turn off on this device
              </button>
            ) : (
              <button type="button" className="btn btn-dark" disabled={busy || state === "loading" || !configured} onClick={turnOn}>
                Turn on notifications on this device
              </button>
            )}
            <button type="button" className="btn" disabled={busy || !configured} onClick={test}>
              Send test notification
            </button>
          </div>
        )}
        {message ? (
          <p className="mark-cards" role="status">
            {message}
          </p>
        ) : null}
      </section>

      <section className="card" aria-label="Your devices">
        <h2 className="card-title">Devices getting notifications</h2>
        {devices.length === 0 ? (
          <p className="track-empty">None yet.</p>
        ) : (
          <div className="track-list">
            {devices.map((d) => (
              <div className="task" key={d.id}>
                <div className="task-body">
                  <span className="task-title">{d.label}</span>
                  <span className="task-sub">
                    Added {d.added}
                    {d.lastSent ? ` · last notified ${d.lastSent}` : ""}
                  </span>
                </div>
                <button type="button" className="btn btn-small" onClick={() => remove(d.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" aria-label="Notification settings">
        <h2 className="card-title">What to send, and when</h2>
        <form
          className="track-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.run(() => saveNotificationSettings(f));
          }}
        >
          <label className="paste-replace">
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Notifications on
          </label>
          <div className="track-fields">
            <label className="field">
              <span className="field-label">Quiet from</span>
              <input type="time" name="quiet_start" className="input" defaultValue={settings.quiet_start} required />
            </label>
            <label className="field">
              <span className="field-label">Until</span>
              <input type="time" name="quiet_end" className="input" defaultValue={settings.quiet_end} required />
            </label>
            <label className="field">
              <span className="field-label">At most per day</span>
              <input type="number" name="max_per_day" className="input" min={0} max={50} defaultValue={settings.max_per_day} />
            </label>
          </div>
          <fieldset className="mcq-fieldset">
            <legend className="field-label">Send me</legend>
            {categories.map((c) => (
              <label className="paste-replace" key={c.id}>
                <input type="checkbox" name={`cat_${c.id}`} defaultChecked={settings.categories[c.id] !== false} /> {c.label}
              </label>
            ))}
          </fieldset>
          <label className="paste-replace">
            <input type="checkbox" name="hide" defaultChecked={settings.hide_details_on_lock_screen} /> Hide details on the lock screen
            (shows &ldquo;New briefing is ready&rdquo; instead)
          </label>
          <label className="paste-replace">
            <input type="checkbox" name="urgent" defaultChecked={settings.allow_urgent_at_night} /> Allow urgent alerts during quiet
            hours
          </label>
          <div className="note-actions">
            <button type="submit" className="btn btn-dark" disabled={save.pending}>
              Save
            </button>
          </div>
        </form>
        <ReplyLine reply={save.reply} />
      </section>
    </>
  );
}
