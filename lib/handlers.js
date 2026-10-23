// @ts-check
/*
 * Web-standard request handlers for /api/gate and /api/unlock. The Vercel Functions in api/ call these, and so does
 * the dev-only emulation in vite.config.ts, so local tests run the same code that ships.
 */
import { clearHintCookie, hintCookie, isUnlocked, tokenFor, unlockCookies } from './gate.js';
import { WRONG_DELAY_MS, passwordMatches } from './password.js';

/**
 * @typedef {object} GateEnv
 * @property {string | undefined} password
 * @property {boolean} [secure] Secure cookies (true everywhere except the local http emulation)
 * @property {number} [wrongDelayMs] wrong-password delay in ms (tests shorten it)
 */

/**
 * @param {number} status
 * @param {unknown} body
 * @param {HeadersInit} [extra]
 */
function json(status, body, extra) {
  const headers = new Headers(extra);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * GET /api/gate → { unlocked } (the cookie is HttpOnly, so the page asks). 503 when no password is configured.
 * @param {Request} req
 * @param {GateEnv} env
 * @returns {Promise<Response>}
 */
export async function handleGate(req, env) {
  if (!env.password) return json(503, { error: 'not-configured' });
  const unlocked = await isUnlocked(req.headers.get('cookie'), env.password);
  const headers = new Headers();
  headers.append('Set-Cookie', unlocked ? hintCookie(env.secure ?? true) : clearHintCookie(env.secure ?? true));
  return json(200, { unlocked }, headers);
}

/**
 * POST /api/unlock { password } → 204 + cookies, or 401 { ok:false } after a delay; 503 when not configured.
 * @param {Request} req
 * @param {GateEnv} env
 * @returns {Promise<Response>}
 */
export async function handleUnlock(req, env) {
  if (req.method !== 'POST') return json(405, { error: 'method-not-allowed' }, { Allow: 'POST' });
  if (!env.password) return json(503, { error: 'not-configured' });
  /** @type {unknown} */
  let given;
  try { given = /** @type {{ password?: unknown } | null} */ (await req.json())?.password; } catch { given = undefined; }
  if (!passwordMatches(given, env.password)) {
    await new Promise((r) => setTimeout(r, env.wrongDelayMs ?? WRONG_DELAY_MS));
    return json(401, { ok: false });
  }
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const c of unlockCookies(await tokenFor(env.password), env.secure ?? true)) headers.append('Set-Cookie', c);
  return new Response(null, { status: 204, headers });
}
