// Signed session cookie (HMAC-SHA256 via Web Crypto; works in middleware and Node).
export const SESSION_COOKIE = "vp_session";
const MAX_AGE_S = 12 * 60 * 60;

function secret(): string | null {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  return process.env.NODE_ENV === "production" ? null : "voltproof-local-dev-secret";
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string, key: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}

export async function createSessionToken(name: string): Promise<string> {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET is not configured.");
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ n: name, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S })));
  return `${payload}.${b64url(await hmac(payload, key))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<{ name: string } | null> {
  const key = secret();
  if (!token || !key) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = b64url(await hmac(payload, key));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { n: string; exp: number };
    if (typeof data.n !== "string" || data.exp < Date.now() / 1000) return null;
    return { name: data.n };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_S = MAX_AGE_S;
