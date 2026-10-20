import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { extractCad } from '../../scripts/extract-cad';

let outDir: string;
let doc: Document;
let meta: { tufts: number[][]; tuftFaceZ: number; roles: Record<string, string> };

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'extract-cad-'));
  await extractCad('legacy/index.html', outDir);
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  doc = await io.read(join(outDir, 'brush.glb'));
  meta = JSON.parse(readFileSync(join(outDir, 'brush-meta.json'), 'utf8'));
}, 120_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

test('glb keeps every vertex and triangle of the CAD', () => {
  let vertices = 0;
  let indices = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      vertices += prim.getAttribute('POSITION')!.getCount();
      indices += prim.getIndices()!.getCount();
    }
  }
  expect(vertices).toBe(353564);
  expect(indices / 3).toBe(615832);
});

test('meshes are named by part and role', () => {
  const names = doc.getRoot().listMeshes().map((m) => m.getName());
  expect(names).toContain('handle/body');
  expect(names).toContain('head/pad');
  expect(names).toContain('mount/insert');
});

test('meta carries tufts, tuft face and roles', () => {
  expect(meta.tufts).toHaveLength(59);
  expect(meta.tuftFaceZ).toBe(0.24);
  expect(meta.roles['handle/body']).toBe('body');
});
