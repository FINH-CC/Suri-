import * as THREE from 'three';

/**
 * Box3.expandByObject as three r128 computed it (the legacy framing and contact shadow depend on it):
 * every mesh contributes its geometry's bounding box in world space. Current three uses an InstancedMesh's
 * instance bounds instead; r128 used the base geometry at the mesh origin, so the head's bristle tuft (a lathe at
 * y≈0) stretched the box down to the floor. The stage framing, the contact shadow and the
 * passport hero camera keep that box for parity with the legacy build (Task 18). Upload fitting does not: there the
 * r128 box was a bug (an uploaded head was centred halfway down the handle).
 */
const _gb = new THREE.Box3();
export function expandByObjectR128(box: THREE.Box3, o: THREE.Object3D): THREE.Box3 {
  o.updateWorldMatrix(false, false);
  const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  if (geo?.isBufferGeometry) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    box.union(_gb.copy(geo.boundingBox!).applyMatrix4(o.matrixWorld));
  }
  for (const c of o.children) expandByObjectR128(box, c);
  return box;
}

/**
 * The true world box of an object's meshes, leaving out InstancedMesh (the bristle tufts). Used by the Task 19 looks
 * that seat the contact shadow under the brush's real base instead of the r128 box's floor.
 */
export function expandByMeshes(box: THREE.Box3, o: THREE.Object3D): THREE.Box3 {
  o.updateWorldMatrix(false, false);
  const mesh = o as THREE.Mesh;
  if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && mesh.geometry?.isBufferGeometry) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(_gb.copy(mesh.geometry.boundingBox!).applyMatrix4(o.matrixWorld));
  }
  for (const c of o.children) expandByMeshes(box, c);
  return box;
}
