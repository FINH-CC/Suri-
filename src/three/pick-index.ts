import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

/*
 * A bounding-volume index per part geometry, so a hit test checks the few triangles under the ray instead of all of
 * them. Without it one hover hit test on the CAD brush (616k triangles) took 100-200 ms on an M5 Pro, and the hover
 * cursor ran one every 90 ms, which froze the page while the mouse was over the brush. Meshes without an index
 * (nothing built yet) fall back to three's plain raycast inside acceleratedRaycast.
 */
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** Build the mesh's geometry index once; geometries shared between rebuilds keep theirs. */
export function indexMesh(mesh: THREE.Mesh): void {
  const g = mesh.geometry;
  if (!g.boundsTree) g.boundsTree = new MeshBVH(g);
}
