/*
 * Web-standard request handlers for /api/gate and /api/unlock. The Vercel Functions in api/ call these, and so does
 * the dev-only emulation in vite.config.ts, so local tests run the same code that ships.
 */
import { clearHintCookie, isUnlocked, tokenFor, unlockCookies } from './gate';
import { WRONG_DELAY_MS, passwordMatches } from './password';

export interface GateEnv {
  password: string | undefined;
  /** Secure cookies (true everywhere except the local http emulation). */
  secure?: boolean;
  /** Wrong-password delay in ms (tests shorten it). */
  wrongDelayMs?: number;
}

const json = (status: number, body: unknown, extra?: HeadersInit): Response => {
  const headers = new Headers(extra);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
};

/** GET /api/gate → { unlocked } (the cookie is HttpOnly, so the page asks). 503 when no password is configured. */
export async function handleGate(req: Request, env: GateEnv): Promise<Response> {
  if (!env.password) return json(503, { error: 'not-configured' });
  const unlocked = await isUnlocked(req.headers.get('cookie'), env.password);
  const headers = new Headers();
  if (!unlocked) headers.append('Set-Cookie', clearHintCookie(env.secure ?? true));
  return json(200, { unlocked }, headers);
}

/** POST /api/unlock { password } → 204 + cookies, or 401 { ok:false } after a delay; 503 when not configured. */
export async function handleUnlock(req: Request, env: GateEnv): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method-not-allowed' }, { Allow: 'POST' });
  if (!env.password) return json(503, { error: 'not-configured' });
  let given: unknown;
  try { given = ((await req.json()) as { password?: unknown } | null)?.password; } catch { given = undefined; }
  if (!passwordMatches(given, env.password)) {
    await new Promise((r) => setTimeout(r, env.wrongDelayMs ?? WRONG_DELAY_MS));
    return json(401, { ok: false });
  }
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const c of unlockCookies(await tokenFor(env.password), env.secure ?? true)) headers.append('Set-Cookie', c);
  return new Response(null, { status: 204, headers });
}
