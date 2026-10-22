import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BRISTLE, mixHex, SWATCHES } from '../../src/data/palette';
import {
  decodeMask,
  hexHsl,
  tintTuft,
  tipTint,
  TIP_START,
  TIP_STRENGTH,
  tuftShade,
  WORDMARK_ASPECT,
  wordmarkRect,
  wordmarkTexels,
} from '../../src/three/details';
import { addPatch, applyFinish, clearFinishPatches, plastic } from '../../src/three/materials';
import { WORDMARK_MASK } from '../../src/three/wordmark-mask';

describe('bristle tip tint and shade', () => {
  it('is the off-white bristle colour below the tip', () => {
    for (const t of [0, 0.3, 0.6, TIP_START]) expect(tipTint(t, '#e86239')).toBe(BRISTLE);
  });
  it('only hints at the head colour at the very tip', () => {
    for (const [hex] of SWATCHES) expect(tipTint(1, hex)).toBe(mixHex(BRISTLE, hex, TIP_STRENGTH));
    expect(TIP_STRENGTH).toBeLessThanOrEqual(0.25);
    expect(TIP_START).toBeGreaterThanOrEqual(0.9);
  });
  it('blends monotonically toward the tip', () => {
    const g = [0.92, 0.95, 0.98, 1].map((t) => parseInt(tipTint(t, '#e86239').slice(3, 5), 16)); // green channel falls
    for (let i = 1; i < g.length; i++) expect(g[i]).toBeLessThan(g[i - 1]);
  });
  it('baked occlusion is dark at the pad, full white at the tip, monotonic', () => {
    expect(tuftShade(0)).toBeCloseTo(0.12, 6);
    expect(tuftShade(1)).toBe(1);
    expect(tuftShade(0.95)).toBeCloseTo(1, 6);
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      expect(tuftShade(t)).toBeGreaterThanOrEqual(prev);
      prev = tuftShade(t);
    }
  });
  it('writes tint times occlusion per vertex along +z', () => {
    const g = new THREE.CylinderGeometry(0.1, 0.1, 1, 6, 4).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    tintTuft(g, 1, '#66bf8d');
    const c = g.attributes.color;
    expect(c.count).toBe(g.attributes.position.count);
    for (let i = 0; i < c.count; i++) {
      const z = g.attributes.position.getZ(i);
      if (z > 0.01 && z < 0.99) continue;
      const want = new THREE.Color(tipTint(z, '#66bf8d')).multiplyScalar(tuftShade(z));
      expect(Math.abs(c.getX(i) - want.r) + Math.abs(c.getY(i) - want.g) + Math.abs(c.getZ(i) - want.b)).toBeLessThan(1e-3);
    }
  });
});

describe('wordmark texture', () => {
  const { w, h, data } = WORDMARK_MASK;
  const mask = decodeMask(data);
  it('decodes to one byte per pixel with ink in it', () => {
    expect(mask.length).toBe(w * h);
    expect(Math.max(...mask)).toBeGreaterThan(200);
    expect(mask.filter((v) => v > 128).length / mask.length).toBeGreaterThan(0.15);
  });
  it('keeps the margins clear', () => {
    for (let y = 0; y < h; y++) expect(mask[y * w]).toBe(0);
  });
  it('encodes gradient (R, G), coverage (B) and opaque alpha, bottom row first', () => {
    const tex = wordmarkTexels(mask, w, h);
    expect(tex.length).toBe(w * h * 4);
    for (let i = 3; i < tex.length; i += 4) expect(tex[i]).toBe(255);
    const gs = [], cov = [];
    for (let i = 0; i < w * h; i++) {
      gs.push(tex[i * 4]);
      cov.push(tex[i * 4 + 2]);
    }
    expect(Math.min(...gs)).toBe(1); // normalised: the strongest falling edge is -1
    expect(Math.max(...gs)).toBe(255);
    expect(gs[0]).toBe(128); // flat outside the letters
    expect(Math.max(...cov)).toBeGreaterThan(240);
  });
  it('writes the image bottom row first (t = 0 is the letters feet)', () => {
    const m = new Uint8Array(4 * 4);
    m.fill(255, 0, 4); // ink on the image's top row only
    const t = wordmarkTexels(m, 4, 4);
    expect(t[(3 * 4 + 1) * 4 + 2]).toBeGreaterThan(t[(0 * 4 + 1) * 4 + 2]);
    expect(t[(3 * 4 + 1) * 4 + 1]).toBeGreaterThan(128); // coverage rises toward t = 1 (up)
  });
  it('a gradient points into the letters (left edge of the S rises along s)', () => {
    const tex = wordmarkTexels(mask, w, h);
    const row = Math.floor(h / 2);
    let x = 0;
    while (mask[row * w + x] < 128) x++; // first inked pixel on the middle row (image rows top first)
    const o = ((h - 1 - row) * w + x - 1) * 4;
    expect(tex[o]).toBeGreaterThan(128);
  });
  it('wordmark rects keep the mask aspect', () => {
    const r = wordmarkRect(2.3, 2);
    expect(r.len / r.wid).toBeCloseTo(WORDMARK_ASPECT, 6);
    expect(r.x1).toBeCloseTo(r.wid / 2, 6);
  });
});

describe('shader patches', () => {
  it('compose by key, and a finish change keeps the detail patches', () => {
    const m = addPatch(plastic('#adaae1'), 'deboss', () => {});
    applyFinish(m, 'speckle');
    expect(m.customProgramCacheKey()).toBe('speckle|deboss'); // canonical: finish first
    clearFinishPatches(m);
    expect(m.customProgramCacheKey()).toBe('deboss');
    addPatch(m, 'deboss', () => {});
    expect(m.customProgramCacheKey()).toBe('deboss');
  });
  it('run every patch in order on compile', () => {
    const seen: string[] = [];
    const m = addPatch(addPatch(plastic('#fff'), 'a', () => seen.push('a')), 'b', () => seen.push('b'));
    m.onBeforeCompile({} as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(seen).toEqual(['a', 'b']);
  });
  it('hook lines exist in the physical shader', () => {
    const f = THREE.ShaderLib.physical.fragmentShader;
    for (const hook of ['#include <normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>', '#include <roughnessmap_fragment>'])
      expect(f).toContain(hook);
  });
});
