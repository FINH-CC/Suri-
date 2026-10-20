import * as THREE from 'three';
import type { PartId } from '../../data/parts';
import { plastic } from '../materials';
import { buildButton } from './button';
import { buildCap } from './cap';
import { buildCharm } from './charm';
import type { BuildCtx } from './context';
import { buildGrip } from './grip';
import { buildHandle } from './handle';
import { buildHead } from './head';
import { buildMount } from './mount';

export type { BuildCtx } from './context';

const BUILDERS: Record<PartId, (style: string, hex: string, ctx: BuildCtx) => THREE.Group> = {
  cap: (style, hex, ctx) => {
    const { capCore } = ctx;
    if (!capCore) throw new Error('buildPart(cap): ctx.capCore is required');
    return buildCap(style, hex, { ...ctx, capCore });
  },
  head: buildHead,
  grip: buildGrip,
  handle: buildHandle,
  button: buildButton,
  charm: buildCharm,
  mount: buildMount,
};

export function buildPart(id: PartId, style: string, hex: string, ctx: BuildCtx): THREE.Group {
  const up = ctx.uploads[id];
  if (style === 'upload' && up) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(up, plastic(hex, { side: THREE.DoubleSide }));
    m.userData.keepGeo = true;
    g.add(m);
    return g;
  }
  return BUILDERS[id](style, hex, ctx);
}

/** Free a built part. Shared geometry (mesh `keepGeo`) and shared textures (material `keepMap`) are left alone. */
export function dispose(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !mesh.userData.keepGeo) mesh.geometry.dispose();
    if (mesh.material)
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
        const map = (m as THREE.MeshStandardMaterial).map;
        if (map && !m.userData.keepMap) map.dispose();
        m.dispose();
      });
  });
}
