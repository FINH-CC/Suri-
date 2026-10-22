import * as THREE from 'three';
import { handleDetails, pinholeLens } from '../details';
import { applyFinish, GREY, METAL, plastic } from '../materials';
import { cadMesh } from '../model';
import type { BuildCtx } from './context';

export function buildHandle(_style: string, hex: string, ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group();
  // the indicator dot above the button and the handle's side of the head seam (Task 22)
  const body = handleDetails(applyFinish(plastic(hex, { roughness: 0.6, clearcoat: 0 }), ctx.finish));
  ctx.cad.handle.forEach(({ role, geo }) => {
    if (role !== 'button') g.add(cadMesh(geo, role === 'body' ? body : role === 'seal' ? GREY() : METAL()));
  });
  g.add(pinholeLens());
  return g;
}
