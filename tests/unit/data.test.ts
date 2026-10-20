import { describe, it, expect } from 'vitest';
import { SWATCHES, PRESETS, mixHex, lum, swatchName, HEX } from '../../src/data/palette';
import { PART, dimFor } from '../../src/data/parts';
import { CHARACTERS, DEFAULT } from '../../src/data/characters';

describe('data modules', () => {
  it('palette sizes and names', () => {
    expect(SWATCHES.length).toBe(11);
    expect(PRESETS.length).toBe(10);
    expect(PRESETS[1].name).toBe('Lilac B');
    expect(swatchName('#ebeaeb')).toBe('Soft neutral');
    expect(HEX.test('#adaae1')).toBe(true);
  });
  it('characters and parts', () => {
    expect(CHARACTERS.puff.colours.cap).toBe('#adaae1');
    expect(PART.cap.options.bubble).toBe('Pebble');
    expect(DEFAULT.name).toBe('Nova');
    expect(DEFAULT.parts).not.toBe(CHARACTERS.nova.parts);
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
