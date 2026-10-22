/*
 * Vercel Routing Middleware: the brush model (.glb), its data (.json) and the tiles (.webp) under /assets/ are refused
 * without a valid unlock cookie. JS, CSS and fonts stay public so the loader can draw the password field.
 * The decision itself is lib/gate.ts decide() (unit tested).
 */
import { next } from '@vercel/functions';
import { decide, isGatedPath, tokenFor } from './lib/gate';

export const config = { matcher: '/assets/:path*' };

let cached: { password: string; token: string } | null = null;
async function expectedToken(password: string | undefined): Promise<string | null> {
  if (!password) return null;
  if (cached?.password !== password) cached = { password, token: await tokenFor(password) };
  return cached.token;
}

export default async function middleware(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (!isGatedPath(pathname)) return next();
  const verdict = decide(pathname, request.headers.get('cookie'), await expectedToken(process.env.SURI_PASSWORD));
  if (verdict === 'deny') {
    return new Response('Locked', { status: 401, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', Vary: 'Cookie' } });
  }
  return next();
}
