import { handleUnlock } from '../lib/handlers.js';

/** POST /api/unlock { password } → 204 with the unlock cookie, 401 { ok:false }, or 503 when not configured. */
export function POST(request: Request): Promise<Response> {
  return handleUnlock(request, { password: process.env.SURI_PASSWORD });
}
