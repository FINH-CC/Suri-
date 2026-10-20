import * as THREE from 'three';
import { applyFinish, INK, METAL, mixHex, plastic } from '../materials';
import { sphere, type BuildCtx } from './context';

/** A collectible character on a short chain; children[0] is the character itself. */
export function buildCharm(s: string, hex: string, ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group();
  if (s === 'none') return g;
  const mat = applyFinish(plastic(hex, { roughness: 0.38, clearcoat: 0.6 }), ctx.finish);
  const metal = METAL();
  const ink = plastic(INK, { clearcoat: 0.8 });
  const Y = 12.4; // above the button zone (9.0-11.6)
  const ch = new THREE.Group();
  ch.scale.setScalar(0.85);
  g.add(ch); // positioned after it's built, once its size is known

  const eyes = (y: number, z: number, dx = 0.12) => {
    ch.add(sphere(0.045, ink, [-dx, y, z], [1, 1, 0.6]));
    ch.add(sphere(0.045, ink, [dx, y, z], [1, 1, 0.6]));
  };
  if (s === 'cloud') {
    [[0, 0, 0.36], [-0.34, -0.08, 0.26], [0.34, -0.08, 0.26], [-0.14, 0.24, 0.25], [0.18, 0.2, 0.24]].forEach(([x, y, r]) =>
      ch.add(sphere(r, mat, [x, y, 0], [1, 1, 0.8])),
    );
    eyes(0.02, 0.29);
  }
  if (s === 'star') {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.21 : 0.5;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      if (i) sh.lineTo(r * Math.cos(a), r * Math.sin(a));
      else sh.moveTo(r * Math.cos(a), r * Math.sin(a));
    }
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4 });
    geo.translate(0, 0, -0.08);
    ch.add(new THREE.Mesh(geo, mat));
    eyes(0.02, 0.15, 0.09);
  }
  if (s === 'sprout') {
    ch.add(sphere(0.32, mat, [0, 0, 0], [1, 1.08, 0.85]));
    const leaf = plastic(mixHex('#7fae7f', hex, 0.2));
    [-1, 1].forEach((d) => {
      const l = sphere(0.2, leaf, [d * 0.17, 0.42, 0], [1, 0.35, 0.55]);
      l.rotation.z = d * 0.5;
      ch.add(l);
    });
    eyes(0.02, 0.26, 0.1);
  }
  if (s === 'fish') {
    ch.add(sphere(0.36, mat, [0, 0, 0], [1.25, 0.82, 0.6]));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 24), mat);
    tail.rotation.z = -Math.PI / 2;
    tail.position.set(-0.56, 0, 0);
    tail.scale.z = 0.45;
    ch.add(tail);
    ch.add(sphere(0.05, ink, [0.22, 0.07, 0.19], [1, 1, 0.6]));
  }
  // Hang it clear of the handle: measure the charm, then put the chain far enough out that nothing sinks into the brush.
  // A short metal arm carries a loop out from the handle side; two interlocking oval links (each turned 90deg) drop
  // straight down; a jump ring is seated in the top of the charm.
  ch.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(ch);
  const hx = ctx.dim.handleHalfX;
  const X = hx + Math.max(0.2, -bb.min.x + 0.08);
  const lugR = 0.11;
  const lx = X - lugR;
  const lug = new THREE.Mesh(new THREE.TorusGeometry(lugR, 0.038, 14, 36), metal);
  lug.rotation.x = Math.PI / 2;
  lug.position.set(lx, Y, 0);
  g.add(lug);
  const armLen = Math.max(0, lx - lugR + 0.02 - (hx - 0.06));
  if (armLen > 0.02) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, armLen, 16), metal);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(hx - 0.06 + armLen / 2, Y, 0);
    g.add(arm);
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 20), metal);
    boss.rotation.z = Math.PI / 2;
    boss.position.set(hx - 0.01, Y, 0);
    g.add(boss);
  }
  const linkGeo = new THREE.TorusGeometry(0.085, 0.028, 12, 32);
  const LINK_HALF = 0.085 * 1.55;
  const STEP = 2 * LINK_HALF - 0.07;
  let y = Y - LINK_HALF + 0.05;
  for (let i = 0; i < 2; i++) {
    const l = new THREE.Mesh(linkGeo, metal);
    l.scale.set(1, 1.55, 1);
    l.position.set(X, y, 0);
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    g.add(l);
    y -= STEP;
  }
  const jumpY = y + 0.03;
  const jump = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 12, 32), metal);
  jump.position.set(X, jumpY, 0);
  g.add(jump);
  ch.position.set(X, jumpY - 0.1 - bb.max.y + 0.05, 0);
  return g;
}
