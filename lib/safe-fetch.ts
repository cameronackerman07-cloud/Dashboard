import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Checks for links the student pastes in (calendar links, their Canvas address).
// The server fetches them, so it must not be talked into fetching something
// private instead: its own network, or the cloud provider's metadata service.

export class SafeFetchError extends Error {}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  // IPv4-mapped addresses written in hex (::ffff:7f00:1 is 127.0.0.1).
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
  if (mapped) {
    const [hi, lo] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)];
    return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80") ||
    (v6.startsWith("::ffff:") && isPrivateAddress(v6.slice(7)))
  );
}

// Throws unless the host is a public name that resolves only to public addresses.
export async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || host === "localhost" || /\.(local|internal|localhost)$/i.test(host)) {
    throw new SafeFetchError("That link points somewhere private, so it can't be used.");
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SafeFetchError("Couldn't find that website. Check the address is complete.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new SafeFetchError("That link points somewhere private, so it can't be used.");
  }
}

// Reads a response body, giving up past `maxBytes`.
export async function readCapped(res: Response, maxBytes: number, tooBig: string): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError(tooBig);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// ---------------------------------------------------------------------------
// Fetching web pages for agents (RSS, official pay guides, learning guides).
// http/https only, public hosts only (checked again after every redirect),
// 10 s timeout, 1 MB cap, robots.txt respected, a generic user agent, and a
// 6-hour cache so the same page isn't fetched over and over.
// ---------------------------------------------------------------------------

const UA = "Mozilla/5.0 (compatible; DashboardStudyBot/1.0)";
const PAGE_TIMEOUT_MS = 10_000;
const PAGE_MAX_BYTES = 1024 * 1024;
const PAGE_CACHE_MS = 6 * 60 * 60 * 1000;
const pageCache = new Map<string, { at: number; text: string; type: string }>();
const robotsCache = new Map<string, { at: number; disallow: string[] }>();

function checkScheme(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SafeFetchError("Only web links (http or https) can be fetched.");
  if (url.username || url.password) throw new SafeFetchError("Links with a username or password can't be used.");
}

async function fetchChecked(start: URL, accept: string): Promise<Response> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    checkScheme(url);
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: accept },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    return res;
  }
  throw new SafeFetchError("That page redirects too many times.");
}

async function allowedByRobots(url: URL): Promise<boolean> {
  const origin = url.origin;
  let entry = robotsCache.get(origin);
  if (!entry || Date.now() - entry.at > PAGE_CACHE_MS) {
    const disallow: string[] = [];
    try {
      const res = await fetchChecked(new URL("/robots.txt", origin), "text/plain");
      if (res.ok) {
        const text = await readCapped(res, 200_000, "robots.txt too big");
        let applies = false;
        for (const raw of text.split(/\r?\n/)) {
          const line = raw.replace(/#.*/, "").trim();
          const [field, ...rest] = line.split(":");
          const value = rest.join(":").trim();
          if (/^user-agent$/i.test(field)) applies = value === "*" || /dashboard/i.test(value);
          else if (applies && /^disallow$/i.test(field) && value) disallow.push(value);
        }
      }
    } catch {
      /* no robots.txt: allowed */
    }
    entry = { at: Date.now(), disallow };
    robotsCache.set(origin, entry);
  }
  const path = url.pathname + url.search;
  return !entry.disallow.some((rule) => path.startsWith(rule));
}

export async function fetchPage(link: string): Promise<{ text: string; type: string; url: string }> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new SafeFetchError("That isn't a valid web address.");
  }
  checkScheme(url);
  const cached = pageCache.get(url.href);
  if (cached && Date.now() - cached.at < PAGE_CACHE_MS) return { text: cached.text, type: cached.type, url: url.href };
  if (!(await allowedByRobots(url))) throw new SafeFetchError("That website asks automated tools not to read this page.");
  const res = await fetchChecked(url, "text/html,application/xhtml+xml,application/rss+xml,application/xml,text/plain;q=0.8");
  if (!res.ok) throw new SafeFetchError(`That page returned error ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  const text = await readCapped(res, PAGE_MAX_BYTES, "That page is too big to read.");
  pageCache.set(url.href, { at: Date.now(), text, type });
  return { text, type, url: url.href };
}

// Plain text from HTML (scripts, styles and tags removed), for an AI prompt.
export function htmlToText(html: string, maxChars = 6000): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, maxChars);
}
