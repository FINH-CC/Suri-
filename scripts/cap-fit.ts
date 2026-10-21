/**
 * Precompute the cap cavity core for each built-in head style and write src/assets/model/cap-fit.json.
 * The scene reads this for plain|ears|spots; an uploaded head gets its core computed live with the same module.
 * Run: npm run cap-fit
 */
import { writeFileSync } from 'node:fs';
import { dimFor } from '../src/data/parts';
import { capCore, capEnvelope, roundCore, type CapCore } from '../src/three/capfit';
import type { BuildCtx } from '../src/three/parts/context';
import { buildHead } from '../src/three/parts/head';
import { dispose } from '../src/three/parts/index';
import { loadCadFromGlb } from './lib/load-cad-node';

const OUT = 'src/assets/model/cap-fit.json';
const STYLES = ['plain', 'ears', 'spots'];

const { cad, meta } = await loadCadFromGlb('src/assets/model/brush.glb', 'src/assets/model/brush-meta.json');
const out: Record<string, CapCore> = {};
for (const style of STYLES) {
  const ctx: BuildCtx = { cad, dim: dimFor(meta.tuftFaceZ), tufts: meta.tufts, finish: 'matte', headStyle: style, uploads: {} };
  const head = buildHead(style, '#ffffff', ctx);
  out[style] = roundCore(capCore(capEnvelope(head)));
  dispose(head);
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${OUT}`, out);
