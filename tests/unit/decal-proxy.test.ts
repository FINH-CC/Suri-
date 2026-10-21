import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { describe, expect, it } from 'vitest';
import { decalProxy } from '../../src/three/stickers';

const decal = (mesh: THREE.Mesh, point: THREE.Vector3, rot: THREE.Euler, size: THREE.Vector3) =>
  Array.from(new DecalGeometry(mesh, point, rot, size).attributes.position.array as Float32Array);

describe('decalProxy', () => {
  it.each([
    ['indexed sphere, scaled and moved', new THREE.SphereGeometry(2, 96, 64), true, [1.3, 5.4]],
    ['non-indexed cylinder', new THREE.CylinderGeometry(1, 1.2, 8, 80, 60).toNonIndexed(), false, [0.3, 1.4]],
  ] as const)('gives the same decal as the full mesh: %s', (_name, geo, transform, [ox, oy]) => {
    const mesh = new THREE.Mesh(geo);
    if (transform) { mesh.position.set(1, 5, -2); mesh.scale.set(1.5, 1.5, 1.5); mesh.rotation.y = 0.4; }
    mesh.updateMatrixWorld(true);
    // a surface point facing the viewer, found the way stickers find it
    const ray = new THREE.Raycaster(new THREE.Vector3(ox, oy, 20), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(mesh)[0];
    const helper = new THREE.Object3D();
    helper.position.copy(hit.point);
    helper.lookAt(hit.point.clone().add(hit.face!.normal.clone().transformDirection(mesh.matrixWorld)));
    helper.rotateZ(0.6);
    const size = new THREE.Vector3(0.9, 0.9, 1.6);
    const proxy = decalProxy(mesh, hit.point, size.length() / 2);
    const total = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    expect(proxy.geometry.attributes.position.count / 3).toBeLessThan(total / 5);
    const full = decal(mesh, hit.point, helper.rotation, size);
    expect(full.length).toBeGreaterThan(0);
    expect(decal(proxy, hit.point, helper.rotation, size)).toEqual(full);
  });
});
