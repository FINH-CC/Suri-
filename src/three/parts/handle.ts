import * as THREE from 'three';
import { applyFinish, GREY, METAL, plastic } from '../materials';
import { cadMesh } from '../model';
import type { BuildCtx } from './context';

export function buildHandle(_style: string, hex: string, ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group();
  const body = applyFinish(plastic(hex, { roughness: 0.6, clearcoat: 0 }), ctx.finish);
  ctx.cad.handle.forEach(({ role, geo }) => {
    if (role !== 'button') g.add(cadMesh(geo, role === 'body' ? body : role === 'seal' ? GREY() : METAL()));
  });
  return g;
}
