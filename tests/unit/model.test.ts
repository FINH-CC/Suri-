import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cadFromScene } from '../../src/three/model';

// One quantised mesh per part, as the glb stores them: normalised int16 under a scaled + translated node.
function quantisedMesh(name: string, multiPrimitive = false): THREE.Object3D {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Int16Array([32767, 0, 0, 0, -32767, 0, 0, 0, 16384]), 3, true));
  g.setAttribute('normal', new THREE.BufferAttribute(new Int16Array([32767, 0, 0, 0, 32767, 0, 0, 0, -32767]), 3, true));
  const mesh = new THREE.Mesh(g);
  if (!multiPrimitive) {
    mesh.name = name.replace('/', '');
    mesh.userData.name = name;
    return mesh;
  }
  const group = new THREE.Group();
  group.userData.name = name;
  group.add(mesh);
  return group;
}

describe('cadFromScene', () => {
  const scene = new THREE.Scene();
  const node = new THREE.Group();
  node.scale.setScalar(6.815);
  node.position.set(1, 7.715, -2);
  node.add(quantisedMesh('handle/body'), quantisedMesh('head/pad', true), quantisedMesh('mount/body'));
  node.add(quantisedMesh('handle/unknown'));
  scene.add(node);
  const cad = cadFromScene(scene, { 'handle/body': 'body', 'head/pad': 'body', 'mount/body': 'body' });

  it('groups by prefix and maps roles', () => {
    expect(cad.handle.map((c) => c.role)).toEqual(['body']);
    expect(cad.head.map((c) => c.role)).toEqual(['body']);
    expect(cad.mount.length).toBe(1);
  });
  it('bakes the node transform into float world-unit positions', () => {
    const { geo } = cad.handle[0];
    const p = geo.attributes.position;
    expect(p.array).toBeInstanceOf(Float32Array);
    const want = [
      [1 + 6.815, 7.715, -2],
      [1, 7.715 - 6.815, -2],
      [1, 7.715, -2 + 6.815 * (16384 / 32767)],
    ];
    want.forEach((w, i) => {
      expect(Math.abs(p.getX(i) - w[0])).toBeLessThan(1e-3);
      expect(Math.abs(p.getY(i) - w[1])).toBeLessThan(1e-3);
      expect(Math.abs(p.getZ(i) - w[2])).toBeLessThan(1e-3);
    });
    expect(geo.boundingBox).not.toBeNull();
    expect(geo.boundingSphere).not.toBeNull();
  });
  it('keeps normals unit length', () => {
    const n = cad.handle[0].geo.attributes.normal;
    for (let i = 0; i < n.count; i++) expect(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1)).toBeLessThan(1e-6);
  });
});
