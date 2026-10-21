import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_LOOK, LOOK_IDS, LOOKS, isLookId } from '../../src/three/looks';
import { METAL, PARITY_RESPONSE, applyFinish, materialResponse, plastic, setMaterialResponse, siliconeSheen } from '../../src/three/materials';

describe('looks', () => {
  it('parity holds the Task 18 render values', () => {
    const p = LOOKS.parity;
    expect(p.tone).toBe('neutral');
    expect(p.exposure).toBe(1.05);
    expect(p.key.intensity).toBeCloseTo(0.45 * Math.PI, 10);
    expect(p.key.pos).toEqual([-20, 26, 16]);
    expect(p.shadow).toMatchObject({ type: THREE.PCFShadowMap, mapSize: 2048, radius: 6, bias: -0.0004, normalBias: 0.03, intensity: 1 });
    expect(p.ssao).toEqual({ radius: 0.45, bias: 0.015, strength: 0.42 });
    expect(p.contact).toEqual({ box: 'r128', alpha: [0.38, 0.16, 0], fallbackAlpha: [0.38, 0.16, 0], scale: 1.7, drop: 0.02 });
    expect(p.ground).toBeNull();
    expect(p.rims).toEqual([]);
    expect(p.material).toBe(PARITY_RESPONSE);
  });
  it('every look has its own id and only phone-safe shadow types', () => {
    for (const id of LOOK_IDS) {
      expect(LOOKS[id].id).toBe(id);
      expect([THREE.PCFShadowMap, THREE.VSMShadowMap]).toContain(LOOKS[id].shadow.type);
      expect(LOOKS[id].shadow.mapSize).toBeLessThanOrEqual(4096);
      expect(LOOKS[id].pixelRatio[1]).toBeLessThanOrEqual(2);
    }
    expect(isLookId('b')).toBe(true);
    expect(isLookId('a')).toBe(false);
    expect(DEFAULT_LOOK).toBe('b');
    expect(LOOK_IDS).toEqual(['parity', 'b']);
  });
  it('b: VSM floor shadow, 2048 map, fade within two brush widths', () => {
    const b = LOOKS.b;
    expect(b.shadow.type).toBe(THREE.VSMShadowMap);
    expect(b.shadow.mapSize).toBe(2048);
    expect(b.shadow.blurSamples).toBe(16);
    expect(b.ground!.fade[1]).toBeLessThanOrEqual(2);
    expect(b.ground!.stretch).toBeGreaterThan(1);
  });
  it('material response: parity leaves plastics as authored, a look changes them', () => {
    expect(materialResponse()).toBe(PARITY_RESPONSE);
    expect(plastic('#fff', { roughness: 0.6 }).roughness).toBe(0.6);
    expect(METAL().roughness).toBe(0.3);
    expect(applyFinish(plastic('#fff'), 'matte').customProgramCacheKey()).not.toContain('grain');
    setMaterialResponse(LOOKS.b.material);
    try {
      expect(plastic('#fff', { roughness: 0.6 }).roughness).toBeCloseTo(0.6 * LOOKS.b.material.roughness, 10);
      expect(applyFinish(plastic('#fff'), 'satin').clearcoat).toBe(LOOKS.b.material.satin.clearcoat);
      expect(siliconeSheen('#adaae1').sheen).toBe(LOOKS.b.material.sheen);
      const sil = plastic('#adaae1', { roughness: 0.58, ...siliconeSheen('#adaae1') });
      expect(sil.roughness).toBeCloseTo((0.58 + LOOKS.b.material.silicone.roughnessAdd) * LOOKS.b.material.roughness, 10);
      expect(applyFinish(sil, 'satin').clearcoat).toBe(LOOKS.b.material.satin.siliconeClearcoat);
      expect(METAL().roughness).toBe(LOOKS.b.material.metal.roughness);
      expect(applyFinish(plastic('#fff'), 'matte').customProgramCacheKey()).toContain('grain');
      expect(applyFinish(plastic('#fff', siliconeSheen('#fff')), 'matte').customProgramCacheKey()).not.toContain('grain');
    } finally {
      setMaterialResponse(PARITY_RESPONSE);
    }
  });
});
