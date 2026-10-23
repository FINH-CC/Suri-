import { describe, expect, test } from 'vitest';
import { GATE_COOKIE, HINT_COOKIE, constantTimeEqual, decide, isGatedPath, isUnlocked, normalisePath, parseCookies, tokenFor, unlockCookies } from '../../lib/gate.js';
import { handleGate, handleUnlock } from '../../lib/handlers.js';
import { passwordMatches } from '../../lib/password.js';

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
  test('under /assets/ only js, css and woff2 are public; everything else needs the cookie', () => {
    expect(isGatedPath('/assets/brush-Ab12.glb')).toBe(true);
    expect(isGatedPath('/assets/cap-bear-x.webp')).toBe(true);
    expect(isGatedPath('/assets/brush-meta-x.json')).toBe(true);
    expect(isGatedPath('/assets/unknown-x.bin')).toBe(true); // unknown types are gated too
    expect(isGatedPath('/assets/noext')).toBe(true);
    expect(isGatedPath('/assets')).toBe(true);
    expect(isGatedPath('/assets/')).toBe(true);
    expect(isGatedPath('/assets/index-x.js')).toBe(false);
    expect(isGatedPath('/assets/index-x.css')).toBe(false);
    expect(isGatedPath('/assets/plain-x.woff2')).toBe(false);
    expect(isGatedPath('/assets/INDEX-X.JS')).toBe(false);
    expect(isGatedPath('/')).toBe(false);
    expect(isGatedPath('/index.html')).toBe(false);
    expect(isGatedPath('/suri-wordmark.png')).toBe(false);
    expect(isGatedPath('/src/assets/model/brush.glb')).toBe(false);
    const dev = { prefixes: ['/assets/', '/src/assets/'], publicExt: ['js', 'css', 'woff2', 'ts'] };
    expect(isGatedPath('/src/assets/model/brush.glb', dev)).toBe(true);
    expect(isGatedPath('/src/assets/tiles.ts', dev)).toBe(false);
    expect(isGatedPath('/src/assets/fonts/plain.woff2', dev)).toBe(false);
  });
  test('encoded and non-canonical paths are normalised before matching', () => {
    for (const p of [
      '/assets/brush-X%2eglb', // encoded dot
      '/assets/brush-X.%67lb', // encoded letter
      '/%61ssets/brush-X.glb', // encoded prefix
      '//assets/brush-X.glb', // doubled slash
      '/assets//brush-X.glb',
      '/assets/brush-X.glb/', // trailing slash
      '/assets/brush-X.GLB', // case
      '/ASSETS/brush-X.glb',
      '/assets/x/../brush-X.glb', // dot segments
      '/./assets/brush-X.glb',
      '/x/../assets/brush-X.glb',
      '/api/../assets/brush-X.glb',
      '/assets/brush-X.glb%00', // NUL
      '/assets/index-x.js%00', // NUL after a public type
      '/assets/brush-X.glb%00.js',
      '/assets/brush-X.glb%3f.js', // decoded "?" is not a plain name
      '/assets/brush-X.glb;.js',
      '/assets/%252e%252e/assets/brush-X.glb', // double-encoded
      '/assets\\brush-X.glb', // backslash
      '/assets/brush-%E0%A4%A.glb', // malformed escape
      '/%E0%A4%A', // malformed anywhere: refused
    ]) expect(isGatedPath(p), p).toBe(true);
    expect(isGatedPath('/assets/index-x%2ejs')).toBe(false); // the same JS file, still public
    expect(isGatedPath('/assets/index-x.js/')).toBe(false);
    expect(normalisePath('/a//b/./c/../d/')).toBe('/a/b/d');
    expect(normalisePath('/%61ssets/X%2eGLB')).toBe('/assets/x.glb');
    expect(normalisePath('/a%00')).toBeNull();
    expect(normalisePath('/%zz')).toBeNull();
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

describe('middleware.js', () => {
  test('401 without the cookie, continues with it, JS always continues; refuses when unconfigured', async () => {
    const mod = await import('../../middleware.js');
    const middleware = mod.default;
    expect('config' in mod).toBe(false); // no matcher: it sees every path, so encoded prefixes cannot slip past
    const prev = process.env.SURI_PASSWORD;
    try {
      process.env.SURI_PASSWORD = PW;
      const t = await tokenFor(PW);
      const locked = await middleware(new Request('https://x/assets/brush-x.glb'));
      expect(locked.status).toBe(401);
      expect(locked.headers.get('Cache-Control')).toBe('no-store');
      expect(locked.headers.get('Vary')).toBe('Cookie');
      for (const p of ['/%61ssets/brush-x.glb', '/assets/brush-x%2eglb', '//assets/brush-x.glb', '/api/%2e%2e/assets/brush-x.glb'])
        expect((await middleware(new Request('https://x' + p))).status, p).toBe(401);
      const open = await middleware(new Request('https://x/assets/brush-x.glb', { headers: { cookie: `${GATE_COOKIE}=${t}` } }));
      expect(open.headers.get('x-middleware-next')).toBe('1');
      expect(open.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
      expect(open.headers.get('Vary')).toBe('Cookie');
      expect((await middleware(new Request('https://x/'))).headers.get('x-middleware-next')).toBe('1');
      expect((await middleware(new Request('https://x/api/gate'))).headers.get('x-middleware-next')).toBe('1');
      expect((await middleware(new Request('https://x/suri-wordmark.png'))).headers.get('Cache-Control')).toBeNull();
      expect((await middleware(new Request('https://x/assets/index-x.js'))).headers.get('x-middleware-next')).toBe('1');
      delete process.env.SURI_PASSWORD;
      expect((await middleware(new Request('https://x/assets/brush-x.glb', { headers: { cookie: `${GATE_COOKIE}=${t}` } }))).status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.SURI_PASSWORD; else process.env.SURI_PASSWORD = prev;
    }
  });
});
