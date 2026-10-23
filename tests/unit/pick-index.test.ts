import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { indexMesh } from '../../src/three/pick-index';

describe('indexMesh', () => {
  it('gives the same nearest hit as an unindexed raycast, and builds the index once', () => {
    const a = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 200, 32));
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.8, 64, 32));
    b.position.set(0.6, 0.2, -1.5);
    for (const m of [a, b]) m.updateMatrixWorld();
    const rc = new THREE.Raycaster();
    const rays: THREE.Ray[] = [];
    for (let i = 0; i < 60; i++) {
      const o = new THREE.Vector3(Math.sin(i) * 0.9, Math.cos(i * 1.7) * 0.9, 6);
      rays.push(new THREE.Ray(o, new THREE.Vector3(0, 0, -1)));
    }
    const plain = rays.map((r) => {
      rc.ray.copy(r);
      return rc.intersectObjects([a, b], false)[0];
    });
    indexMesh(a);
    indexMesh(b);
    const tree = a.geometry.boundsTree;
    expect(tree).toBeTruthy();
    indexMesh(a);
    expect(a.geometry.boundsTree).toBe(tree);
    rc.firstHitOnly = true;
    rays.forEach((r, i) => {
      rc.ray.copy(r);
      const hit = rc.intersectObjects([a, b], false)[0];
      expect(hit?.object).toBe(plain[i]?.object);
      if (hit) expect(hit.point.distanceTo(plain[i]!.point)).toBeLessThan(1e-5);
    });
    expect(plain.filter(Boolean).length).toBeGreaterThan(20);
  });
});
