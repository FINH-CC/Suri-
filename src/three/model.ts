import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export interface BrushMeta {
  tufts: number[][];
  tuftFaceZ: number;
  gripProfile: { y: number[]; nt: number; r: number[][] } & Record<string, unknown>;
  roles: Record<string, string>;
}

export type CadPart = 'handle' | 'head' | 'mount';
export type CadGeo = Record<CadPart, { role: string; geo: THREE.BufferGeometry }[]>;

const PARTS: readonly CadPart[] = ['handle', 'head', 'mount'];

/** Mesh made from a CAD geometry; `keepGeo` marks shared geometry that must not be disposed with the mesh. */
export function cadMesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.userData.keepGeo = true;
  return m;
}

/**
 * Load the meshopt-compressed brush glb + its meta. The glb stores quantised int16 positions under a
 * per-node translation+scale; that transform is baked into a cloned geometry so every CadGeo geometry
 * is in legacy scene units (10 mm) with an identity transform, as legacy buildCadGeo produced.
 * Normals come transformed by the normal matrix and are never recomputed.
 */
export async function loadModel(
  url: string,
  metaUrl: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<{ cad: CadGeo; meta: BrushMeta }> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf, meta] = await Promise.all([
    loader.loadAsync(url, (e) => onProgress(e.loaded, e.total)),
    fetch(metaUrl).then((r) => {
      if (!r.ok) throw new Error(`brush meta ${metaUrl}: HTTP ${r.status}`);
      return r.json() as Promise<BrushMeta>;
    }),
  ]);

  if (!meta || typeof meta.roles !== 'object' || meta.roles === null)
    throw new Error(`brush meta ${metaUrl}: missing "roles" map`);
  return { cad: cadFromScene(gltf.scene, meta.roles), meta };
}

/** Copy every attribute to plain Float32 (denormalising the quantised int16 data), so baking cannot clamp. */
function toFloat32(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [key, a] of Object.entries(src.attributes)) {
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(key, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

/**
 * Group a loaded glb scene's meshes into CadGeo by name prefix. GLTFLoader sanitises node names
 * ("handle/body" -> "handlebody"), so the original glTF name is read from `userData.name`
 * (or the parent's, for multi-primitive nodes).
 */
export function cadFromScene(scene: THREE.Object3D, roles: Record<string, string>): CadGeo {
  const cad: CadGeo = { handle: [], head: [], mount: [] };
  const skipped: string[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    // multi-primitive nodes become a Group of Meshes; the glTF name then lives on the parent
    const name: string = mesh.userData.name ?? mesh.parent?.userData.name ?? mesh.name;
    const part = PARTS.find((p) => name.startsWith(p + '/'));
    const role = roles[name];
    if (!part || role === undefined) {
      skipped.push(name);
      return;
    }
    const geo = toFloat32(mesh.geometry);
    geo.applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    cad[part].push({ role, geo });
  });
  if (skipped.length) console.warn(`[model] skipped unmapped meshes: ${skipped.join(', ')}`);
  for (const p of PARTS) if (!cad[p].length) throw new Error(`brush glb has no ${p}/ meshes`);
  return cad;
}
