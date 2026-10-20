import { describe, expect, it } from 'vitest';
import { applyFinish, lin, plastic, siliconeSheen, surfaceColour } from '../../src/three/materials';

describe('materials', () => {
  it('eases near-white surfaces down to ~80%', () => {
    expect(Math.abs(surfaceColour('#ffffff').r - 0.8)).toBeLessThan(0.001);
  });
  it('leaves mid tones untouched', () => {
    expect(Math.abs(surfaceColour('#808080').r - lin('#808080').r)).toBeLessThan(0.01);
  });
  it('silicone sheen is a 0.32 float', () => {
    expect(siliconeSheen('#adaae1').sheen).toBe(0.32);
  });
  it('satin finish sets roughness 0.36', () => {
    expect(applyFinish(plastic('#fff'), 'satin').roughness).toBe(0.36);
  });
  it('speckle finish sets the program cache key', () => {
    expect(applyFinish(plastic('#fff'), 'speckle').customProgramCacheKey()).toBe('speckle');
  });
});
