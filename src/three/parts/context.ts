import * as THREE from 'three';
import type { dimFor, FinishId, PartId } from '../../data/parts';
import type { CadGeo } from '../model';

/** Everything the legacy builders read from module scope (cadParts, DIM, CAD.tufts, state, uploads). */
export type BuildCtx = {
  cad: CadGeo;
  dim: ReturnType<typeof dimFor>;
  tufts: number[][];
  finish: FinishId;
  headStyle: string;
  uploads: Partial<Record<PartId, THREE.BufferGeometry>>;
};

/** Legacy `sphere(r, mat, pos, scale)` (legacy/index.html line 715). */
export function sphere(
  r: number,
  mat: THREE.Material,
  pos: [number, number, number],
  scale?: [number, number, number],
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat);
  m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  return m;
}
