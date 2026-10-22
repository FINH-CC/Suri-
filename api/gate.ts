import { handleGate } from '../lib/handlers';

/** GET /api/gate → { unlocked: boolean }. SURI_PASSWORD is set in Vercel → Project → Settings → Environment Variables. */
export function GET(request: Request): Promise<Response> {
  return handleGate(request, { password: process.env.SURI_PASSWORD });
}
