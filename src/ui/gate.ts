/*
 * Client side of the password gate. The unlock cookie is HttpOnly, so the page asks the server (/api/gate).
 * Production builds always gate. In dev the gate is off unless VITE_GATE=1 (then vite.config.ts emulates the API).
 */
export const GATE_ON = !import.meta.env.DEV || import.meta.env.VITE_GATE === '1';

export type GateState = 'unlocked' | 'locked' | 'not-configured';
export type UnlockResult = 'ok' | 'wrong' | 'not-configured';

/** Ask the server whether this visitor is unlocked. Throws on a network failure or an unexpected answer. */
export async function checkGate(): Promise<GateState> {
  const r = await fetch('/api/gate', { cache: 'no-store', credentials: 'same-origin' });
  if (r.status === 503) return 'not-configured';
  if (!r.ok) throw new Error(`gate: HTTP ${r.status}`);
  const body = (await r.json()) as { unlocked?: unknown };
  return body.unlocked === true ? 'unlocked' : 'locked';
}

/** Send a password. Throws on a network failure or an unexpected answer. */
export async function tryUnlock(password: string): Promise<UnlockResult> {
  const r = await fetch('/api/unlock', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (r.status === 204 || r.ok) return 'ok';
  if (r.status === 401) return 'wrong';
  if (r.status === 503) return 'not-configured';
  throw new Error(`unlock: HTTP ${r.status}`);
}
