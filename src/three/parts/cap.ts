import * as THREE from 'three';
import { CAP_WALL, coreOuter, smax, sq, type CapCore } from '../capfit';
import { applyFinish, lum, mixHex, plastic, siliconeSheen } from '../materials';
import type { BuildCtx } from './context';

type CapStyle = {
  height: (C: CapCore) => number;
  r?: (th: number, y: number, C: CapCore) => number;
  points?: (t: number, NT: number, C: CapCore, yAbs: number) => Float32Array;
};

// Outer shapes: radial r(theta,y) (theta 0 = bristle side, +-PI = back) or explicit points for the leaf.
// Character accessories for the Pebble capsule, after the Season 01 sketches:
// sprout = three soft leaves, bear = round ears with darker inners, hat = brimmed hat with a coloured band, bunny = two long ears.
function addCapAccessory(g: THREE.Group, s: string, hex: string, C: CapCore, CZ: number): void {
  const yS = C.top + 0.1, top = yS + 0.95, hw = (C.a + CAP_WALL) * 1.08, hd = (C.b + CAP_WALL) * 1.08;
  const soft = (o: string) => plastic(o, { roughness: 0.58, clearcoat: 0.12, clearcoatRoughness: 0.55, ...siliconeSheen(o) });
  const light = lum(hex) > 0.8; // on a near-white cap a lighter tint would vanish, so go a soft warm grey instead
  const tint = soft(light ? mixHex(hex, '#b9b2a6', 0.45) : mixHex(hex, '#ffffff', 0.5)),
    deep = soft(mixHex(hex, '#7a3a2a', light ? 0.3 : 0.35));
  const blob = (r: number, m: THREE.Material, pos: [number, number, number], sc: [number, number, number], rz = 0) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), m);
    o.position.set(pos[0], pos[1], CZ + pos[2]);
    o.scale.set(...sc);
    o.rotation.z = rz;
    g.add(o);
    return o;
  };
  if (s === 'sprout') {
    // a tall centre leaf and two leaning side leaves, tucked into the dome
    blob(hw * 0.36, tint, [0, top + hw * 0.5, 0], [1, 1.45, 0.42]);
    blob(hw * 0.36, tint, [-hw * 0.72, top - hw * 0.05, 0], [1, 1.45, 0.42], 0.7);
    blob(hw * 0.36, tint, [hw * 0.72, top - hw * 0.05, 0], [1, 1.45, 0.42], -0.7);
  }
  if (s === 'bear') {
    // round ears set into the shoulders, darker inner ears on the front
    [-1, 1].forEach((d) => {
      blob(hw * 0.44, soft(hex), [d * hw * 0.86, top - hw * 0.5, 0], [1, 1, 0.55]);
      blob(hw * 0.24, deep, [d * hw * 0.92, top - hw * 0.52, hd * 0.4], [1, 1, 0.32]);
    });
  }
  if (s === 'bunny') {
    // soft rounded ears, a little shorter than the cap is wide, leaning out, rooted in the dome
    [-1, 1].forEach((d) => {
      blob(hw * 0.34, tint, [d * hw * 0.44, top + hw * 0.42, 0], [1, 1.95, 0.55], -d * 0.3);
      blob(hw * 0.17, deep, [d * hw * 0.47, top + hw * 0.5, hd * 0.2], [1, 1.75, 0.3], -d * 0.3);
    });
  }
  if (s === 'hat') {
    // brimmed hat sitting on the capsule: neutral felt, band in the cap colour, little knob on top
    const felt = soft('#d7d3cc'), band = soft(mixHex(hex, '#252525', 0.12)), y0 = top - 0.5;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(hw * 1.75, hw * 1.75, 0.07, 64), felt);
    brim.position.set(0, y0, CZ);
    brim.scale.z = hd / hw;
    g.add(brim);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(hw * 1.75, 0.05, 12, 96), felt);
    lip.rotation.x = Math.PI / 2;
    lip.position.set(0, y0, CZ);
    lip.scale.y = hd / hw;
    g.add(lip);
    const bnd = new THREE.Mesh(new THREE.CylinderGeometry(hw * 1.05, hw * 1.07, 0.26, 64), band);
    bnd.position.set(0, y0 + 0.16, CZ);
    bnd.scale.z = hd / hw;
    g.add(bnd);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(hw * 1.05, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), felt);
    crown.position.set(0, y0 + 0.29, CZ);
    crown.scale.set(1, 0.95, hd / hw);
    g.add(crown);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 14), felt);
    knob.scale.set(1.5, 0.7, 1);
    knob.position.set(0, y0 + 0.29 + hw * 1.0 + 0.03, CZ);
    g.add(knob);
  }
}

// total cap height: cavity + its rounded ceiling + wall, plus a style-specific crown (legacy 846; unused by the styles below)
export const capH = (C: CapCore, crown: number): number => C.top + C.ceil + CAP_WALL - C.y0 + crown;

export const CAP_STYLES: Record<string, CapStyle> = {
  // Pebble: a soft capsule. Sides swell gently and flow tangentially into a full round dome (no crease possible).
  bubble: {
    height: (C) => C.top + 0.1 - C.y0 + 0.95,
    r: (th, y, C) => {
      const yS = C.top + 0.1, A = (C.a + CAP_WALL) * 1.08, B = (C.b + CAP_WALL) * 1.08, base = sq(th, A, B, 2.15);
      if (y <= yS) {
        const t = (y - C.y0) / (yS - C.y0);
        return base * (1 + 0.05 * Math.pow(Math.sin(Math.PI * t), 2));
      }
      const u = (y - yS) / 0.95;
      return base * Math.pow(Math.max(0, 1 - Math.pow(u, 2.3)), 1 / 2.3);
    },
  },
  // Blob: a top-heavy gumdrop. Narrow at the collar, swelling into a wide squishy bulb with soft lobes and a
  // slightly flattened top. Every join is tangent (smoothstep sides meet a superellipse dome), so nothing can crease.
  blob: {
    height: (C) => C.top + 0.1 - C.y0 + 1.0,
    r: (th, y, C) => {
      const yS = C.top + 0.1, base = sq(th, (C.a + CAP_WALL) * 1.04, (C.b + CAP_WALL) * 1.04, 2.3);
      const ss = (t: number) => t * t * (3 - 2 * t), lobe = (k: number) => 1 + 0.07 * Math.cos(3 * th + 0.6) * k;
      if (y <= yS) {
        const t = Math.max(0, (y - C.y0) / (yS - C.y0)), k = ss(t);
        return base * (1 + 0.3 * k) * lobe(k);
      }
      const u = (y - yS) / 1.0;
      return base * 1.3 * lobe(1) * Math.pow(Math.max(0, 1 - Math.pow(u, 2.6)), 1 / 2.6);
    },
  },
  // Cloud: a few big puffs, smoothly blended, on a short collar at the opening
  cloud: {
    height: (C) => C.top - C.y0 + 0.9,
    r: (th, y, C) => {
      const R0 = Math.max(C.a, C.b) + CAP_WALL, v: number[] = [];
      if (y <= C.y0 + 0.3) v.push(sq(th, (C.a + CAP_WALL) * 1.05, (C.b + CAP_WALL) * 1.05, 3));
      const puff = (tc: number, yc: number, rc: number, R: number) => {
        const d = th - tc, dy = y - yc, sd = Math.sin(d), q = R * R - dy * dy - rc * rc * sd * sd;
        if (q > 0) v.push(rc * Math.cos(d) + Math.sqrt(q));
      };
      for (let i = 0; i < 5; i++) puff((i * 2 * Math.PI) / 5, C.y0 + 0.62, R0 * 0.52, R0 * 0.72);
      for (let i = 0; i < 4; i++) puff((i * Math.PI) / 2 + 0.4, C.y0 + (C.top - C.y0) * 0.72, R0 * 0.42, R0 * 0.74);
      puff(0, C.top + 0.12, 0, R0 * 0.86);
      return v.length ? smax(v, 0.14) : -1e3;
    },
  },
  // Drop: a true teardrop. A full body with a gentle swell runs straight up past the cavity, then an ogive
  // tapers to a soft point. The taper starts tangent to the body, so there is no shoulder line.
  drop: {
    height: (C) => C.top + 0.1 - C.y0 + 1.6,
    r: (th, y, C) => {
      const yS = C.top + 0.1, A = Math.max(C.a, C.b) + CAP_WALL, base = sq(th, A * 1.1, A * 1.06, 2.2);
      if (y <= yS) {
        const t = Math.max(0, (y - C.y0) / (yS - C.y0));
        return base * (1 + 0.08 * Math.pow(Math.sin(Math.PI * t), 2));
      }
      const u = Math.min(1, (y - yS) / 1.6);
      return base * Math.pow(Math.cos((u * Math.PI) / 2), 0.72);
    },
  },
  // Leaf: a flat-ish blade facing front, widest low down, tapering to a forward-curling tip, with a midrib
  leaf: {
    height: (C) => C.top - C.y0 + 1.7,
    points: (t, NT, C, yAbs) => {
      const W0 = (C.a + CAP_WALL) * 1.12, Wm = (C.a + CAP_WALL) * 1.62, n = 1.8;
      let w = t < 0.4 ? W0 + (Wm - W0) * Math.sin(((t / 0.4) * Math.PI) / 2) : Wm * Math.pow(Math.max(0, Math.cos(((t - 0.4) / 0.6) * Math.PI / 2)), 1.2);
      // thickness: tapers toward the tip, but always contains the core where the core exists
      let d = (C.b + CAP_WALL) * 1.16 * (t < 0.6 ? 1 : Math.pow(Math.max(0, Math.cos(((t - 0.6) / 0.4) * Math.PI / 2)), 0.7)) + 0.05 * (1 - t);
      for (let k = 0; k < 48; k++) {
        const th = -Math.PI + (k * 2 * Math.PI) / 48, rc = coreOuter(th, yAbs, C);
        if (rc <= 0) continue;
        const x = Math.abs(rc * Math.sin(th)), z = Math.abs(rc * Math.cos(th));
        if (x >= w * 0.97) w = x / 0.97;
        d = Math.max(d, (z / Math.pow(1 - Math.pow(x / w, n), 1 / n)) * 1.02);
      }
      const curl = 0.3 * Math.pow(Math.max(0, (t - 0.6) / 0.4), 2), out = new Float32Array(NT * 2);
      for (let k = 0; k < NT; k++) {
        const th = -Math.PI + (k * 2 * Math.PI) / NT, s = Math.sin(th), c = Math.cos(th);
        const x = w * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
        let z = d * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
        if (w > 0.1) z += Math.sign(c) * 0.035 * Math.exp(-Math.pow(x / w, 2) / 0.02); // midrib, front and back
        out[2 * k] = x;
        out[2 * k + 1] = z + curl;
      }
      return out;
    },
  },
};

type Row = { y: number; p: Float32Array };

/** Legacy `B.cap` (990–1030). The caller supplies the cap core (from cap-fit.json, or live for an uploaded head). */
export function buildCap(s: string, hex: string, ctx: BuildCtx & { capCore: CapCore }): THREE.Group {
  // character caps (sprout, bear, hat, bunny) share the Pebble capsule and add an accessory on top
  const C = ctx.capCore, st = CAP_STYLES[s] || CAP_STYLES.bubble, NT = 96, CZ = C.cz;
  const ang = (k: number) => -Math.PI + (k * 2 * Math.PI) / NT;
  const radialRow = (y: number, rf: (th: number) => number): Row => {
    const o = new Float32Array(NT * 2);
    for (let k = 0; k < NT; k++) {
      const th = ang(k), r = Math.max(0, rf(th));
      o[2 * k] = r * Math.sin(th);
      o[2 * k + 1] = r * Math.cos(th);
    }
    return { y, p: o };
  };
  // outer rows
  const H = st.height(C), NY = 84, outer: Row[] = [];
  for (let j = 0; j <= NY; j++) {
    const t = j / NY, y = C.y0 + H * t;
    if (st.points) outer.push({ y, p: st.points(t, NT, C, y) });
    else outer.push(radialRow(y, (th) => (j === NY ? 0 : smax([st.r!(th, y, C), coreOuter(th, y, C)], 0.03))));
  }
  // soft rolled lip at the opening: a small bead just above the rim, so the edge reads moulded, not cut
  // smooth the profile up the height (two light passes) so joins and containment kinks never show as creases
  for (let pass = 0; pass < 2; pass++) {
    const src = outer.map((r) => Float32Array.from(r.p));
    for (let j = 2; j < outer.length - 2; j++) {
      const dst = outer[j].p;
      for (let k = 0; k < dst.length; k++)
        dst[k] = Math.max(src[j][k] * 0.985, (src[j - 2][k] + 2 * src[j - 1][k] + 3 * src[j][k] + 2 * src[j + 1][k] + src[j + 2][k]) / 9);
    }
  }
  outer.forEach((row) => {
    const dy = row.y - C.y0;
    if (dy > 0.25) return;
    const f = 1 + 0.018 * Math.exp(-Math.pow((dy - 0.07) / 0.07, 2));
    for (let k = 0; k < row.p.length; k++) row.p[k] *= f;
  });
  // inner cavity rows: straight walls, then a short rounded ceiling
  const inner: Row[] = [], NB = 12, NC = 10;
  for (let j = 0; j <= NB; j++) {
    const y = C.y0 + ((C.top - C.y0) * j) / NB;
    inner.push(radialRow(y, (th) => sq(th, C.a, C.b, 3)));
  }
  for (let j = 1; j <= NC; j++) {
    const u = j / NC, y = C.top + C.ceil * Math.sin((u * Math.PI) / 2);
    inner.push(radialRow(y, (th) => sq(th, C.a, C.b, 3) * Math.cos((u * Math.PI) / 2)));
  }
  const sheet = (rows: Row[], flip: boolean) => {
    const pos: number[] = [], idx: number[] = [];
    rows.forEach(({ y, p }) => {
      for (let k = 0; k < NT; k++) pos.push(p[2 * k], y, CZ + p[2 * k + 1]);
    });
    for (let j = 0; j < rows.length - 1; j++)
      for (let k = 0; k < NT; k++) {
        const k2 = (k + 1) % NT, a = j * NT + k, b = j * NT + k2, c = (j + 1) * NT + k, d = (j + 1) * NT + k2;
        if (flip) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // flat rim joining outside to inside at the opening
  const rimPos: number[] = [], rimIdx: number[] = [], y0 = C.y0, po = outer[0].p, pi = inner[0].p;
  for (let k = 0; k < NT; k++) rimPos.push(po[2 * k], y0, CZ + po[2 * k + 1], pi[2 * k], y0, CZ + pi[2 * k + 1]);
  for (let k = 0; k < NT; k++) {
    const k2 = (k + 1) % NT, o1 = 2 * k, i1 = 2 * k + 1, o2 = 2 * k2, i2 = 2 * k2 + 1;
    rimIdx.push(o1, i1, o2, o2, i1, i2);
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));
  rim.setIndex(rimIdx);
  rim.computeVertexNormals();
  // opaque soft-touch silicone: matte with a faint satin sheen; inside a touch darker
  const mat = applyFinish(plastic(hex, { roughness: 0.58, clearcoat: 0.12, clearcoatRoughness: 0.55, ...siliconeSheen(hex) }), ctx.finish);
  const inMat = plastic(mixHex(hex, '#252525', 0.12), { roughness: 0.7, side: THREE.BackSide });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(sheet(outer, false), mat));
  g.add(new THREE.Mesh(sheet(inner, true), inMat));
  g.add(new THREE.Mesh(rim, plastic(hex, { roughness: 0.58, side: THREE.DoubleSide })));
  if (!CAP_STYLES[s]) addCapAccessory(g, s, hex, C, CZ);
  return g;
}
