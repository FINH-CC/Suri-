import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { PartId } from '../data/parts';

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_TRIANGLES = 500_000;

export const UPLOAD_COPY = {
  notStl: 'That file could not be read as an STL',
  tooBig: 'That file is too big (max 20 MB, 500k triangles)',
  loaded: 'Part loaded. It stays in this browser.',
} as const;

const notStl = () => new Error('not-stl');
const tooBig = () => new Error('too-big');

/** True when the first bytes (after an optional byte-order mark) read "solid", as the STLLoader checks. */
function looksAscii(buf: ArrayBuffer): boolean {
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 16)));
  return /^\W{0,5}solid/.test(head);
}

/**
 * An uploaded STL as a part geometry, scaled to fit and centred in `reference` (legacy 1309-1325).
 * Throws `Error('too-big')` over 20 MB or 500k triangles (checked from the binary header before parsing),
 * `Error('not-stl')` when it cannot be read.
 */
export function parseStl(buf: ArrayBuffer, part: PartId, reference: THREE.Box3): THREE.BufferGeometry {
  if (buf.byteLength > MAX_BYTES) throw tooBig();
  const binary = buf.byteLength >= 84 && 84 + new DataView(buf).getUint32(80, true) * 50 === buf.byteLength;
  if (!binary && !looksAscii(buf)) {
    // not text either: a binary header that claims too much, or junk
    if (buf.byteLength >= 84 && new DataView(buf).getUint32(80, true) > MAX_TRIANGLES) throw tooBig();
    throw notStl();
  }
  if (binary && new DataView(buf).getUint32(80, true) > MAX_TRIANGLES) throw tooBig();

  let geo: THREE.BufferGeometry;
  try {
    geo = new STLLoader().parse(buf);
  } catch {
    throw notStl();
  }
  const pos = geo.attributes.position;
  if (!pos || pos.count < 3) { geo.dispose(); throw notStl(); }
  if (pos.count / 3 > MAX_TRIANGLES) { geo.dispose(); throw tooBig(); }
  for (let i = 0; i < pos.array.length; i++) {
    if (!Number.isFinite(pos.array[i])) { geo.dispose(); throw notStl(); }
  }

  geo.computeBoundingBox();
  let sz = geo.boundingBox!.getSize(new THREE.Vector3());
  // lying down (Z-up exports): stand it up, except the mount which faces forwards
  if (part !== 'mount' && sz.z > sz.y * 1.2) {
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    sz = geo.boundingBox!.getSize(new THREE.Vector3());
  }
  const rs = reference.getSize(new THREE.Vector3()), rc = reference.getCenter(new THREE.Vector3());
  let k = Math.min(...[rs.x / sz.x, rs.y / sz.y, rs.z / sz.z].filter(Number.isFinite)) * 0.98;
  if (!Number.isFinite(k) || k <= 0) k = 1;
  geo.scale(k, k, k);
  geo.computeBoundingBox();
  const gc = geo.boundingBox!.getCenter(new THREE.Vector3());
  geo.translate(rc.x - gc.x, rc.y - gc.y, rc.z - gc.z);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}
