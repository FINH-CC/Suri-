/**
 * Extract the client CAD embedded in legacy/index.html (`<script id="cad-data">`)
 * into public/model/brush.glb + public/model/brush-meta.json.
 *
 * Decoding mirrors legacy/index.html lines 744-772 (b64, gunzip, buildCadGeo):
 * positions Uint16 dequantised as q/65535*size+min (scene units = 10 mm),
 * normals Int16 (/32767) or Int8 (/127) copied as-is (never recomputed),
 * indices Uint32 or Uint16 preserved.
 *
 * Compression: quantize({ quantizePosition: 14, quantizeNormal: 10 }) then
 * meshopt({ level: 'medium' }). No simplify applied.
 * Size (npm run extract-cad, 2026-10-20): raw 3 075 244 bytes, gzip -9 1 829 689 bytes
 * (budget 2 621 440).
 *
 * Run: npm run extract-cad
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Document, Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

interface CadSub {
  role: string;
  min: number[];
  size: number[];
  pos: string;
  nrm: string;
  idx: string;
  n16?: boolean;
  i32?: boolean;
  gz?: boolean;
}

interface CadData {
  handle: CadSub[];
  head: CadSub[];
  mount: CadSub[];
  tufts: number[][];
  tuftFaceZ: number;
  gripProfile: unknown;
}

const PARTS = ['handle', 'head', 'mount'] as const;
const NAMED_ROLES: Record<(typeof PARTS)[number], string[]> = {
  handle: ['body', 'button', 'seal'],
  head: [],
  mount: ['body', 'insert'],
};
const FALLBACK: Record<(typeof PARTS)[number], string> = {
  handle: 'metal',
  head: 'pad',
  mount: 'other',
};

function readCadJson(htmlPath: string): CadData {
  const html = readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('<script id="cad-data"');
  if (start < 0) throw new Error(`no <script id="cad-data"> in ${htmlPath}`);
  const open = html.indexOf('>', start) + 1;
  const close = html.indexOf('</script>', open);
  if (close < 0) throw new Error(`<script id="cad-data"> in ${htmlPath} has no closing </script>`);
  const cad = JSON.parse(html.slice(open, close)) as CadData;
  for (const part of PARTS) {
    if (!Array.isArray(cad[part])) throw new Error(`cad-data in ${htmlPath} has no "${part}" array`);
  }
  return cad;
}

/**
 * base64 (optionally gzip-packed) → bytes in an ArrayBuffer of exactly that length.
 * Node Buffers are views on a larger (pooled / gunzip) backing store, so copy out.
 */
function decodeField(sub: CadSub, key: 'pos' | 'nrm' | 'idx'): ArrayBuffer {
  let bytes: Uint8Array = Buffer.from(sub[key], 'base64');
  if (sub.gz) bytes = gunzipSync(bytes);
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out.buffer;
}

function meshNames(part: (typeof PARTS)[number], subs: CadSub[]): string[] {
  if (part === 'head') return subs.map((_, i) => (i === 0 ? 'head/pad' : `head/pad-${i}`));
  let n = 0;
  return subs.map((sub) =>
    NAMED_ROLES[part].includes(sub.role) ? `${part}/${sub.role}` : `${part}/${FALLBACK[part]}-${n++}`,
  );
}

export async function extractCad(legacyHtmlPath: string, outDir: string): Promise<void> {
  const cad = readCadJson(legacyHtmlPath);
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  const buffer = doc.createBuffer();
  const scene = doc.createScene('brush');
  const roles: Record<string, string> = {};

  for (const part of PARTS) {
    const subs = cad[part];
    const names = meshNames(part, subs);
    subs.forEach((sub, s) => {
      const name = names[s];
      if (roles[name] !== undefined) throw new Error(`duplicate mesh name ${name}`);
      roles[name] = sub.role;

      const q = new Uint16Array(decodeField(sub, 'pos'));
      const pos = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) {
        const k = i % 3;
        pos[i] = (q[i] / 65535) * sub.size[k] + sub.min[k];
      }
      const nb = decodeField(sub, 'nrm');
      const n = sub.n16 ? new Int16Array(nb) : new Int8Array(nb);
      const ns = sub.n16 ? 32767 : 127;
      const nrm = new Float32Array(n.length);
      for (let i = 0; i < n.length; i++) nrm[i] = n[i] / ns;
      if (pos.length % 3 !== 0 || nrm.length !== pos.length) {
        throw new Error(`${name}: ${pos.length / 3} positions vs ${nrm.length / 3} normals`);
      }
      const ib = decodeField(sub, 'idx');
      const idx = sub.i32 ? new Uint32Array(ib) : new Uint16Array(ib);

      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
      const mesh = doc.createMesh(name).addPrimitive(prim);
      scene.addChild(doc.createNode(name).setMesh(mesh));
    });
  }

  await MeshoptEncoder.ready;
  await doc.transform(
    quantize({ quantizePosition: 14, quantizeNormal: 10 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  mkdirSync(outDir, { recursive: true });
  await io.write(join(outDir, 'brush.glb'), doc);

  const meta = { tufts: cad.tufts, tuftFaceZ: cad.tuftFaceZ, gripProfile: cad.gripProfile, roles };
  writeFileSync(join(outDir, 'brush-meta.json'), JSON.stringify(meta, null, 2) + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await extractCad('legacy/index.html', 'public/model');
  console.log('wrote public/model/brush.glb and public/model/brush-meta.json');
}
