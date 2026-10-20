/**
 * Node-side twin of src/three/model.ts loadModel: parse public/model/brush.glb with three's GLTFLoader
 * (meshopt-decoded) and bake it with the shared cadFromScene, so tests and scripts see the exact
 * geometry the browser builds. No browser globals are needed: the glb carries no textures.
 */
import { readFileSync } from 'node:fs';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { cadFromScene, type BrushMeta, type CadGeo } from '../../src/three/model';

export async function loadCadFromGlb(glbPath: string, metaPath: string): Promise<{ cad: CadGeo; meta: BrushMeta }> {
  const buf = readFileSync(glbPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as BrushMeta;
  if (!meta || typeof meta.roles !== 'object' || meta.roles === null) throw new Error(`brush meta ${metaPath}: missing "roles" map`);
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise<GLTF>((resolve, reject) => loader.parse(ab, '', resolve, reject));
  return { cad: cadFromScene(gltf.scene, meta.roles), meta };
}
