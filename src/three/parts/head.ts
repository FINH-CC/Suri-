import * as THREE from 'three';
import { filaments, headSeam, tintTuft } from '../details';
import { materialResponse, plastic, speckle } from '../materials';
import { cadMesh } from '../model';
import type { BuildCtx } from './context';

/** The head has no shapes, only colour: every style builds the plain head. */
export function buildHead(_style: string, hex: string, ctx: BuildCtx): THREE.Group {
  const { dim: DIM, tufts: T } = ctx;
  const g = new THREE.Group();
  // the renders' head is the same gloss as a Satin handle (clear-coated), keeps its plant-based flecks, and darkens
  // to a hairline along its lower lip where it meets the handle (Task 22)
  const mat = headSeam(speckle(plastic(hex, { roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.12 })));
  ctx.cad.head.forEach(({ geo }) => g.add(cadMesh(geo, mat)));
  // bristle tufts, laid out from the tuft pocket in the CAD
  const L = DIM.tuftLen;
  // a round bundle (radius 0.06 on a 0.145 pitch, so a clear shadowed gap between tufts) ending in a full, round, glossy dome (Task 22,
  // after the client's bristle reference)
  const R = 0.06, D = L - R; // the dome is a hemisphere of the tuft's radius
  const prof: [number, number][] = [[0, 0], [R, 0], [R, D]];
  for (let k = 1; k <= 8; k++) prof.push([R * Math.cos((k * Math.PI) / 16), D + R * Math.sin((k * Math.PI) / 16)]);
  const tg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24);
  tg.rotateX(Math.PI / 2); // grows along +z
  // off-white, darker toward the pad (baked occlusion between tufts), a hint of the head colour at the tip (Task 22)
  tintTuft(tg, L, hex);
  // r128 `sheen: Color(.35,.35,.35)` -> sheen .35 on a white sheenColor; r128 sheen used the material roughness
  // the active look's bristle response (parity: roughness .55, sheen .35, clear coat .15, no lift)
  const br = materialResponse().bristle;
  const fil = filaments(L, new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: br.roughness,
    metalness: 0,
    sheen: br.sheen,
    sheenColor: new THREE.Color(1, 1, 1),
    sheenRoughness: br.roughness,
    clearcoat: br.clearcoat,
    clearcoatRoughness: 0.5,
  }));
  if (br.lift > 0) fil.emissive.setScalar(br.lift);
  const tufts = new THREE.InstancedMesh(tg, fil, T.length);
  // trim profile: a gentle dome, longest at the centre of the pad
  const cx = T.reduce((a, t) => a + t[0], 0) / T.length;
  const cy0 = T.reduce((a, t) => a + t[1], 0) / T.length;
  const rmax = Math.max(...T.map(([x, y]) => Math.hypot((x - cx) / 0.55, (y - cy0) / 1)));
  const white = new THREE.Color(1, 1, 1); // the colour lives in the vertex colours; instanceColor stays for shared programs
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  T.forEach(([x, y], i) => {
    const d = Math.hypot((x - cx) / 0.55, (y - cy0) / 1) / rmax;
    const len = 1 - 0.16 * d * d;
    sc.set(1, 1, len);
    m.compose(new THREE.Vector3(x, y, DIM.padFrontZ - 0.08), q, sc);
    tufts.setMatrixAt(i, m);
    tufts.setColorAt(i, white);
  });
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  g.add(tufts);
  return g;
}
