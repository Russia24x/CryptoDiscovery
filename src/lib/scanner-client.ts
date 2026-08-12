/**
 * Proxy helper for the crypto-scanner Python service (port 3003).
 * All requests go through the gateway via XTransformPort so the
 * browser only ever talks to the same origin.
 */

const SCANNER_PORT = "3003";
const SCANNER_BASE = "http://localhost:3003";

export async function scannerFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = path.includes("?")
    ? `${SCANNER_BASE}${path}${path.includes("XTransformPort") ? "" : "&XTransformPort=" + SCANNER_PORT}`
    : `${SCANNER_BASE}${path}?XTransformPort=${SCANNER_PORT}`;

  // We call the service directly server-side (no gateway needed here),
  // then return the response to the browser.
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    // Don't cache — scans are dynamic
    cache: "no-store",
  });
  return res;
}

export async function scannerJson<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await scannerFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`scanner ${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
