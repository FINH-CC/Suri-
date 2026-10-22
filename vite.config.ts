import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { decide, isGatedPath, tokenFor } from './lib/gate.js';
import { handleGate, handleUnlock } from './lib/handlers.js';

/** Dev/preview only: `VITE_GATE=1` turns the password gate on locally (see gateEmulation). */
const GATE = process.env.VITE_GATE === '1';

/** Preload the brush glb (the biggest download) from the HTML so it starts before main.js is parsed. In a build the
    href is the content-hashed /assets/brush-<hash>.glb; in dev it is the source path Vite serves.
    With the password gate on (every build, dev with VITE_GATE=1) a locked visitor would only get a 401 (and a
    preloaded 401 can be handed to the later fetch), so a tiny inline script adds the preload only when the readable
    `suri_unlocked` hint cookie says this browser was unlocked. */
function preloadBrush(): Plugin {
  const SRC = 'src/assets/model/brush.glb';
  return {
    name: 'suri-preload-brush',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        let href = '/' + SRC;
        if (ctx.bundle) {
          const asset = Object.values(ctx.bundle).find(
            (o) => o.type === 'asset' && (o.originalFileNames ?? []).some((n) => n.endsWith(SRC)),
          );
          if (!asset) throw new Error(`${SRC} is not in the bundle`);
          href = '/' + asset.fileName;
        }
        if (!ctx.bundle && !GATE) return [{ tag: 'link', attrs: { rel: 'preload', as: 'fetch', href, crossorigin: '' }, injectTo: 'head' }];
        const js = `if(/(?:^|;\\s*)suri_unlocked=1(?:;|$)/.test(document.cookie)){var l=document.createElement('link');l.rel='preload';l.as='fetch';l.href=${JSON.stringify(href)};l.crossOrigin='';document.head.appendChild(l)}`;
        return [{ tag: 'script', children: js, injectTo: 'head' }];
      },
    },
  };
}

/**
 * Local stand-in for the Vercel side of the password gate (api/gate.ts, api/unlock.ts, middleware.ts), installed on
 * the dev and preview servers only when VITE_GATE=1, with the password from process.env.SURI_PASSWORD. It runs the
 * same lib/ handlers and decision; it lives in this config, so nothing of it reaches dist/.
 * In dev the model and tiles are served from /src/assets/: those bare file requests are gated too, while Vite's own
 * module requests for them (`?url`, `?import`) stay open, as the JS bundle does in production.
 */
function gateEmulation(): Plugin {
  const MODULE_QUERY = /[?&](url|import|raw|inline|worker|direct)\b/;
  async function toRequest(req: IncomingMessage): Promise<Request> {
    const chunks: Buffer[] = [];
    if (req.method === 'POST') for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    return new Request(new URL(req.url ?? '/', 'http://localhost'), {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
  }
  async function send(res: ServerResponse, r: Response) {
    res.statusCode = r.status;
    r.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.end(Buffer.from(await r.arrayBuffer()));
  }
  const install = (middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }) =>
    middlewares.use((req, res, next) => {
      void (async () => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const env = { password: process.env.SURI_PASSWORD, secure: false };
        if (url.pathname === '/api/gate') return send(res, await handleGate(await toRequest(req), env));
        if (url.pathname === '/api/unlock') return send(res, await handleUnlock(await toRequest(req), env));
        const prefixes = ['/assets/', '/src/assets/'];
        if (isGatedPath(url.pathname, prefixes) && !MODULE_QUERY.test(url.search)) {
          const expected = env.password ? await tokenFor(env.password) : null;
          if (decide(url.pathname, req.headers.cookie, expected, prefixes) === 'deny') {
            res.statusCode = 401;
            res.setHeader('Cache-Control', 'no-store');
            return res.end('Locked');
          }
        }
        next();
      })().catch(next);
    });
  return {
    name: 'suri-gate-emulation',
    configureServer(server) { if (GATE) install(server.middlewares); },
    configurePreviewServer(server) { if (GATE) install(server.middlewares); },
  };
}

export default defineConfig({
  plugins: [preloadBrush(), gateEmulation()],
  // Never inline: every model, tile and font ships as its own content-hashed file under /assets (cached immutable).
  build: { assetsInlineLimit: 0 },
  // `npm run tiles` writes src/assets/tiles while the page it drives is open on this server: watching those files
  // reloaded the page mid-run. New tiles show after a manual reload.
  server: { port: 3240, watch: { ignored: ['**/src/assets/tiles/**'] } },
  preview: { port: 3240 },
});
