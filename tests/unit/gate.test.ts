import { describe, expect, test } from 'vitest';
import { GATE_COOKIE, HINT_COOKIE, constantTimeEqual, decide, isGatedPath, isUnlocked, parseCookies, tokenFor, unlockCookies } from '../../lib/gate';
import { handleGate, handleUnlock } from '../../lib/handlers';
import { passwordMatches } from '../../lib/password';

// Throwaway test value only. The real password lives in Vercel env vars, never in the repo.
const PW = 'test-gate-pass';

describe('token', () => {
  test('is a deterministic base64url HMAC-SHA256 of "suri-gate-v1" keyed by the password', async () => {
    const { createHmac } = await import('node:crypto');
    const want = createHmac('sha256', PW).update('suri-gate-v1').digest('base64url');
    expect(await tokenFor(PW)).toBe(want);
    expect(await tokenFor(PW)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  test('changes with the password (a new password signs everyone out)', async () => {
    expect(await tokenFor(PW)).not.toBe(await tokenFor(PW + '2'));
  });
});

describe('constant-time compare', () => {
  test('equal, different, different length, empty', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', 'a')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
  test('passwordMatches compares digests and rejects non-strings', () => {
    expect(passwordMatches(PW, PW)).toBe(true);
    expect(passwordMatches(PW + ' ', PW)).toBe(false);
    expect(passwordMatches('', PW)).toBe(false);
    expect(passwordMatches(undefined, PW)).toBe(false);
    expect(passwordMatches(123, PW)).toBe(false);
  });
});

describe('cookie parsing', () => {
  test('splits, trims, decodes, first wins, ignores junk', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('a=1; b = two ;c="q"; junk; d=%20x; a=again')).toEqual({ a: '1', b: 'two', c: 'q', d: ' x' });
    expect(parseCookies('t=a=b')).toEqual({ t: 'a=b' }); // only the first = splits
    expect(parseCookies('bad=%E0%A4%A')).toEqual({ bad: '%E0%A4%A' });
  });
});

describe('middleware decision', () => {
  test('gated types are glb, webp, json under /assets/ only', () => {
    expect(isGatedPath('/assets/brush-Ab12.glb')).toBe(true);
    expect(isGatedPath('/assets/cap-bear-x.webp')).toBe(true);
    expect(isGatedPath('/assets/brush-meta-x.json')).toBe(true);
    expect(isGatedPath('/assets/index-x.js')).toBe(false);
    expect(isGatedPath('/assets/index-x.css')).toBe(false);
    expect(isGatedPath('/assets/plain-x.woff2')).toBe(false);
    expect(isGatedPath('/suri-wordmark.png')).toBe(false);
    expect(isGatedPath('/src/assets/model/brush.glb')).toBe(false);
    expect(isGatedPath('/src/assets/model/brush.glb', ['/assets/', '/src/assets/'])).toBe(true);
  });
  test('allow with the right cookie, deny without, with a wrong one, or when not configured', async () => {
    const t = await tokenFor(PW);
    const glb = '/assets/brush-x.glb';
    expect(decide(glb, `${GATE_COOKIE}=${t}`, t)).toBe('allow');
    expect(decide(glb, `other=1; ${GATE_COOKIE}=${t}`, t)).toBe('allow');
    expect(decide(glb, null, t)).toBe('deny');
    expect(decide(glb, `${GATE_COOKIE}=nope`, t)).toBe('deny');
    expect(decide(glb, `${HINT_COOKIE}=1`, t)).toBe('deny'); // the readable hint unlocks nothing
    expect(decide(glb, `${GATE_COOKIE}=${t}`, null)).toBe('deny'); // never fall open
    expect(decide('/assets/index-x.js', null, t)).toBe('allow');
  });
  test('isUnlocked', async () => {
    const t = await tokenFor(PW);
    expect(await isUnlocked(`${GATE_COOKIE}=${t}`, PW)).toBe(true);
    expect(await isUnlocked(`${GATE_COOKIE}=${t}`, 'other')).toBe(false);
    expect(await isUnlocked(`${GATE_COOKIE}=${t}`, undefined)).toBe(false);
  });
});

describe('handlers', () => {
  const post = (body: string) => new Request('http://x/api/unlock', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });

  test('unlock: right password → 204 + HttpOnly Secure cookie and the hint', async () => {
    const r = await handleUnlock(post(JSON.stringify({ password: PW })), { password: PW });
    expect(r.status).toBe(204);
    const cookies = r.headers.getSetCookie();
    expect(cookies).toEqual(unlockCookies(await tokenFor(PW)));
    expect(cookies[0]).toBe(`${GATE_COOKIE}=${await tokenFor(PW)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    expect(cookies[1]).not.toContain('HttpOnly');
  });
  test('unlock: wrong password → 401 { ok:false } after the delay, no cookie', async () => {
    const t0 = performance.now();
    const r = await handleUnlock(post(JSON.stringify({ password: 'wrong' })), { password: PW, wrongDelayMs: 50 });
    expect(performance.now() - t0).toBeGreaterThanOrEqual(45);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ ok: false });
    expect(r.headers.getSetCookie()).toEqual([]);
  });
  test('unlock: bad body → 401, GET → 405, no password configured → 503', async () => {
    expect((await handleUnlock(post('not json'), { password: PW, wrongDelayMs: 0 })).status).toBe(401);
    expect((await handleUnlock(new Request('http://x/api/unlock'), { password: PW })).status).toBe(405);
    const r = await handleUnlock(post(JSON.stringify({ password: '' })), { password: undefined });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'not-configured' });
  });
  test('gate: reports the cookie state, clears the hint when locked, 503 when not configured', async () => {
    const t = await tokenFor(PW);
    const ok = await handleGate(new Request('http://x/api/gate', { headers: { cookie: `${GATE_COOKIE}=${t}` } }), { password: PW });
    expect(await ok.json()).toEqual({ unlocked: true });
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    const locked = await handleGate(new Request('http://x/api/gate'), { password: PW });
    expect(await locked.json()).toEqual({ unlocked: false });
    expect(locked.headers.getSetCookie()[0]).toMatch(new RegExp(`^${HINT_COOKIE}=;.*Max-Age=0`));
    expect((await handleGate(new Request('http://x/api/gate'), { password: undefined })).status).toBe(503);
  });
});

describe('middleware.ts', () => {
  test('401 without the cookie, continues with it, JS always continues; refuses when unconfigured', async () => {
    const { default: middleware, config } = await import('../../middleware');
    expect(config.matcher).toBe('/assets/:path*');
    const prev = process.env.SURI_PASSWORD;
    try {
      process.env.SURI_PASSWORD = PW;
      const t = await tokenFor(PW);
      const locked = await middleware(new Request('https://x/assets/brush-x.glb'));
      expect(locked.status).toBe(401);
      expect(locked.headers.get('Cache-Control')).toBe('no-store');
      const open = await middleware(new Request('https://x/assets/brush-x.glb', { headers: { cookie: `${GATE_COOKIE}=${t}` } }));
      expect(open.headers.get('x-middleware-next')).toBe('1');
      expect((await middleware(new Request('https://x/assets/index-x.js'))).headers.get('x-middleware-next')).toBe('1');
      delete process.env.SURI_PASSWORD;
      expect((await middleware(new Request('https://x/assets/brush-x.glb', { headers: { cookie: `${GATE_COOKIE}=${t}` } }))).status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.SURI_PASSWORD; else process.env.SURI_PASSWORD = prev;
    }
  });
});
