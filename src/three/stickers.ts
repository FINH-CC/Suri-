import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { PARTS } from '../data/parts';
import type { PartId, StickerType } from '../data/parts';
import type { Sticker } from '../state/design';
import type { BrushScene } from './scene';

/** What sticker projection needs from the scene (a stub in unit tests). */
export type StickerScene = Pick<BrushScene, 'groups' | 'scene' | 'requestFrame'>;
type TextureFor = (type: StickerType) => THREE.Texture;

/* ---------- artwork (legacy 1173-1195): drawn lazily, once per type ---------- */

const art: Partial<Record<StickerType, { tex: THREE.CanvasTexture; url: string }>> = {};

function drawSticker(type: StickerType): { tex: THREE.CanvasTexture; url: string } {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.translate(128, 128);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const path = new Path2D();
  const fillStroke = (p: Path2D, fill: string) => {
    g.lineWidth = 26;
    g.strokeStyle = '#ffffff';
    g.stroke(p);
    g.fillStyle = fill;
    g.fill(p);
  };
  const face = (y = 8, col = '#252525') => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(-22, y - 10, 7, 0, 7);
    g.arc(22, y - 10, 7, 0, 7);
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = col;
    g.beginPath();
    g.arc(0, y + 4, 20, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  };
  if (type === 'star') {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 44 : 96, a = -Math.PI / 2 + (i * Math.PI) / 5;
      if (i) path.lineTo(r * Math.cos(a), r * Math.sin(a));
      else path.moveTo(r * Math.cos(a), r * Math.sin(a));
    }
    path.closePath();
    fillStroke(path, '#fbbe6e');
  }
  if (type === 'heart') {
    path.moveTo(0, 80);
    path.bezierCurveTo(-120, 0, -70, -100, 0, -40);
    path.bezierCurveTo(70, -100, 120, 0, 0, 80);
    fillStroke(path, '#fda691');
  }
  if (type === 'smile') {
    path.arc(0, 0, 92, 0, Math.PI * 2);
    fillStroke(path, '#66bf8d');
    face(8);
  }
  if (type === 'bolt') {
    path.moveTo(20, -100);
    path.lineTo(-60, 10);
    path.lineTo(-5, 10);
    path.lineTo(-25, 100);
    path.lineTo(60, -15);
    path.lineTo(5, -15);
    path.closePath();
    fillStroke(path, '#fae59d');
  }
  if (type === 'cloud') {
    path.arc(-45, 15, 45, Math.PI * 0.5, Math.PI * 1.5);
    path.arc(-10, -25, 48, Math.PI * 1.05, Math.PI * 1.9);
    path.arc(45, 5, 50, Math.PI * 1.35, Math.PI * 0.5);
    path.closePath();
    fillStroke(path, '#dfd7ef');
    face(18, '#252525');
  }
  if (type === 'rainbow') {
    const cols = ['#e86239', '#fbbe6e', '#66bf8d', '#adaae1'];
    g.lineWidth = 26 + 4 * 24;
    g.strokeStyle = '#fff';
    g.beginPath();
    g.arc(0, 40, 72, Math.PI, 0);
    g.stroke();
    cols.forEach((col, i) => {
      g.lineWidth = 24;
      g.strokeStyle = col;
      g.beginPath();
      g.arc(0, 40, 108 - i * 24, Math.PI, 0);
      g.stroke();
    });
  }
  if (type === 'flower') {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      path.moveTo(55 * Math.cos(a) + 38, 55 * Math.sin(a));
      path.arc(55 * Math.cos(a), 55 * Math.sin(a), 38, 0, Math.PI * 2);
    }
    g.lineWidth = 26;
    g.strokeStyle = '#fff';
    g.stroke(path);
    g.fillStyle = '#fda691';
    g.fill(path);
    g.fillStyle = '#fbbe6e';
    g.beginPath();
    g.arc(0, 0, 34, 0, 7);
    g.fill();
  }
  if (type === 'moon') {
    path.arc(0, 0, 90, Math.PI * 0.35, Math.PI * 1.65);
    path.arc(38, 0, 70, Math.PI * 1.45, Math.PI * 0.55, true);
    path.closePath();
    fillStroke(path, '#adaae1');
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.userData.keepMap = true; // shared across every decal of this type
  return { tex, url: c.toDataURL('image/png') };
}

const artFor = (type: StickerType) => (art[type] ??= drawSticker(type));
export const stickerUrl = (type: StickerType): string => artFor(type).url;
export const stickerTexture = (type: StickerType): THREE.CanvasTexture => artFor(type).tex;

/* ---------- placement (legacy 1197-1239) ---------- */

const raycaster = new THREE.Raycaster();
const r3 = (v: number) => +v.toFixed(3);

/** World hit point → part-local coords (the part group's offset removed), rounded as stored. */
export function toPartLocal(
  point: { x: number; y: number; z: number },
  groupPosition: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return { x: r3(point.x - groupPosition.x), y: r3(point.y - groupPosition.y), z: r3(point.z - groupPosition.z) };
}

function partMeshes(scene: StickerScene, id: PartId): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  scene.groups[id].traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !m.userData.isSticker) out.push(m);
  });
  return out;
}

/* ---------- decal proxy: only the triangles a decal can touch ---------- */

// Per geometry, once: each triangle's centroid and the distance from it to its farthest corner (local space).
const triBounds = new WeakMap<THREE.BufferGeometry, { c: Float32Array; r: Float32Array }>();

function boundsFor(geo: THREE.BufferGeometry): { c: Float32Array; r: Float32Array } {
  let b = triBounds.get(geo);
  if (b) return b;
  const pos = geo.attributes.position, idx = geo.index;
  const n = (idx ? idx.count : pos.count) / 3;
  const c = new Float32Array(n * 3), r = new Float32Array(n);
  const v = [0, 0, 0].map(() => new THREE.Vector3());
  const m = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(3 * t + k) : 3 * t + k);
    m.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1 / 3);
    c[3 * t] = m.x; c[3 * t + 1] = m.y; c[3 * t + 2] = m.z;
    r[t] = Math.sqrt(Math.max(m.distanceToSquared(v[0]), m.distanceToSquared(v[1]), m.distanceToSquared(v[2])));
  }
  b = { c, r };
  triBounds.set(geo, b);
  return b;
}

const _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();

/**
 * A stand-in for `mesh` holding only the triangles that can reach a decal box of half-diagonal `reach` (world units)
 * centred on `point`. DecalGeometry clips every triangle of the mesh it is given; on the CAD handle (~46k triangles)
 * that cost ~80 ms per sticker. Triangles left out lie wholly outside the box, so the decal comes out the same.
 */
export function decalProxy(mesh: THREE.Mesh, point: THREE.Vector3, reach: number): THREE.Mesh {
  const geo = mesh.geometry, pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index;
  const { c, r } = boundsFor(geo);
  mesh.matrixWorld.decompose(_p, _q, _s);
  const R = reach / Math.min(Math.abs(_s.x), Math.abs(_s.y), Math.abs(_s.z));
  const local = _p.copy(point).applyMatrix4(new THREE.Matrix4().copy(mesh.matrixWorld).invert());
  const keep: number[] = [];
  for (let t = 0; t < r.length; t++) {
    const dx = c[3 * t] - local.x, dy = c[3 * t + 1] - local.y, dz = c[3 * t + 2] - local.z, lim = R + r[t];
    if (dx * dx + dy * dy + dz * dz <= lim * lim) keep.push(t);
  }
  const P = new Float32Array(keep.length * 9), N = nor ? new Float32Array(keep.length * 9) : null;
  keep.forEach((t, j) => {
    for (let k = 0; k < 3; k++) {
      const i = idx ? idx.getX(3 * t + k) : 3 * t + k, o = 9 * j + 3 * k;
      P[o] = pos.getX(i); P[o + 1] = pos.getY(i); P[o + 2] = pos.getZ(i);
      if (N && nor) { N[o] = nor.getX(i); N[o + 1] = nor.getY(i); N[o + 2] = nor.getZ(i); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (N) g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  const proxy = new THREE.Mesh(g, mesh.material);
  proxy.matrixAutoUpdate = false;
  proxy.matrixWorld.copy(mesh.matrixWorld);
  return proxy;
}

function decalFor(scene: StickerScene, st: Sticker, textureFor: TextureFor): THREE.Mesh | null {
  const p = new THREE.Vector3(st.x, st.y, st.z), n = new THREE.Vector3(st.nx, st.ny, st.nz).normalize();
  raycaster.set(p.clone().addScaledVector(n, 1.5), n.clone().negate());
  raycaster.far = 3;
  const hit = raycaster.intersectObjects(partMeshes(scene, st.p), false)[0];
  if (!hit) return null;
  const helper = new THREE.Object3D();
  helper.position.copy(hit.point);
  helper.lookAt(hit.point.clone().add(n));
  helper.rotateZ((st.r * Math.PI) / 180);
  const size = new THREE.Vector3(st.s, st.s, 1.6);
  const proxy = decalProxy(hit.object as THREE.Mesh, hit.point, size.length() / 2);
  const geo = new DecalGeometry(proxy, hit.point, helper.rotation, size);
  proxy.geometry.dispose();
  return new THREE.Mesh(geo, stickerMaterial(textureFor(st.t)));
}

function stickerMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    roughness: 0.5,
  });
  mat.userData.keepMap = true; // part rebuilds dispose their group's children; the shared texture must survive
  return mat;
}

/**
 * Compile the sticker program (and upload one sticker texture) ahead of the first placement, so the first sticker
 * doesn't pay a shader compile on the click. Uses the stage's lights and shadow setup. The warm material is kept:
 * disposing it would release the compiled program (three frees a program once no material uses it).
 */
let warmMaterial: THREE.MeshStandardMaterial | null = null;
export async function warmStickerProgram(bs: Pick<BrushScene, 'renderer' | 'camera' | 'scene'>): Promise<void> {
  const tex = stickerTexture('star');
  warmMaterial ??= stickerMaterial(tex);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), warmMaterial);
  mesh.userData.isSticker = true;
  try {
    bs.renderer.initTexture(tex);
    await bs.renderer.compileAsync(mesh, bs.camera, bs.scene);
  } finally {
    mesh.geometry.dispose();
  }
}

/** Release the warm-up material (scene teardown); the next warmStickerProgram makes a new one. */
export function disposeWarmSticker(): void {
  warmMaterial?.dispose();
  warmMaterial = null;
}

// Stickers live inside their part's group (in part-local coords) so they move when the brush comes apart.
const built = new WeakMap<StickerScene, THREE.Mesh[]>();

export function projectStickers(
  scene: StickerScene,
  stickers: Sticker[],
  textureFor: TextureFor = stickerTexture,
): { placed: number; dropped: number } {
  for (const m of built.get(scene) ?? []) {
    m.parent?.remove(m);
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
  const meshes: THREE.Mesh[] = [];
  built.set(scene, meshes);
  // project decals with every part at rest, then parent them to their part
  const G = scene.groups;
  const saved = PARTS.map((p) => G[p.id].position.clone());
  let made: (readonly [Sticker, THREE.Mesh | null])[];
  try {
    PARTS.forEach((p) => G[p.id].position.set(0, 0, 0));
    scene.scene.updateMatrixWorld(true);
    made = stickers.map((st) => [st, decalFor(scene, st, textureFor)] as const);
  } finally {
    PARTS.forEach((p, i) => G[p.id].position.copy(saved[i])); // never leave the parts collapsed, even on a throw
  }
  for (const [st, m] of made) {
    if (!m) continue; // probe ray missed: dropped silently
    m.userData.isSticker = true;
    meshes.push(m);
    G[st.p].add(m);
  }
  scene.scene.updateMatrixWorld(true);
  scene.requestFrame();
  return { placed: meshes.length, dropped: stickers.length - meshes.length };
}

/** Pointer hit on the brush → a new sticker record (point in part-local coords), or null on a miss. */
export function placeSticker(
  scene: Pick<BrushScene, 'groups' | 'raycastSurface'>,
  type: StickerType,
  clientX: number,
  clientY: number,
  size: number,
  rot: number,
): Sticker | null {
  const hit = scene.raycastSurface(clientX, clientY);
  if (!hit) return null;
  const lp = toPartLocal(hit.point, scene.groups[hit.part].position), n = hit.normal;
  return { t: type, p: hit.part, ...lp, nx: r3(n.x), ny: r3(n.y), nz: r3(n.z), s: size, r: rot };
}
