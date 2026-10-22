/*
 * Password gate, shared by the Vercel Functions (api/), the Routing Middleware (middleware.ts) and the dev-only
 * emulation in vite.config.ts. Web Crypto only (crypto.subtle), so it runs in every runtime.
 *
 * The unlock cookie holds base64url(HMAC-SHA256(key = SURI_PASSWORD, message = "suri-gate-v1")): it proves the
 * visitor knew the password, and changing the password invalidates every cookie.
 */

export const GATE_COOKIE = 'suri_gate';
/** Readable hint (not a secret, not checked by the server): lets index.html preload the model only when unlocked. */
export const HINT_COOKIE = 'suri_unlocked';
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const MESSAGE = 'suri-gate-v1';

/** File types the middleware refuses without a valid cookie: the brush model, its data and the tiles. */
const GATED_EXT = /\.(glb|webp|json)$/i;

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The unlock token for a password. */
export async function tokenFor(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(MESSAGE))));
}

/** Compare two strings without an early exit on the first differing character. Length is not secret here. */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Parse a Cookie request header into name → value (first occurrence wins, values URI-decoded when possible). */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || name in out) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    try { value = decodeURIComponent(value); } catch { /* keep the raw value */ }
    out[name] = value;
  }
  return out;
}

/** Is this request path one the gate protects? `prefixes` are the asset roots (production: /assets/). */
export function isGatedPath(pathname: string, prefixes: readonly string[] = ['/assets/']): boolean {
  return prefixes.some((p) => pathname.startsWith(p)) && GATED_EXT.test(pathname);
}

export type Decision = 'allow' | 'deny';

/**
 * The middleware decision, pure: a gated path is allowed only with a cookie equal to the expected token.
 * `expected` null means the gate is not configured (no password): gated paths are then refused, never open.
 */
export function decide(pathname: string, cookieHeader: string | null | undefined, expected: string | null, prefixes?: readonly string[]): Decision {
  if (!isGatedPath(pathname, prefixes)) return 'allow';
  if (!expected) return 'deny';
  const got = parseCookies(cookieHeader)[GATE_COOKIE];
  return got !== undefined && constantTimeEqual(got, expected) ? 'allow' : 'deny';
}

/** Does this Cookie header carry a valid unlock cookie for `password`? */
export async function isUnlocked(cookieHeader: string | null | undefined, password: string | undefined): Promise<boolean> {
  if (!password) return false;
  const got = parseCookies(cookieHeader)[GATE_COOKIE];
  return got !== undefined && constantTimeEqual(got, await tokenFor(password));
}

/** Set-Cookie values on unlock: the HttpOnly gate cookie and the readable hint. `secure` is off only for local http. */
export function unlockCookies(token: string, secure = true): string[] {
  const s = secure ? '; Secure' : '';
  return [
    `${GATE_COOKIE}=${token}; Path=/; HttpOnly${s}; SameSite=Lax; Max-Age=${MAX_AGE}`,
    hintCookie(secure),
  ];
}

/** Set-Cookie value for the readable hint alone (also refreshed by /api/gate while unlocked). */
export function hintCookie(secure = true): string {
  return `${HINT_COOKIE}=1; Path=/${secure ? '; Secure' : ''}; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

/** Set-Cookie value that clears the hint (sent when the gate reports locked, e.g. after a password change). */
export function clearHintCookie(secure = true): string {
  return `${HINT_COOKIE}=; Path=/${secure ? '; Secure' : ''}; SameSite=Lax; Max-Age=0`;
}
