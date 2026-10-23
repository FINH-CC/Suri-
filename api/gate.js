// @ts-check
import { handleGate } from '../lib/handlers.js';

/**
 * GET /api/gate → { unlocked: boolean }. SURI_PASSWORD is set in Vercel → Project → Settings → Environment Variables.
 * Plain JS on purpose: Vercel runs it without compiling it with the project's TypeScript.
 * @param {Request} request
 */
export function GET(request) {
  return handleGate(request, { password: process.env.SURI_PASSWORD });
}
