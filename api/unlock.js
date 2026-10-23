// @ts-check
import { handleUnlock } from '../lib/handlers.js';

/**
 * POST /api/unlock { password } → 204 with the unlock cookie, 401 { ok:false }, or 503 when not configured.
 * Plain JS on purpose: Vercel runs it without compiling it with the project's TypeScript.
 * @param {Request} request
 */
export function POST(request) {
  return handleUnlock(request, { password: process.env.SURI_PASSWORD });
}
