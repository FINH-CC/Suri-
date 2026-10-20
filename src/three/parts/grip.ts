import * as THREE from 'three';
import { applyFinish, lum, mixHex, plastic, siliconeSheen } from '../materials';
import type { BuildCtx } from './context';

// Outer outline of the handle (convex hull of the CAD section, 96 angles). Using the hull
// instead of raw vertex samples avoids dips where the CAD has large flat triangles.
const HULL = [0.9,0.901,0.903,0.906,0.911,0.917,0.924,0.931,0.94,0.949,0.958,0.968,0.978,0.988,0.998,1.008,1.019,1.03,1.04,1.051,1.061,1.046,1.036,1.03,1.029,1.03,1.036,1.046,1.061,1.051,1.04,1.03,1.019,1.008,0.998,0.988,0.978,0.968,0.958,0.949,0.94,0.931,0.924,0.917,0.911,0.907,0.903,0.901,0.9,0.901,0.903,0.906,0.911,0.917,0.924,0.931,0.94,0.949,0.958,0.968,0.978,0.988,0.998,1.008,1.019,1.03,1.04,1.051,1.061,1.046,1.036,1.03,1.029,1.03,1.036,1.046,1.061,1.051,1.04,1.029,1.019,1.008,0.998,0.988,0.978,0.968,0.958,0.949,0.94,0.931,0.924,0.917,0.911,0.906,0.903,0.901];

/**
 * Sleeve generated from the handle's measured cross-section (20.6 x 18 mm oval),
 * covering the hand zone from just above the base to below the button.
 */
export function buildGrip(s: string, hex: string, ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group();
  const NT = HULL.length;
  const T = 0.13;
  const mat = applyFinish(
    plastic(hex, { side: THREE.DoubleSide, roughness: 0.55, clearcoat: 0.15, ...siliconeSheen(hex) }),
    ctx.finish,
  );
  const accent = plastic(mixHex(hex, lum(hex) > 0.45 ? '#252525' : '#ffffff', lum(hex) > 0.45 ? 0.25 : 0.5));
  const y0 = 1.6;
  const y1 = 8.7; // hand zone: above the tapered base, below the button
  const rTheta = (_y: number, a: number) => {
    const u = ((a + Math.PI) / (2 * Math.PI)) * NT;
    const k = Math.floor(u);
    const f = u - k;
    return HULL[((k % NT) + NT) % NT] * (1 - f) + HULL[(((k + 1) % NT) + NT) % NT] * f;
  };
  // every grip has a gentle ergonomic belly; ribs are chunky soft bands; rings are raised bands moulded into the sleeve
  const belly = (y: number) => 0.035 * Math.sin((Math.PI * (y - y0)) / (y1 - y0));
  const RINGS = [0, 1, 2, 3].map((j) => y0 + 0.75 + j * ((y1 - y0 - 1.5) / 3));
  const bump = (y: number) => {
    let b = belly(y);
    if (s === 'ribs') {
      const ph = ((y - y0 - 0.35) / 0.62) % 1;
      const v = 0.5 + 0.5 * Math.cos(ph * 2 * Math.PI);
      b += 0.075 * Math.pow(v, 1.6);
    }
    if (s === 'rings')
      RINGS.forEach((c) => {
        const d = Math.abs(y - c);
        b += 0.07 / (1 + Math.exp((d - 0.2) / 0.025));
      });
    return b;
  };
  // rows: soft rolled edge at each end
  const rows: [number, number][] = [];
  const ny = Math.round((y1 - y0) / 0.04);
  rows.push([y0 - 0.02, 0]);
  for (let j = 0; j <= ny; j++) {
    const y = y0 + ((y1 - y0) * j) / ny;
    const e = Math.min(1, (y - y0) / 0.12, (y1 - y) / 0.12);
    rows.push([y, T * Math.sqrt(Math.max(e, 0)) + bump(y) * e]);
  }
  rows.push([y1 + 0.02, 0]);
  const SEG = 96;
  const pos: number[] = [];
  const idx: number[] = [];
  rows.forEach(([y, t]) => {
    for (let k = 0; k <= SEG; k++) {
      const a = -Math.PI + (k / SEG) * Math.PI * 2;
      const r = rTheta(y, a) + t + 0.012;
      pos.push(r * Math.sin(a), y, r * Math.cos(a));
    }
  });
  for (let j = 0; j < rows.length - 1; j++)
    for (let k = 0; k < SEG; k++) {
      const a = j * (SEG + 1) + k;
      const b2 = a + SEG + 1;
      idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat));
  if (s === 'dots') {
    // soft domed nubs, half sunk into the sleeve, a shade deeper than the grip
    const nub = plastic(mixHex(hex, lum(hex) > 0.45 ? '#252525' : '#ffffff', 0.1), { roughness: 0.55, ...siliconeSheen(hex) });
    const rowsN = 10;
    const perRow = 10;
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 20, 12), nub, rowsN * perRow);
    const mm = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Z = new THREE.Vector3(0, 0, 1);
    const sc = new THREE.Vector3(1, 1, 0.8);
    let i = 0;
    for (let row = 0; row < rowsN; row++)
      for (let k = 0; k < perRow; k++) {
        const a = -Math.PI + ((k + (row % 2) * 0.5) * Math.PI * 2) / perRow;
        const y = y0 + 0.42 + row * ((y1 - y0 - 0.84) / (rowsN - 1));
        const r = rTheta(y, a) + T + belly(y) + 0.01;
        const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        q.setFromUnitVectors(Z, n);
        mm.compose(new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a)), q, sc);
        im.setMatrixAt(i++, mm);
      }
    // keep an instanceColor like the tufts so shared shader programs always find it
    const wc = new THREE.Color(1, 1, 1);
    for (let j = 0; j < im.count; j++) im.setColorAt(j, wc);
    g.add(im);
  }
  if (s === 'rings')
    RINGS.forEach((y) => {
      // a fine accent line set into each raised band
      const tg = new THREE.TorusGeometry(1, 0.024, 10, 128);
      tg.rotateX(Math.PI / 2);
      const t = new THREE.Mesh(tg, accent);
      const o = T + belly(y) + 0.07 + 0.004;
      t.scale.set(rTheta(y, Math.PI / 2) + o, 1, rTheta(y, 0) + o);
      t.position.y = y;
      g.add(t);
    });
  return g;
}
