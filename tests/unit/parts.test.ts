import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadCadFromGlb } from '../../scripts/lib/load-cad-node';
import { dimFor } from '../../src/data/parts';
import type { BuildCtx } from '../../src/three/parts/context';
import { buildHandle } from '../../src/three/parts/handle';
import { buildButton } from '../../src/three/parts/button';
import { buildHead } from '../../src/three/parts/head';
import { buildGrip } from '../../src/three/parts/grip';
import { buildCharm } from '../../src/three/parts/charm';
import { buildMount } from '../../src/three/parts/mount';
import { buildPart, dispose } from '../../src/three/parts/index';

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
  it('charm none: empty group', () => {
    expect(buildCharm('none', '#ffd700', ctx).children.length).toBe(0);
  });
  it('charm star: the charm body hangs clear of the handle side', () => {
    const g = buildCharm('star', '#ffd700', ctx);
    g.updateMatrixWorld(true);
    const body = g.children[0]; // the character group; the chain and arm follow it
    const bb = new THREE.Box3().setFromObject(body);
    expect(bb.min.x).toBeGreaterThan(ctx.dim.handleHalfX);
  });
  it('mount arch: plate + 2 stripes', () => {
    expect(meshes(buildMount('arch', '#88aadd', ctx)).length).toBe(3);
  });
  it('mount original: every mount CAD part', () => {
    expect(meshes(buildMount('original', '#88aadd', ctx)).length).toBe(ctx.cad.mount.length);
  });
  it('buildPart: upload swaps in the uploaded geometry, kept on dispose', () => {
    const geo = new THREE.BoxGeometry();
    const g = buildPart('charm', 'upload', '#ffffff', { ...ctx, uploads: { charm: geo } });
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
