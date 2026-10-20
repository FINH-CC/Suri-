import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyFinish, lin, mixHex, plastic, siliconeSheen, surfaceColour } from '../../src/three/materials';
import { NEUTRAL_TONE_MAPPING } from '../../src/three/renderer';

describe('materials', () => {
  it('eases near-white surfaces down to ~80%', () => {
    expect(Math.abs(surfaceColour('#ffffff').r - 0.8)).toBeLessThan(0.001);
  });
  it('leaves mid tones untouched', () => {
    expect(Math.abs(surfaceColour('#808080').r - lin('#808080').r)).toBeLessThan(0.01);
  });
  it('silicone sheen is a 0.32 float', () => {
    expect(siliconeSheen('#adaae1').sheen).toBe(0.32);
    expect(siliconeSheen('#adaae1').sheenColor.equals(lin(mixHex('#adaae1', '#ffffff', 0.55)))).toBe(true);
  });
  it('sheen roughness follows the material roughness, also after satin', () => {
    const m = plastic('#adaae1', { ...siliconeSheen('#adaae1'), roughness: 0.55 });
    expect(m.sheenRoughness).toBe(0.55);
    expect(applyFinish(m, 'satin').sheenRoughness).toBe(0.36);
  });
  it('satin finish sets roughness 0.36', () => {
    expect(applyFinish(plastic('#fff'), 'satin').roughness).toBe(0.36);
  });
  it('speckle finish sets the program cache key', () => {
    expect(applyFinish(plastic('#fff'), 'speckle').customProgramCacheKey()).toBe('speckle');
  });
});

describe('shader string patches', () => {
  it('neutral tone mapping replaced the CustomToneMapping stub', () => {
    expect(NEUTRAL_TONE_MAPPING).toBe(true);
    expect(THREE.ShaderChunk.tonemapping_pars_fragment).toContain('startCompression');
  });
  it('speckle replace targets exist in the physical shader', () => {
    expect(THREE.ShaderLib.physical.fragmentShader).toContain('vec4 diffuseColor = vec4( diffuse, opacity );');
    expect(THREE.ShaderLib.physical.vertexShader).toContain('#include <begin_vertex>');
  });
});
