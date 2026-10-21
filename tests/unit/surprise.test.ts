import { describe, expect, it } from 'vitest';
import { DEFAULT } from '../../src/data/characters';
import { FAM, N } from '../../src/data/palette';
import { PARTS } from '../../src/data/parts';
import { validate } from '../../src/state/design';
import { surpriseDesign } from '../../src/ui/design';

describe('surpriseDesign', () => {
  it('builds a valid six-part design: cap from the lead family bold, no character', () => {
    let i = 0;
    const seq = [0.1, 0.5, 0.3, 0.9, 0.2, 0.7, 0.4, 0.6, 0.8, 0.05, 0.95, 0.35, 0.65, 0.15, 0.85, 0.45];
    const d = surpriseDesign(DEFAULT, () => seq[i++ % seq.length]);
    expect(d).toEqual(validate(d)); // only real options, swatches and finishes
    expect(Object.keys(d.colours).sort()).toEqual(PARTS.map((p) => p.id).sort());
    expect(d.colours.cap).toBe(FAM.lilac.bold); // 0.1 picks the first family
    expect([FAM.lilac.light, N]).toContain(d.colours.head);
    expect(d.character).toBe('');
    expect(d.stickers).toEqual(DEFAULT.stickers);
  });

  it('rand at its extremes stays in range', () => {
    for (const r of [0, 0.999999]) expect(() => validate(surpriseDesign(DEFAULT, () => r))).not.toThrow();
    const d = surpriseDesign(DEFAULT, () => 0.999999);
    expect(d).toEqual(validate(d));
  });
});
