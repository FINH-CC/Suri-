import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/data/characters';
import { PARTS } from '../../src/data/parts';

describe('static tiles', () => {
  it('has a webp for every part option', () => {
    for (const p of PARTS) for (const k of Object.keys(p.options)) expect(existsSync(`public/tiles/${p.id}-${k}.webp`), `${p.id}-${k}`).toBe(true);
  });
  it('has a webp for every character', () => {
    for (const id of Object.keys(CHARACTERS)) expect(existsSync(`public/tiles/char-${id}.webp`), `char-${id}`).toBe(true);
  });
});
