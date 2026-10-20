import * as THREE from 'three';
import { plastic } from '../materials';
import { cadMesh } from '../model';
import type { BuildCtx } from './context';

/** Its own colour; a soft gloss so it reads as the one touch point on a matte handle. */
export function buildButton(_style: string, hex: string, ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group();
  const mat = plastic(hex, { roughness: 0.32, clearcoat: 0.45, clearcoatRoughness: 0.28 });
  ctx.cad.handle.forEach(({ role, geo }) => {
    if (role === 'button') g.add(cadMesh(geo, mat));
  });
  return g;
}
