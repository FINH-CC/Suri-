import * as THREE from 'three';
import { applyFinish, GREY, lum, mixHex, plastic } from '../materials';
import { cadMesh } from '../model';
import type { BuildCtx } from './context';

export function buildMount(s: string, hex: string, ctx: BuildCtx): THREE.Group {
  const DIM = ctx.dim;
  const g = new THREE.Group();
  const mat = applyFinish(plastic(hex, { roughness: 0.5, clearcoat: 0.25 }), ctx.finish);
  if (s === 'original') {
    ctx.cad.mount.forEach(({ role, geo }) =>
      g.add(
        cadMesh(
          geo,
          role === 'body'
            ? mat
            : role === 'insert'
              ? plastic(mixHex(hex, lum(hex) > 0.5 ? '#252525' : '#ffffff', 0.12), { roughness: 0.6 })
              : GREY(),
        ),
      ),
    );
    return g;
  }
  // themed shells built on the real mount's footprint (28 x 62 mm)
  const [hx, hy] = DIM.mountHalf;
  const cy = DIM.mountCY;
  const sh = new THREE.Shape();
  if (s === 'cloud') {
    const b = cy - hy;
    const t = cy + hy - 0.7;
    const r = hx / 2.1;
    sh.moveTo(-hx, b + 0.3);
    sh.quadraticCurveTo(-hx, b, -hx + 0.3, b);
    sh.lineTo(hx - 0.3, b);
    sh.quadraticCurveTo(hx, b, hx, b + 0.3);
    sh.lineTo(hx, t);
    sh.absarc(hx - r, t, r, 0, Math.PI, false);
    sh.absarc(0, t + 0.15, r, 0, Math.PI, false);
    sh.absarc(-hx + r, t, r, 0, Math.PI, false);
    sh.lineTo(-hx, b + 0.3);
  } else {
    const b = cy - hy;
    const t = cy + hy - hx;
    sh.moveTo(-hx, b + 0.3);
    sh.quadraticCurveTo(-hx, b, -hx + 0.3, b);
    sh.lineTo(hx - 0.3, b);
    sh.quadraticCurveTo(hx, b, hx, b + 0.3);
    sh.lineTo(hx, t);
    sh.absarc(0, t, hx, 0, Math.PI, false);
    sh.lineTo(-hx, b + 0.3);
  }
  const depth = 0.55;
  const plate = new THREE.Mesh(
    new THREE.ExtrudeGeometry(sh, { depth: depth - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, curveSegments: 40 }),
    mat,
  );
  plate.position.z = DIM.mountFrontZ - depth + 0.08;
  g.add(plate);
  if (s === 'arch') {
    const stripe = plastic(mixHex(hex, '#ffffff', lum(hex) > 0.5 ? 0.6 : 0.35));
    const t = cy + hy - hx;
    [hx * 0.72, hx * 0.45].forEach((r) => {
      const a = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 12, 48, Math.PI), stripe);
      a.position.set(0, t, DIM.mountFrontZ + 0.02);
      g.add(a);
    });
  }
  return g;
}
