import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadCadFromGlb } from '../../scripts/lib/load-cad-node';
import { dimFor } from '../../src/data/parts';
import { capCore, capEnvelope, roundCore, type CapCore } from '../../src/three/capfit';
import { buildCap } from '../../src/three/parts/cap';
import type { BuildCtx } from '../../src/three/parts/context';
import { buildHead } from '../../src/three/parts/head';
import { dispose } from '../../src/three/parts/index';

let ctx: BuildCtx;
let core: CapCore;
const committed = JSON.parse(readFileSync('src/assets/model/cap-fit.json', 'utf8')) as Record<string, CapCore>;

beforeAll(async () => {
  const { cad, meta } = await loadCadFromGlb('src/assets/model/brush.glb', 'src/assets/model/brush-meta.json');
  ctx = { cad, dim: dimFor(meta.tuftFaceZ), tufts: meta.tufts, finish: 'matte', headStyle: 'plain', uploads: {} };
  const head = buildHead('plain', '#ffffff', ctx);
  core = capCore(capEnvelope(head));
  dispose(head);
});

const meshes = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh);
  });
  return out;
};

describe('cap fit', () => {
  it('plain head core is a sane cavity', () => {
    expect(core.top).toBeGreaterThan(core.y0);
    expect(core.a).toBeGreaterThan(0.4);
    expect(core.a).toBeLessThan(1.5);
    expect(core.b).toBeGreaterThan(0.4);
    expect(core.b).toBeLessThan(1.5);
    expect(core.ceil).toBe(0.18);
  });
  it('live computation matches committed cap-fit.json within 1e-6', () => {
    const live = roundCore(core);
    const ref = committed.plain;
    expect(Object.keys(live).sort()).toEqual(Object.keys(ref).sort());
    for (const k of Object.keys(ref) as (keyof CapCore)[]) expect(Math.abs(live[k] - ref[k])).toBeLessThan(1e-6);
  });
  it('cap-fit.json covers the plain head only (the head has no shapes)', () => {
    expect(Object.keys(committed)).toEqual(['plain']);
  });
});

describe('cap builder', () => {
  const c = () => ({ ...ctx, capCore: core });
  it('bubble: outer, inner, rim only', () => {
    const g = buildCap('bubble', '#ffffff', c());
    expect(meshes(g).length).toBe(3);
    dispose(g);
  });
  it('cloud: a CAP_STYLES shape, no accessory', () => {
    const g = buildCap('cloud', '#a0c4ff', c());
    expect(meshes(g).length).toBe(3);
    dispose(g);
  });
  it('hat: bubble capsule plus brim, lip, band, crown, knob', () => {
    const g = buildCap('hat', '#ff8800', c());
    expect(meshes(g).length).toBe(8);
    dispose(g);
  });
  it('bunny: adds 4 blobs', () => {
    const g = buildCap('bunny', '#ffffff', c());
    expect(meshes(g).length).toBe(7);
    dispose(g);
  });
  it('core meshes: outer front side, inner back side, rim double side', () => {
    const [outer, inner, rim] = meshes(buildCap('bubble', '#ffffff', c()));
    expect((outer.material as THREE.Material).side).toBe(THREE.FrontSide);
    expect((inner.material as THREE.Material).side).toBe(THREE.BackSide);
    expect((rim.material as THREE.Material).side).toBe(THREE.DoubleSide);
  });
});
