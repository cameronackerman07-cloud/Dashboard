"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";

export function SpotifyConnect({ connected, configured, notice }: { connected: boolean; configured: boolean; notice: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState(notice ?? "");
  return (
    <div className="list-card">
      <div className="list-row">
        <span className="list-icon">
          <Icon name="music" size={18} />
        </span>
        <div className="list-text">
          <span className="list-name">Spotify</span>
          <span className="list-desc">Now playing on Home, with play, pause and next (controls need Premium). Spotify only lets this app work for 5 people, each added by email by the app owner (who needs Premium). Ask the app owner to add your Spotify email before you connect.</span>
        </div>
        <span className="list-desc">{connected ? "Connected" : configured ? "Not connected" : "Not set up yet"}</span>
        {connected ? (
          <button
            type="button"
            className="btn"
            style={{ minHeight: 40, fontSize: 13 }}
            onClick={async () => {
              const r = await fetch("/api/spotify/disconnect", { method: "POST" }).then((x) => x.json()).catch(() => ({ message: "Couldn't reach the server." }));
              setMsg(r.message ?? "");
              router.refresh();
            }}
          >
            Disconnect
          </button>
        ) : (
          <a className={`btn${configured ? "" : " is-disabled"}`} style={{ minHeight: 40, fontSize: 13 }} href={configured ? "/api/spotify/connect" : undefined} aria-disabled={!configured}>
            Connect
          </a>
        )}
      </div>
      {msg ? (
        <div className="list-row">
          <span className="list-desc" role="status">
            {msg}
          </span>
        </div>
      ) : null}
    </div>
  );
}
