import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { expandByObjectR128 } from '../../src/three/box';

describe('expandByObjectR128', () => {
  it('counts an InstancedMesh by its base geometry at the mesh origin, as r128 did', () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
    body.position.y = 10;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), undefined, 1);
    inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 10, 0));
    g.add(body, inst);
    const r128 = expandByObjectR128(new THREE.Box3(), g);
    expect(r128.min.y).toBeCloseTo(-0.1);
    expect(r128.max.y).toBeCloseTo(11);
    // current three counts the instances instead, so the box stays on the body
    expect(new THREE.Box3().setFromObject(g).min.y).toBeCloseTo(9);
  });

  it('applies world transforms and recurses into children', () => {
    const outer = new THREE.Group();
    outer.position.set(0, 5, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    m.position.x = 3;
    outer.add(m);
    outer.updateMatrixWorld(true);
    const b = expandByObjectR128(new THREE.Box3(), outer);
    expect(b.min.toArray()).toEqual([2, 4, -1]);
    expect(b.max.toArray()).toEqual([4, 6, 1]);
  });
});
