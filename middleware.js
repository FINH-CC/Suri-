// @ts-check
/*
 * Vercel Routing Middleware. No matcher: it runs on every request, because Vercel decodes paths for the static lookup
 * and an encoded prefix (/%61ssets/...) would slip past a matcher. lib/gate.js normalises the path first, then under
 * /assets/ only .js, .css and .woff2 are public; the brush model, its data, the tiles and any other type need a valid
 * unlock cookie. Plain JS on purpose: Vercel builds it without the project's TypeScript.
 */
import { next } from '@vercel/functions';
import { DENIED_HEADERS, GATED_OK_HEADERS, decide, isGatedPath, normalisePath, tokenFor } from './lib/gate.js';

/** @type {{ password: string, token: string } | null} */
let cached = null;
/** @param {string | undefined} password */
async function expectedToken(password) {
  if (!password) return null;
  if (cached?.password !== password) cached = { password, token: await tokenFor(password) };
  return cached.token;
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  if (normalisePath(pathname)?.startsWith('/api/')) return next(); // the Functions do their own checks
  if (!isGatedPath(pathname)) return next();
  const verdict = decide(pathname, request.headers.get('cookie'), await expectedToken(process.env.SURI_PASSWORD));
  if (verdict === 'deny') return new Response('Locked', { status: 401, headers: { ...DENIED_HEADERS } });
  return next({ headers: { ...GATED_OK_HEADERS } });
}
