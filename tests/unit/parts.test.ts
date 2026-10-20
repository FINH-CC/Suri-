import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadCadFromGlb } from '../../scripts/lib/load-cad-node';
import { dimFor } from '../../src/data/parts';
import type { BuildCtx } from '../../src/three/parts/context';
import { buildHandle } from '../../src/three/parts/handle';
import { buildButton } from '../../src/three/parts/button';
import { buildHead } from '../../src/three/parts/head';
import { buildGrip } from '../../src/three/parts/grip';
import { buildMount } from '../../src/three/parts/mount';
import { buildPart, dispose } from '../../src/three/parts/index';
import { buildCap } from '../../src/three/parts/cap';
import type { CapCore } from '../../src/three/capfit';
import { readFileSync } from 'node:fs';

let ctx: BuildCtx;

beforeAll(async () => {
  const { cad, meta } = await loadCadFromGlb('public/model/brush.glb', 'public/model/brush-meta.json');
  ctx = { cad, dim: dimFor(meta.tuftFaceZ), tufts: meta.tufts, finish: 'matte', headStyle: 'plain', uploads: {} };
});

const meshes = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh);
  });
  return out;
};
const instanced = (o: THREE.Object3D) => meshes(o).filter((m) => (m as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[];
const spheres = (o: THREE.Object3D) => meshes(o).filter((m) => m.geometry instanceof THREE.SphereGeometry);

describe('part builders', () => {
  it('handle: every non-button handle CAD part, shared geometry kept', () => {
    const g = buildHandle('core', '#7fae7f', ctx);
    expect(meshes(g).length).toBe(ctx.cad.handle.filter((c) => c.role !== 'button').length);
    expect(meshes(g).every((m) => m.userData.keepGeo)).toBe(true);
  });
  it('button: only the button CAD part', () => {
    expect(meshes(buildButton('core', '#ff0000', ctx)).length).toBe(ctx.cad.handle.filter((c) => c.role === 'button').length);
  });
  it('head: one tuft InstancedMesh with one instance per tuft', () => {
    const im = instanced(buildHead('ears', '#ffffff', ctx));
    expect(im.length).toBe(1);
    expect(im[0].count).toBe(59);
    expect(im[0].count).toBe(ctx.tufts.length);
  });
  it('head ears: adds 4 spheres (two ink dots, two ear blobs) over plain', () => {
    const plain = buildHead('plain', '#ffffff', ctx);
    const ears = buildHead('ears', '#ffffff', ctx);
    expect(meshes(ears).length - meshes(plain).length).toBe(4);
    expect(spheres(ears).length - spheres(plain).length).toBe(4);
  });
  it('head spots: adds 5 spots', () => {
    expect(meshes(buildHead('spots', '#ffffff', ctx)).length - meshes(buildHead('plain', '#ffffff', ctx)).length).toBe(5);
  });
  it('grip dots: InstancedMesh with 100 nubs', () => {
    const im = instanced(buildGrip('dots', '#e0b0c0', ctx));
    expect(im.length).toBe(1);
    expect(im[0].count).toBe(100);
  });
  it('grip rings: sleeve + 4 accent rings', () => {
    expect(meshes(buildGrip('rings', '#e0b0c0', ctx)).length).toBe(5);
  });
  it('mount arch: plate + 2 stripes', () => {
    expect(meshes(buildMount('arch', '#88aadd', ctx)).length).toBe(3);
  });
  it('mount original: every mount CAD part', () => {
    expect(meshes(buildMount('original', '#88aadd', ctx)).length).toBe(ctx.cad.mount.length);
  });
  it('buildPart: upload swaps in the uploaded geometry, kept on dispose', () => {
    const geo = new THREE.BoxGeometry();
    const g = buildPart('mount', 'upload', '#ffffff', { ...ctx, uploads: { mount: geo } });
    const [m] = meshes(g);
    expect(m.geometry).toBe(geo);
    expect(m.userData.keepGeo).toBe(true);
    let disposed = false;
    geo.addEventListener('dispose', () => (disposed = true));
    dispose(g);
    expect(disposed).toBe(false);
  });
  it('dispose: frees owned geometry, never shared CAD geometry', () => {
    const cadGeo = ctx.cad.mount[0].geo;
    let cadDisposed = false;
    const onDispose = () => (cadDisposed = true);
    cadGeo.addEventListener('dispose', onDispose);
    const g = buildPart('mount', 'original', '#88aadd', ctx);
    const arch = buildPart('mount', 'arch', '#88aadd', ctx);
    let owned = false;
    meshes(arch)[0].geometry.addEventListener('dispose', () => (owned = true));
    dispose(g);
    dispose(arch);
    cadGeo.removeEventListener('dispose', onDispose);
    expect(cadDisposed).toBe(false);
    expect(owned).toBe(true);
  });
});

/** Dot of each vertex normal with the outward radial direction, for ~50 vertices in the mid-height band. */
function radialDots(m: THREE.Mesh): number[] {
  const geo = m.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const lo = bb.min.y + 0.4 * (bb.max.y - bb.min.y), hi = bb.min.y + 0.6 * (bb.max.y - bb.min.y);
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
  const mid: number[] = [];
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) >= lo && pos.getY(i) <= hi) mid.push(i);
  const step = Math.max(1, Math.floor(mid.length / 50));
  const out: number[] = [];
  for (let k = 0; k < mid.length; k += step) {
    const i = mid[k];
    const r = new THREE.Vector3(pos.getX(i) - cx, 0, pos.getZ(i) - cz).normalize();
    out.push(new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)).dot(r));
  }
  return out;
}

describe('surface winding (sticker decals rely on outward normals)', () => {
  it('grip sleeve normals point outward', () => {
    const sleeve = meshes(buildGrip('smooth', '#e0b0c0', ctx)).find((m) => !(m as THREE.InstancedMesh).isInstancedMesh)!;
    const d = radialDots(sleeve);
    expect(d.length).toBeGreaterThanOrEqual(40);
    for (const v of d) expect(v).toBeGreaterThan(0);
  });
  it('cap outer sheet points outward, inner cavity sheet points inward', () => {
    const fit = JSON.parse(readFileSync('public/model/cap-fit.json', 'utf8')) as Record<string, CapCore>;
    const cap = buildCap('bubble', '#ffffff', { ...ctx, capCore: fit.plain });
    const outer = radialDots(cap.children[0] as THREE.Mesh), inner = radialDots(cap.children[1] as THREE.Mesh);
    expect(outer.length).toBeGreaterThanOrEqual(20);
    expect(inner.length).toBeGreaterThanOrEqual(20);
    for (const v of outer) expect(v).toBeGreaterThan(0);
    for (const v of inner) expect(v).toBeLessThan(0);
  });
});
