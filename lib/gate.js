// @ts-check
/*
 * Password gate, shared by the Vercel Functions (api/), the Routing Middleware (middleware.js) and the dev-only
 * emulation in vite.config.ts. Plain ESM JavaScript with JSDoc types (typechecked by `npm run typecheck`), so Vercel
 * builds it without the project's TypeScript. Web Crypto only (crypto.subtle), so it runs in every runtime.
 *
 * The unlock cookie holds base64url(HMAC-SHA256(key = SURI_PASSWORD, message = "suri-gate-v1")): it proves the
 * visitor knew the password, and changing the password invalidates every cookie.
 */

export const GATE_COOKIE = 'suri_gate';
/** Readable hint (not a secret, not checked by the server): lets index.html preload the model only when unlocked. */
export const HINT_COOKIE = 'suri_unlocked';
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const MESSAGE = 'suri-gate-v1';

/**
 * @typedef {object} GateRules
 * @property {readonly string[]} prefixes asset roots, each ending in "/" (production: /assets/)
 * @property {readonly string[]} publicExt the only file types under those roots served without the cookie
 */

/** Production: under /assets/ only the JS, CSS and fonts the loader needs are public; everything else is gated. */
/** @type {GateRules} */
export const PROD_RULES = { prefixes: ['/assets/'], publicExt: ['js', 'css', 'woff2'] };

/** @param {Uint8Array} bytes */
function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The unlock token for a password.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function tokenFor(password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(MESSAGE))));
}

/**
 * Compare two strings without an early exit on the first differing character. Length is not secret here.
 * @param {string} a
 * @param {string} b
 */
export function constantTimeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Parse a Cookie request header into name → value (first occurrence wins, values URI-decoded when possible).
 * @param {string | null | undefined} header
 * @returns {Record<string, string>}
 */
export function parseCookies(header) {
  /** @type {Record<string, string>} */
  const out = {};
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

/**
 * Canonical form of a request path, for matching only: percent-decoded until stable, backslashes as slashes,
 * repeated slashes collapsed, "." and ".." segments resolved, trailing slash dropped, lowercased.
 * Returns null for anything malformed (bad escapes, NUL or other control characters, not starting with "/").
 * @param {string} raw
 * @returns {string | null}
 */
export function normalisePath(raw) {
  let p = raw;
  for (let i = 0; i < 5; i++) {
    let next;
    try { next = decodeURIComponent(p); } catch { return null; }
    if (next === p) break;
    p = next;
    if (i === 4) return null; // still decoding after five rounds: refuse
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) return null;
  p = p.replace(/\\/g, '/');
  if (!p.startsWith('/')) return null;
  /** @type {string[]} */
  const segs = [];
  for (const s of p.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') segs.pop();
    else segs.push(s);
  }
  return ('/' + segs.join('/')).toLowerCase();
}

/**
 * Does this request path need the unlock cookie? Malformed paths do (refused). Under an asset root only plain
 * names ending in a public type pass; everything else there (the model, data, tiles, unknown types) is gated.
 * Paths outside the asset roots (/, index.html, the wordmark) are public.
 * @param {string} rawPathname the path as received, still percent-encoded
 * @param {GateRules} [rules]
 */
export function isGatedPath(rawPathname, rules = PROD_RULES) {
  const p = normalisePath(rawPathname);
  if (p === null) return true;
  const root = rules.prefixes.find((pre) => p.startsWith(pre) || p === pre.slice(0, -1));
  if (!root) return false;
  const rest = p.slice(root.length);
  const m = /^[a-z0-9._/-]+\.([a-z0-9]+)$/.exec(rest);
  return !(m && rules.publicExt.includes(/** @type {string} */ (m[1])));
}

/** @typedef {'allow' | 'deny'} Decision */

/**
 * The middleware decision, pure: a gated path is allowed only with a cookie equal to the expected token.
 * `expected` null means the gate is not configured (no password): gated paths are then refused, never open.
 * @param {string} rawPathname
 * @param {string | null | undefined} cookieHeader
 * @param {string | null} expected
 * @param {GateRules} [rules]
 * @returns {Decision}
 */
export function decide(rawPathname, cookieHeader, expected, rules) {
  if (!isGatedPath(rawPathname, rules)) return 'allow';
  if (!expected) return 'deny';
  const got = parseCookies(cookieHeader)[GATE_COOKIE];
  return got !== undefined && constantTimeEqual(got, expected) ? 'allow' : 'deny';
}

/**
 * Does this Cookie header carry a valid unlock cookie for `password`?
 * @param {string | null | undefined} cookieHeader
 * @param {string | undefined} password
 */
export async function isUnlocked(cookieHeader, password) {
  if (!password) return false;
  const got = parseCookies(cookieHeader)[GATE_COOKIE];
  return got !== undefined && constantTimeEqual(got, await tokenFor(password));
}

/**
 * Set-Cookie values on unlock: the HttpOnly gate cookie and the readable hint. `secure` is off only for local http.
 * @param {string} token
 * @param {boolean} [secure]
 */
export function unlockCookies(token, secure = true) {
  const s = secure ? '; Secure' : '';
  return [`${GATE_COOKIE}=${token}; Path=/; HttpOnly${s}; SameSite=Lax; Max-Age=${MAX_AGE}`, hintCookie(secure)];
}

/**
 * Set-Cookie value for the readable hint alone (also refreshed by /api/gate while unlocked).
 * @param {boolean} [secure]
 */
export function hintCookie(secure = true) {
  return `${HINT_COOKIE}=1; Path=/${secure ? '; Secure' : ''}; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

/**
 * Set-Cookie value that clears the hint (sent when the gate reports locked, e.g. after a password change).
 * @param {boolean} [secure]
 */
export function clearHintCookie(secure = true) {
  return `${HINT_COOKIE}=; Path=/${secure ? '; Secure' : ''}; SameSite=Lax; Max-Age=0`;
}

/** Response headers for a gated file the cookie unlocked: cached by this browser only, never by a shared cache. */
export const GATED_OK_HEADERS = Object.freeze({ 'Cache-Control': 'private, max-age=31536000, immutable', Vary: 'Cookie' });
/** Response headers for a refused request. */
export const DENIED_HEADERS = Object.freeze({ 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', Vary: 'Cookie' });
