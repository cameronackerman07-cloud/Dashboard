import "server-only";
import { getConnections, updateConnection } from "@/lib/oauth-store";

// Spotify now-playing and play/pause/next. Tokens stay on the server.
// Development-mode limits (Feb 2026): the app owner needs Premium, at most 5
// users, each added by email in the Spotify dashboard. Playback control needs
// the listener to have Premium; without it we show now-playing only.

export const SPOTIFY_SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state"];

export function spotifyConfigured(): boolean {
  return !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET;
}

const basic = () => Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");

export async function spotifyToken(userId: string): Promise<{ token: string; connId: string; premium: boolean | null } | null> {
  const [conn] = await getConnections(userId, "spotify");
  if (!conn || conn.status !== "active") return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refreshToken }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    if (body.error === "invalid_grant") await updateConnection(userId, conn.id, { status: "needs_reconnect", last_error: "Spotify asked you to connect again." });
    return null;
  }
  const premium = typeof conn.cached.premium === "boolean" ? (conn.cached.premium as boolean) : null;
  return { token: body.access_token, connId: conn.id, premium };
}

export type NowPlaying = { playing: boolean; track: string; artist: string; art: string | null; url: string | null } | null;

export async function nowPlaying(token: string): Promise<NowPlaying> {
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (res.status === 204 || !res.ok) return null;
  const d = (await res.json().catch(() => null)) as {
    is_playing?: boolean;
    item?: { name?: string; artists?: { name: string }[]; show?: { name: string }; album?: { images?: { url: string; width: number }[] }; images?: { url: string }[]; external_urls?: { spotify?: string } };
  } | null;
  if (!d?.item) return null;
  const images = d.item.album?.images ?? d.item.images ?? [];
  const small = [...images].sort((a, b) => ((a as { width?: number }).width ?? 0) - ((b as { width?: number }).width ?? 0)).find((i) => ((i as { width?: number }).width ?? 300) >= 64) ?? images[0];
  return {
    playing: !!d.is_playing,
    track: d.item.name ?? "Unknown",
    artist: d.item.artists?.map((a) => a.name).join(", ") ?? d.item.show?.name ?? "",
    art: small?.url ?? null,
    url: d.item.external_urls?.spotify ?? null,
  };
}

export async function isPremium(token: string): Promise<boolean | null> {
  const res = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (!res.ok) return null;
  const d = (await res.json().catch(() => ({}))) as { product?: string };
  return d.product ? d.product === "premium" : null;
}

export async function control(token: string, action: "play" | "pause" | "next"): Promise<{ ok: boolean; message?: string }> {
  const map = { play: ["PUT", "play"], pause: ["PUT", "pause"], next: ["POST", "next"] } as const;
  const [method, path] = map[action];
  const res = await fetch(`https://api.spotify.com/v1/me/player/${path}`, { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
  if (res.ok || res.status === 204) return { ok: true };
  if (res.status === 403) return { ok: false, message: "Spotify said no. Play controls need Premium, and the app owner must have added your Spotify email." };
  if (res.status === 404) return { ok: false, message: "Open Spotify on a device first." };
  return { ok: false, message: "Spotify didn't respond. Try again." };
}
