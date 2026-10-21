import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAX_BYTES, MAX_TRIANGLES, parseStl } from '../../src/ui/upload';

/** A binary STL: 80-byte header, uint32 count, then 50 bytes per triangle (normal, 3 vertices, attribute). */
function binaryStl(tris: number[][][], claimed = tris.length): ArrayBuffer {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const v = new DataView(buf);
  v.setUint32(80, claimed, true);
  tris.forEach((t, i) => {
    const o = 84 + i * 50 + 12; // normal left at 0,0,0
    t.forEach((p, j) => p.forEach((c, k) => v.setFloat32(o + j * 12 + k * 4, c, true)));
  });
  return buf;
}

/** An axis-aligned box from (0,0,0) to (sx,sy,sz) as 12 triangles. */
function box(sx: number, sy: number, sz: number): number[][][] {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  g.translate(sx / 2, sy / 2, sz / 2);
  const p = g.attributes.position, out: number[][][] = [];
  for (let i = 0; i < p.count; i += 3) out.push([0, 1, 2].map((j) => [p.getX(i + j), p.getY(i + j), p.getZ(i + j)]));
  return out;
}

describe('parseStl', () => {
  const reference = new THREE.Box3(new THREE.Vector3(-1, 2, -1), new THREE.Vector3(1, 6, 1)); // 2 x 4 x 2, centre (0,4,0)

  it('parses a 12-triangle cube to 36 positions, scaled to fit and centred in the reference box', () => {
    const tris = box(10, 10, 10);
    expect(tris).toHaveLength(12);
    const geo = parseStl(binaryStl(tris), 'grip', reference);
    expect(geo.attributes.position.count).toBe(36);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    // limited by the 2-unit width: 2 * 0.98
    expect(size.x).toBeCloseTo(1.96, 4);
    expect(size.y).toBeCloseTo(1.96, 4);
    expect(size.z).toBeCloseTo(1.96, 4);
    expect(c.x).toBeCloseTo(0, 4);
    expect(c.y).toBeCloseTo(4, 4);
    expect(c.z).toBeCloseTo(0, 4);
    expect(geo.attributes.normal).toBeDefined();
  });

  it('rejects text that is not an STL with not-stl', () => {
    const buf = new TextEncoder().encode('hello').buffer as ArrayBuffer;
    expect(() => parseStl(buf, 'cap', reference)).toThrow('not-stl');
  });

  it('rejects a header claiming 600000 triangles with too-big, before allocating', () => {
    expect(600_000).toBeGreaterThan(MAX_TRIANGLES);
    const buf = binaryStl([], 600_000); // 84 bytes: the claim alone, no triangle data
    expect(() => parseStl(buf, 'cap', reference)).toThrow('too-big');
  });

  it('rejects a buffer over 20 MB with too-big', () => {
    expect(MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(() => parseStl(new ArrayBuffer(MAX_BYTES + 1), 'cap', reference)).toThrow('too-big');
  });
});
