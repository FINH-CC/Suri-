import * as THREE from 'three';
import { BRISTLE, mixHex } from '../data/palette';
import { addPatch, lin } from './materials';
import { WORDMARK_MASK } from './wordmark-mask';

/*
 * Task 22: the small details of the client's product renders, drawn in the shaders from object-space position (the
 * CAD has no UVs): the SURI deboss on the lower handle (the grip sleeve), the indicator dot, the hairline seam where
 * the head meets the handle, and the bristle tufts (shape, baked occlusion, a hint of the head colour at the tip).
 * Every number that places a detail on the CAD is measured from src/assets/model/brush.glb (Task 22 report).
 */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/* ---------- bristles ---------- */

/*
 * Bristles after the client's reference (docs/reference/render-match/client-bristles-reference.png): rows of fat,
 * solid, rounded bundles standing straight up, bright white glossy domed tips, gentle grey on their sides and dark
 * gaps between rows toward the pad. The head colour only hints at the very tips.
 */

/** Where the tip tint starts (fraction of the tuft length from the base) and how far toward the head colour it goes. */
export const TIP_START = 0.9;
export const TIP_STRENGTH = 0.22;

/** Tuft colour at `t` along its length (0 base, 1 tip): off-white, with a subtle hint of the head colour at the tip. */
export function tipTint(t: number, headHex: string): string {
  return mixHex(BRISTLE, headHex, TIP_STRENGTH * smooth(TIP_START, 1, t));
}

/**
 * Baked occlusion down a tuft (0 base, 1 tip): the gaps between tufts darken toward the pad, the tips stay full
 * white: 0.12 at the base, about 0.4 halfway, 1 from 95% of the length.
 */
export function tuftShade(t: number): number {
  return 0.12 + 0.88 * Math.pow(smooth(0, 0.95, t), 1.8);
}

/** A `color` attribute for a tuft geometry that grows along +z from 0 to `len`: tip tint times baked occlusion, linear. */
export function tintTuft(geo: THREE.BufferGeometry, len: number, headHex: string): THREE.BufferGeometry {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(Math.max(p.getZ(i) / len, 0), 1);
    c.set(tipTint(t, headHex)).multiplyScalar(tuftShade(t)); // sRGB hex -> linear, then occlusion
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** A faint lengthwise strand texture down a tuft's sides (solid bundles, not noisy filaments), varied per tuft. */
export function filaments<M extends THREE.Material>(len: number, mat: M): M {
  return addPatch(mat, 'filaments', (sh) => {
    sh.vertexShader =
      'varying vec3 vFilP;\nvarying float vFilI;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFilP = position;\n  vFilI = float( gl_InstanceID );');
    sh.fragmentShader =
      `varying vec3 vFilP;\nvarying float vFilI;
float filShade() {
  float a = atan( vFilP.y, vFilP.x ) * 9.5493 + vFilI * 3.7, k = floor( a );
  float h = fract( sin( k * 12.9898 + vFilI * 78.233 ) * 43758.5453 );
  return 1. - .05 * h * ( 1. - smoothstep( .9, .97, vFilP.z / ${len.toFixed(4)} ) );
}
` +
      sh.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse, opacity );\n  diffuseColor.rgb *= filShade();',
      );
  });
}

/* ---------- wordmark deboss ---------- */

/** Wordmark placement on the front of a part: bottom of the text (y), its right edge (x, the letters' feet), length, width. */
export type WordmarkRect = { y0: number; x1: number; len: number; wid: number };

/** Decode the generated mask (src/three/wordmark-mask.ts) to one byte per pixel, rows top to bottom. */
export function decodeMask(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * The deboss texture from a coverage mask (w x h, rows top to bottom): a 3x3 blur rounds the letter walls, then
 * R and G carry the coverage gradient along the text (s, left to right) and across it (t, bottom to top),
 * normalised to the strongest edge and stored as 128 + 127 * g; B carries the blurred coverage; A is 255.
 * Rows are written bottom first, so with `flipY` off texture t = 0 is the letters' feet.
 */
export function wordmarkTexels(mask: Uint8Array, w: number, h: number): Uint8Array {
  const at = (x: number, y: number) => mask[Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)] / 255;
  const blur = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += at(x + dx, y + dy) * (dx || dy ? (dx && dy ? 1 : 2) : 4);
      blur[y * w + x] = s / 16;
    }
  const b = (x: number, y: number) => blur[Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)];
  const gs = new Float32Array(w * h), gt = new Float32Array(w * h);
  let max = 1e-6;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      gs[i] = (b(x + 1, y) - b(x - 1, y)) / 2;
      gt[i] = (b(x, y - 1) - b(x, y + 1)) / 2; // image rows run downwards; t runs up
      max = Math.max(max, Math.abs(gs[i]), Math.abs(gt[i]));
    }
  const out = new Uint8Array(w * h * 4);
  const enc = (v: number) => Math.round(128 + 127 * Math.max(-1, Math.min(1, v / max)));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = ((h - 1 - y) * w + x) * 4;
      out[o] = enc(gs[i]);
      out[o + 1] = enc(gt[i]);
      out[o + 2] = Math.round(blur[i] * 255);
      out[o + 3] = 255;
    }
  return out;
}

let wmTex: THREE.DataTexture | null = null;
/** The shared deboss texture (built once, never disposed with a part: it lives in a uniform, not `map`). */
export function wordmarkTexture(): THREE.DataTexture {
  if (wmTex) return wmTex;
  const { w, h, data } = WORDMARK_MASK;
  const t = new THREE.DataTexture(wordmarkTexels(decodeMask(data), w, h), w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return (wmTex = t);
}

/**
 * The wordmark aspect (length / width) of the mask, so a rect keeps the letters' proportions. 6.03 for the SURI logo
 * in a 192 x 32 mask with 4 px side margins: the text fills the length and about 94% of the width.
 */
export const WORDMARK_ASPECT = WORDMARK_MASK.w / WORDMARK_MASK.h;

/** A wordmark rect `len` long, reading bottom to top, centred on x = 0 with its bottom at `y0`. */
export const wordmarkRect = (y0: number, len: number): WordmarkRect => {
  const wid = len / WORDMARK_ASPECT;
  return { y0, x1: wid / 2, len, wid };
};

/**
 * "SURI" debossed on the front (+z) of a part, tone-on-tone: the letter walls bend the normal (and the clear coat's),
 * the letter floors are a little darker and less glossy. Object-space projection onto the xy plane.
 */
export function deboss<M extends THREE.Material>(mat: M, r: WordmarkRect, depth = 0.55, tone = 0.11): M {
  const uniforms = {
    wmMap: { value: wordmarkTexture() },
    wmRect: { value: new THREE.Vector4(r.y0, r.x1, r.len, r.wid) },
  };
  return addPatch(mat, 'deboss', (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader =
      'varying vec3 vWmP;\nvarying vec3 vWmN;\nvarying vec3 vWmT;\nvarying vec3 vWmB;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vWmP = position; vWmN = objectNormal;
  vWmT = normalize( normalMatrix * vec3( 1., 0., 0. ) ); vWmB = normalize( normalMatrix * vec3( 0., 1., 0. ) );`,
      );
    const look = `uniform sampler2D wmMap;\nuniform vec4 wmRect;\nvarying vec3 vWmP;\nvarying vec3 vWmN;\nvarying vec3 vWmT;\nvarying vec3 vWmB;
vec3 wmLook() {
  vec2 st = vec2( ( vWmP.y - wmRect.x ) / wmRect.z, ( wmRect.y - vWmP.x ) / wmRect.w );
  float inside = step( 0., st.x ) * step( st.x, 1. ) * step( 0., st.y ) * step( st.y, 1. ) * step( .3, vWmN.z ) * step( 0., vWmP.z );
  vec4 t = texture2D( wmMap, st );
  return vec3( t.rg * 2. - 1., t.b ) * inside;
}
vec3 wmBend( vec3 n, vec3 wm ) { return normalize( n + ${depth.toFixed(3)} * ( wm.x * vWmB - wm.y * vWmT ) ); }
`;
    sh.fragmentShader =
      look +
      sh.fragmentShader
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );\n  vec3 wm = wmLook();\n  diffuseColor.rgb *= 1. - ${tone.toFixed(3)} * wm.z;`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = min( 1., roughnessFactor + .12 * wm.z );')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = wmBend( normal, wm );')
        .replace(
          '#include <clearcoat_normal_fragment_maps>',
          '#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\n  clearcoatNormal = wmBend( clearcoatNormal, wm );\n#endif',
        );
  });
}

/* ---------- colour utility ---------- */

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** HSL (h in degrees) of an sRGB hex, as given. */
export function hexHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

/* ---------- handle and head ---------- */

/** The indicator dot (the LED pinhole above the button), measured from the CAD: centre and radius. */
export const DOT = { x: 0, y: 12.8, r: 0.08 };
/** The pinhole itself: radius and depth range of the hole through the shell (z 0.74 to 0.90). */
export const PINHOLE = { r: 0.052, z: 0.78 };

/** A dark lens closing the pinhole, so the dot reads solid instead of showing what is behind the handle. */
export function pinholeLens(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(PINHOLE.r * 1.15, 24),
    new THREE.MeshStandardMaterial({ color: lin('#1c1c1c'), roughness: 0.35, metalness: 0 }),
  );
  m.position.set(DOT.x, DOT.y, PINHOLE.z);
  return m;
}
/** Where the head meets the handle: the head's lower lip sits at y 14.446 over the handle top. */
export const SEAM_Y = 14.446;

/**
 * Handle body: the dark indicator dot on the front and the handle's side of the seam hairline. The CAD's pinhole goes
 * through the shell, so the dot also darkens the inside of the back wall seen through it (faces turned toward +z).
 */
export function handleDetails<M extends THREE.Material>(mat: M): M {
  return addPatch(mat, 'handle-details', (sh) => {
    sh.vertexShader =
      'varying vec3 vHdP;\nvarying float vHdNz;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHdP = position; vHdNz = objectNormal.z;');
    sh.fragmentShader =
      'varying vec3 vHdP;\nvarying float vHdNz;\n' +
      sh.fragmentShader
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
  float hdDot = ( 1. - smoothstep( ${(DOT.r - 0.02).toFixed(3)}, ${DOT.r.toFixed(3)}, length( vHdP.xy - vec2( ${DOT.x.toFixed(3)}, ${DOT.y.toFixed(3)} ) ) ) ) * step( 0., vHdNz );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( .022 ), hdDot );
  diffuseColor.rgb *= 1. - .6 * smoothstep( ${(SEAM_Y - 0.05).toFixed(3)}, ${SEAM_Y.toFixed(3)}, vHdP.y );`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, .55, hdDot );');
  });
}

/** Head: its side of the seam hairline, a thin darker band along the lower lip. */
export function headSeam<M extends THREE.Material>(mat: M): M {
  return addPatch(mat, 'head-seam', (sh) => {
    sh.vertexShader =
      'varying vec3 vHsP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHsP = position;');
    sh.fragmentShader =
      'varying vec3 vHsP;\n' +
      sh.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
  diffuseColor.rgb *= 1. - .6 * ( 1. - smoothstep( ${SEAM_Y.toFixed(3)}, ${(SEAM_Y + 0.03).toFixed(3)}, vHsP.y ) );`,
      );
  });
}
