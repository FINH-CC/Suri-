// @ts-check
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time password check (Node runtimes only: the unlock Function and the dev emulation). Both sides are hashed
 * to equal-length SHA-256 digests first, so timingSafeEqual never throws and the length of the password never leaks.
 * @param {unknown} given
 * @param {string} expected
 */
export function passwordMatches(given, expected) {
  if (typeof given !== 'string') return false;
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Wrong-password delay, so guessing is slow. */
export const WRONG_DELAY_MS = 600;
