import { describe, expect, it } from 'vitest';
import { DEFAULT } from '../../src/data/characters';
import { PARTS } from '../../src/data/parts';
import { applyFinish, PARITY_RESPONSE, patchKeys, plastic, setMaterialResponse, siliconeSheen } from '../../src/three/materials';
import { finishOnly, partsToRebuild, refinish } from '../../src/three/scene';
import { handleDetails } from '../../src/three/details';
import type { Design } from '../../src/state/design';

const clone = (d: Design): Design => JSON.parse(JSON.stringify(d));

describe('scene diff', () => {
  it('first build rebuilds all 6 parts, head before cap, no charm', () => {
    const ids = partsToRebuild(null, DEFAULT);
    expect([...ids].sort()).toEqual(PARTS.map((p) => p.id).sort());
    expect(ids.length).toBe(6);
    expect(ids as string[]).not.toContain('charm');
    expect(ids.indexOf('head')).toBeLessThan(ids.indexOf('cap'));
  });
  it('a cap colour change rebuilds only the cap', () => {
    const n = clone(DEFAULT);
    n.colours.cap = n.colours.cap === '#ffffff' ? '#252525' : '#ffffff';
    expect(partsToRebuild(DEFAULT, n)).toEqual(['cap']);
  });
  it('a head style change rebuilds head then cap', () => {
    const n = clone(DEFAULT);
    n.parts.head = 'upload'; // the only other head is an uploaded one
    expect(partsToRebuild(DEFAULT, n)).toEqual(['head', 'cap']);
  });
  it('a finish change rebuilds nothing and is finish-only', () => {
    const n = clone(DEFAULT);
    n.finish = n.finish === 'satin' ? 'matte' : 'satin';
    expect(partsToRebuild(DEFAULT, n)).toEqual([]);
    expect(finishOnly(DEFAULT, n)).toBe(true);
  });
  it('a name change rebuilds nothing and is not finish-only', () => {
    const n = clone(DEFAULT);
    n.name = 'Zed';
    expect(partsToRebuild(DEFAULT, n)).toEqual([]);
    expect(finishOnly(DEFAULT, n)).toBe(false);
    expect(finishOnly(null, n)).toBe(false);
  });
  it('refinish round-trips matte -> satin -> speckle -> matte to the base values', () => {
    const m = applyFinish(plastic('#adaae1', { roughness: 0.55, clearcoat: 0.15, ...siliconeSheen('#adaae1') }), 'matte');
    expect(m.userData.finishable).toBe(true);
    refinish(m, 'satin');
    expect(m.roughness).toBe(0.36);
    refinish(m, 'speckle');
    expect(m.roughness).toBe(0.55);
    expect(m.clearcoat).toBe(0.15);
    expect(m.sheenRoughness).toBe(0.55);
    expect(m.customProgramCacheKey()).toBe('speckle');
    refinish(m, 'matte');
    expect(m.customProgramCacheKey()).toBe('');
    expect(m.roughness).toBe(0.55);
  });
  it('refinish gives the same patch order and program key as a fresh build (detail patches included)', () => {
    const hex = '#fbbe6e';
    for (const finish of ['speckle', 'matte', 'satin'] as const) {
      const fresh = handleDetails(applyFinish(plastic(hex, { roughness: 0.6, clearcoat: 0 }), finish));
      const m = handleDetails(applyFinish(plastic(hex, { roughness: 0.6, clearcoat: 0 }), 'satin'));
      refinish(m, 'speckle');
      refinish(m, finish);
      expect(patchKeys(m)).toEqual(patchKeys(fresh));
      expect(m.customProgramCacheKey()).toBe(fresh.customProgramCacheKey());
    }
    const s = handleDetails(applyFinish(plastic(hex), 'speckle'));
    expect(patchKeys(s)).toEqual(['speckle', 'handle-details']);
  });
  it('refinish restores specularIntensity after Satin', () => {
    setMaterialResponse({ ...PARITY_RESPONSE, satin: { ...PARITY_RESPONSE.satin, specular: 2 } });
    try {
      const m = applyFinish(plastic('#fbbe6e'), 'satin');
      expect(m.specularIntensity).toBe(2);
      refinish(m, 'matte');
      expect(m.specularIntensity).toBe(1);
      refinish(m, 'satin');
      expect(m.specularIntensity).toBe(2);
    } finally {
      setMaterialResponse(PARITY_RESPONSE);
    }
  });
});
