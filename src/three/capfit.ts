/* Cap fit (legacy/index.html 779–835).
   Measures the real head (CAD + bristle tufts + the chosen head's ears/face) in horizontal slices around the
   bristle axis, giving a radius for every angle and height. Every cap shape is built OUTWARD from this,
   so all of them clear the bristles by the same margin and the opening hugs the neck.
   Unlike legacy, nothing is cached here and the caller builds (and disposes) the head: the scene reads the
   precomputed cores from src/assets/model/cap-fit.json and caches the live core of an uploaded head itself. */
import * as THREE from 'three';

export type CapEnvelope = { nt: number; cz: number; rows: { y: number; r: Float32Array }[] };
export type CapCore = { a: number; b: number; cz: number; y0: number; top: number; ceil: number };

/** Legacy `capEnvelope` (784–818), taking an already-built head group. */
export function capEnvelope(h: THREE.Group): CapEnvelope {
  h.updateMatrixWorld(true);
  const NT = 72, NY = 26, CZ = 0.37, Y0 = 19.85, CLEAR = 0.06; // Y0: opening sits where the neck widens into the bristle head
  const pts: number[] = [];
  const v = new THREE.Vector3(), m = new THREE.Matrix4(), im = new THREE.Matrix4();
  let ymax = -1e9;
  h.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const push = (mat: THREE.Matrix4) => {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mat);
        if (v.y >= Y0 - 0.1) {
          pts.push(v.x, v.y, v.z);
          if (v.y > ymax) ymax = v.y;
        }
      }
    };
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, im);
        m.multiplyMatrices(inst.matrixWorld, im);
        push(m);
      }
    } else push(mesh.matrixWorld);
  });
  const Y1 = ymax;
  const raw = Array.from({ length: NY }, () => new Float32Array(NT));
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], dz = pts[i + 2] - CZ;
    const j = Math.min(NY - 1, Math.max(0, Math.round(((y - Y0) / (Y1 - Y0)) * (NY - 1))));
    const k = ((Math.round(((Math.atan2(x, dz) + Math.PI) / (2 * Math.PI)) * NT) % NT) + NT) % NT;
    const r = Math.hypot(x, dz);
    if (r > raw[j][k]) raw[j][k] = r;
  }
  // fill gaps and round out: angular dilation -> fill empties -> vertical dilation -> blur (never below the dilated fit)
  const dil = raw.map((row) => {
    const o = new Float32Array(NT);
    for (let k = 0; k < NT; k++) {
      let mx = 0;
      for (let d = -2; d <= 2; d++) mx = Math.max(mx, row[(k + d + NT) % NT]);
      o[k] = mx;
    }
    return o;
  });
  dil.forEach((row) => {
    const nz = [...row].map((r, k) => [r, k]).filter((p) => p[0] > 0);
    if (!nz.length) return;
    for (let k = 0; k < NT; k++)
      if (row[k] === 0) {
        let best = nz[0];
        for (const p of nz) {
          const d = Math.min(Math.abs(p[1] - k), NT - Math.abs(p[1] - k));
          const bd = Math.min(Math.abs(best[1] - k), NT - Math.abs(best[1] - k));
          if (d < bd) best = p;
        }
        row[k] = best[0];
      }
  });
  for (let j = 0; j < NY; j++) if (Math.max(...dil[j]) === 0) dil[j] = Float32Array.from(dil[j > 0 ? j - 1 : j + 1]);
  const vert = dil.map((row, j) => row.map((r, k) => Math.max(r, (dil[j - 1] || row)[k], (dil[j + 1] || row)[k])));
  const rows = vert.map((row, j) => {
    const o = new Float32Array(NT);
    for (let k = 0; k < NT; k++) {
      let s = 0;
      for (let d = -3; d <= 3; d++) s += row[(k + d + NT) % NT];
      o[k] = Math.max(s / 7, row[k]) + CLEAR;
    }
    return { y: Y0 + ((Y1 - Y0) * j) / (NY - 1), r: o };
  });
  // No undercuts: at every angle the cavity is at least as wide as anything above it, so the cap slides straight
  // down over the head (widest at the opening, narrowing only towards the closed top).
  for (let j = NY - 2; j >= 0; j--) for (let k = 0; k < NT; k++) rows[j].r[k] = Math.max(rows[j].r[k], rows[j + 1].r[k]);
  return { nt: NT, cz: CZ, rows };
}

/* Cap core: a simple, clean cavity sized from the head envelope.
   Straight-walled rounded oval (squircle, n=3) from the opening up, with a short rounded ceiling, so the cap
   slides straight on and off. Every outer shape is designed independently and is guaranteed to contain this core. */
export const CAP_WALL = 0.12;
export const sq = (th: number, a: number, b: number, n: number): number =>
  1 / Math.pow(Math.pow(Math.abs(Math.sin(th)) / a, n) + Math.pow(Math.abs(Math.cos(th)) / b, n), 1 / n);

/** Legacy `capCore` (820–829). */
export function capCore(env: CapEnvelope): CapCore {
  const NT = env.nt, ang = (k: number) => -Math.PI + (k * 2 * Math.PI) / NT;
  let a0 = 0, b0 = 0;
  env.rows.forEach(({ r }) => {
    for (let k = 0; k < NT; k++) {
      const th = ang(k);
      if (Math.abs(Math.sin(th)) > 0.97) a0 = Math.max(a0, r[k]);
      if (Math.abs(Math.cos(th)) > 0.97) b0 = Math.max(b0, r[k]);
    }
  });
  let s = 1;
  env.rows.forEach(({ r }) => {
    for (let k = 0; k < NT; k++) s = Math.max(s, r[k] / sq(ang(k), a0, b0, 3));
  });
  return { a: a0 * s, b: b0 * s, cz: env.cz, y0: env.rows[0].y, top: env.rows[env.rows.length - 1].y, ceil: 0.18 };
}

/** Outer of the core (cavity + wall), used as a safety minimum for every shape (legacy 831–834). */
export function coreOuter(th: number, y: number, C: CapCore): number {
  const r = sq(th, C.a + CAP_WALL, C.b + CAP_WALL, 3), h = C.ceil + CAP_WALL;
  if (y <= C.top) return r;
  const u = (y - C.top) / h;
  return u >= 1 ? -1e3 : r * Math.sqrt(1 - u * u);
}

/** Smooth max (legacy 835). */
export const smax = (vals: number[], k: number): number => {
  const m = Math.max(...vals);
  if (m < -100) return m;
  let s = 0;
  for (const v of vals) s += Math.exp((v - m) / k);
  return m + k * Math.log(s);
};

/** Round every field to 6 decimals: the form written to cap-fit.json. */
export const roundCore = (c: CapCore): CapCore => {
  const r = (x: number) => Math.round(x * 1e6) / 1e6;
  return { a: r(c.a), b: r(c.b), cz: r(c.cz), y0: r(c.y0), top: r(c.top), ceil: r(c.ceil) };
};
