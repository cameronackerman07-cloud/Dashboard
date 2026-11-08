"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type Track = { playing: boolean; track: string; artist: string; art: string | null; url: string | null } | null;
type State = { state: "loading" | "not-set-up" | "not-connected" | "connected" | "signed-out"; premium?: boolean | null; track?: Track };

// Live now-playing. Polls every ~15 s, only while the tab is visible.
export function SpotifyTile() {
  const [s, setS] = useState<State>({ state: "loading" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/spotify/now", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (res) setS(res);
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  async function act(action: "play" | "pause" | "next") {
    setMsg("");
    const res = await fetch("/api/spotify/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false, message: "Couldn't reach the server." }));
    if (!res.ok && res.message) setMsg(res.message);
    window.setTimeout(load, 600);
  }

  const t = s.track;
  const canControl = s.state === "connected" && s.premium !== false;

  return (
    <section className="card tile-row spotify-tile" aria-label="Spotify">
      <span className="album">
        {t?.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.art} alt="" width={52} height={52} style={{ borderRadius: 10, objectFit: "cover" }} />
        ) : (
          <Icon name="music" size={22} />
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="spotify-title">{s.state === "connected" ? (t ? t.track : "Nothing playing") : "Spotify"}</span>
        <span className="card-meta spotify-sub">
          {s.state === "connected" ? (
            t ? t.artist : "Play something on any device"
          ) : s.state === "not-set-up" ? (
            "Not set up on this site yet"
          ) : s.state === "loading" ? (
            " "
          ) : (
            <Link href="/settings">Connect Spotify</Link>
          )}
        </span>
        {s.state === "connected" && s.premium === false ? <span className="card-meta">Play controls need Spotify Premium.</span> : null}
        {msg ? <span className="card-meta" role="status">{msg}</span> : null}
      </div>
      {canControl && t ? (
        <div className="row-actions">
          <button type="button" className="icon-btn" aria-label={t.playing ? "Pause" : "Play"} onClick={() => act(t.playing ? "pause" : "play")}>
            <Icon name={t.playing ? "pause" : "play"} size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="Next track" onClick={() => act("next")}>
            <Icon name="next" size={18} />
          </button>
        </div>
      ) : null}
    </section>
  );
}
