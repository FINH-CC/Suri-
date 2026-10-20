import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PARTS } from '../../src/data/parts';
import type { PartId } from '../../src/data/parts';
import type { Sticker } from '../../src/state/design';
import { projectStickers, toPartLocal } from '../../src/three/stickers';
import type { StickerScene } from '../../src/three/stickers';

function stubScene(): StickerScene & { frames: number } {
  const scene = new THREE.Scene();
  const groups = {} as Record<PartId, THREE.Group>;
  for (const p of PARTS) {
    groups[p.id] = new THREE.Group();
    scene.add(groups[p.id]);
  }
  groups.cap.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return { groups, scene, frames: 0, requestFrame() { this.frames++; } };
}

const tex = new THREE.Texture();
const st = (o: Partial<Sticker>): Sticker => ({ t: 'star', p: 'cap', x: 0, y: 0, z: 0.5, nx: 0, ny: 0, nz: 1, s: 0.9, r: 0, ...o });

describe('toPartLocal', () => {
  it('subtracts the group position and rounds to 3 decimals', () => {
    expect(toPartLocal({ x: 1.23456, y: 5.6 + 2.8, z: -0.00049 }, { x: 0, y: 2.8, z: 0 })).toEqual({ x: 1.235, y: 5.6, z: -0 });
    expect(toPartLocal({ x: -3.2, y: 1, z: 2.0004 }, { x: -3.2, y: 0, z: 0 })).toEqual({ x: 0, y: 1, z: 2 });
  });
});

describe('projectStickers', () => {
  it('drops a sticker whose probe ray misses, without throwing', () => {
    const s = stubScene();
    // far from the box, normal pointing away from it: the probe ray hits nothing
    const r = projectStickers(s, [st({ x: 10, y: 10, z: 10, nx: 1, ny: 1, nz: 1 })], () => tex);
    expect(r).toEqual({ placed: 0, dropped: 1 });
    expect(s.groups.cap.children.some((c) => c.userData.isSticker)).toBe(false);
    expect(s.frames).toBe(1);
  });

  it('places a decal on the box, parented to its part, and restores group positions', () => {
    const s = stubScene();
    s.groups.cap.position.set(0, 5.6, 0);
    const r = projectStickers(s, [st({})], () => tex);
    expect(r).toEqual({ placed: 1, dropped: 0 });
    const decal = s.groups.cap.children.find((c) => c.userData.isSticker) as THREE.Mesh;
    expect(decal).toBeTruthy();
    expect(decal.geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(s.groups.cap.position.y).toBe(5.6);
    // rebuilding replaces, not accumulates
    projectStickers(s, [st({})], () => tex);
    expect(s.groups.cap.children.filter((c) => c.userData.isSticker)).toHaveLength(1);
  });
});
