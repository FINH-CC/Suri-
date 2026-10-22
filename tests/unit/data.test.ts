import { describe, it, expect } from 'vitest';
import { SWATCHES, PRESETS, mixHex, lum, swatchName, HEX } from '../../src/data/palette';
import { PART, PARTS, dimFor } from '../../src/data/parts';
import { CHARACTERS, DEFAULT } from '../../src/data/characters';

describe('data modules', () => {
  it('palette sizes and names', () => {
    expect(SWATCHES.length).toBe(8);
    expect(SWATCHES.map(([h]) => h)).toEqual(['#dfd7ef', '#adaae1', '#fae59d', '#fbbe6e', '#d0e3cf', '#66bf8d', '#fda691', '#e86239']);
    expect(PRESETS.length).toBe(13);
    expect(PRESETS[1].name).toBe('Lilac B');
    expect(swatchName('#adaae1')).toBe('Lilac');
    expect(swatchName('#dfd7ef')).toBe('Lilac light');
    expect(swatchName('#ebeaeb')).toBe('#EBEAEB'); // the old neutral is no longer a swatch
    expect(HEX.test('#adaae1')).toBe(true);
  });
  it('characters and parts', () => {
    expect(CHARACTERS.puff.colours).toEqual(PRESETS.find((p) => p.name === 'Lilac B')!.c);
    expect(CHARACTERS.pip.colours).toEqual(PRESETS.find((p) => p.name === 'Green B')!.c);
    expect(CHARACTERS.splash.colours).toEqual(PRESETS.find((p) => p.name === 'Coral A')!.c);
    expect(CHARACTERS.nova.colours).toEqual(PRESETS.find((p) => p.name === 'Yellow B')!.c);
    expect(CHARACTERS.blank.colours).toEqual(PRESETS.find((p) => p.name === 'Lilac A')!.c);
    expect(Object.values(CHARACTERS).map((c) => c.parts.head)).toEqual(['plain', 'plain', 'plain', 'plain', 'plain']);
    expect(PART.cap.options.bubble).toBe('Pebble');
    expect(DEFAULT.name).toBe('Nova');
    expect(DEFAULT.parts).not.toBe(CHARACTERS.nova.parts);
  });
  it('the head has no shapes, only colour', () => {
    expect(PART.head.options).toEqual({ plain: 'Plain' });
  });
  it('six parts, no charm anywhere', () => {
    expect(PARTS.length).toBe(6);
    expect(PARTS.map((p) => p.id)).toEqual(['cap', 'head', 'grip', 'handle', 'button', 'mount']);
    expect(PRESETS.every((p) => !('charm' in p.c))).toBe(true);
    for (const c of Object.values(CHARACTERS)) {
      expect('charm' in c.parts).toBe(false);
      expect('charm' in c.colours).toBe(false);
    }
    expect('charm' in DEFAULT.parts).toBe(false);
    expect('charm' in DEFAULT.colours).toBe(false);
  });
  it('mixHex and lum', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(lum('#ffffff')).toBeCloseTo(1, 6);
    expect(lum('#000000')).toBe(0);
  });
  it('dimFor sets padFrontZ', () => {
    expect(dimFor(1.23).padFrontZ).toBe(1.23);
    expect(dimFor(1.23).mountCY).toBe(7.5);
  });
});
