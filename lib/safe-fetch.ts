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
