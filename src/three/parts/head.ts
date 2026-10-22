import * as THREE from 'three';
import { lin, materialResponse, mixHex, plastic, speckle } from '../materials';
import { cadMesh } from '../model';
import type { BuildCtx } from './context';

/** The head has no shapes, only colour: every style builds the plain head. */
export function buildHead(_style: string, hex: string, ctx: BuildCtx): THREE.Group {
  const { dim: DIM, tufts: T } = ctx;
  const g = new THREE.Group();
  const mat = speckle(plastic(hex, { roughness: 0.72 }));
  ctx.cad.head.forEach(({ geo }) => g.add(cadMesh(geo, mat)));
  // bristle tufts, laid out from the tuft pocket in the CAD
  // Each tuft: a round bundle that flares slightly toward the tip and ends in a soft trimmed dome.
  const L = DIM.tuftLen;
  const prof = [[0, 0], [0.06, 0], [0.062, L * 0.55], [0.068, L * 0.9], [0.066, L * 0.95], [0.056, L * 0.985], [0.036, L * 1.0], [0, L * 1.008]];
  const tg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  tg.rotateX(Math.PI / 2); // grows along +z
  // r128 `sheen: Color(.35,.35,.35)` -> sheen .35 on a white sheenColor; r128 sheen used the material roughness
  // the active look's bristle response (parity: roughness .55, sheen .35, clear coat .15, no lift)
  const br = materialResponse().bristle;
  const fil = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: br.roughness,
    metalness: 0,
    sheen: br.sheen,
    sheenColor: new THREE.Color(1, 1, 1),
    sheenRoughness: br.roughness,
    clearcoat: br.clearcoat,
    clearcoatRoughness: 0.5,
  });
  if (br.lift > 0) fil.emissive.setScalar(br.lift);
  const tufts = new THREE.InstancedMesh(tg, fil, T.length);
  // trim profile: a gentle dome, longest at the centre of the pad; the outer ring is tinted from the head colour
  const cx = T.reduce((a, t) => a + t[0], 0) / T.length;
  const cy0 = T.reduce((a, t) => a + t[1], 0) / T.length;
  const rmax = Math.max(...T.map(([x, y]) => Math.hypot((x - cx) / 0.55, (y - cy0) / 1)));
  const white = lin('#f6f5f1');
  const tint = lin(mixHex(hex, '#ffffff', 0.45));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  T.forEach(([x, y], i) => {
    const near = T.filter(([u, v]) => Math.hypot(u - x, v - y) < 0.17).length - 1;
    const edge = near < 6;
    const d = Math.hypot((x - cx) / 0.55, (y - cy0) / 1) / rmax;
    const len = 1 - 0.16 * d * d;
    sc.set(1, 1, len);
    m.compose(new THREE.Vector3(x, y, DIM.padFrontZ - 0.08), q, sc);
    tufts.setMatrixAt(i, m);
    tufts.setColorAt(i, edge ? tint : white);
  });
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  g.add(tufts);
  return g;
}
