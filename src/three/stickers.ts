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
  const geo = new DecalGeometry(hit.object as THREE.Mesh, hit.point, helper.rotation, new THREE.Vector3(st.s, st.s, 1.6));
  const mat = new THREE.MeshStandardMaterial({
    map: textureFor(st.t),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    roughness: 0.5,
  });
  mat.userData.keepMap = true; // part rebuilds dispose their group's children; the shared texture must survive
  return new THREE.Mesh(geo, mat);
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
  PARTS.forEach((p) => G[p.id].position.set(0, 0, 0));
  scene.scene.updateMatrixWorld(true);
  const made = stickers.map((st) => [st, decalFor(scene, st, textureFor)] as const);
  PARTS.forEach((p, i) => G[p.id].position.copy(saved[i]));
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
