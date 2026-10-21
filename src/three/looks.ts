import * as THREE from 'three';
import { PARITY_RESPONSE } from './materials';
import type { MaterialResponse } from './materials';
import { PARITY_ENV, PARITY_KEY } from './renderer';
import type { EnvSpec, KeySpec, Tint, ToneCurve, Vec3 } from './renderer';
import type { BrushScene } from './scene';

/*
 * Studio looks. `b` (Product hero, chosen by Alexis in Task 19) is what ships. `parity` is the Task 18 render,
 * value for value, kept for side-by-side comparison in dev (`?look=parity`).
 * Every number a look can change lives in its row of LOOKS; nothing else in the render differs between looks.
 */

export type LookId = 'parity' | 'b';
export const LOOK_IDS: LookId[] = ['parity', 'b'];
export const DEFAULT_LOOK: LookId = 'b';

export type Look = {
  id: LookId;
  name: string;
  /** Tone curve and exposure of the stage and of every snapshot. */
  tone: ToneCurve;
  exposure: number;
  /** The PMREM studio the plastics reflect, and how strongly (scene.environmentIntensity). */
  env: EnvSpec;
  envIntensity: number;
  /** The shadow-casting key light. */
  key: KeySpec;
  /** Extra directional lights, no shadows (rim lights). */
  rims: { colour: Tint; intensity: number; pos: Vec3 }[];
  /**
   * Key light shadow: map type and size, softness (radius; VSM blur samples), bias, darkness, light-space extent.
   * A VSM look falls back to PCF where the GPU cannot render to float targets (see BrushScene.setLook).
   */
  shadow: {
    type: THREE.ShadowMapType;
    mapSize: number;
    radius: number;
    blurSamples: number;
    bias: number;
    normalBias: number;
    intensity: number;
    frustum: { left: number; right: number; top: number; bottom: number };
  };
  /** Screen-space ambient occlusion: sampling radius (world units), depth bias, darkness. */
  ssao: { radius: number; bias: number; strength: number };
  /**
   * Contact shadow under the base: which box seats it ('r128' = the legacy box whose floor sits under the bristle
   * lathe; 'true' = the meshes' real box without the instanced tufts), centre/30%/edge opacity, size against the
   * brush width, how far under the box it sits, and the opacities used when the floor shadow is unavailable.
   */
  contact: {
    box: 'r128' | 'true';
    alpha: [number, number, number];
    fallbackAlpha: [number, number, number];
    scale: number;
    drop: number;
  };
  /**
   * A transparent floor that only shows the key light's shadow (null = none). It fades out from `fade[0]` to
   * `fade[1]` brush widths from the base; distances along the shadow's direction count `stretch` times, so the long
   * tail of a low light never reaches the edge of the shadow map.
   */
  ground: { opacity: number; fade: [number, number]; stretch: number } | null;
  /** Stage pixel ratio = clamp(devicePixelRatio, min, max), also capped so the canvas fits the max texture size. */
  pixelRatio: [number, number];
  /** How the plastics answer the light (src/three/materials.ts). */
  material: MaterialResponse;
};

const PARITY: Look = {
  id: 'parity',
  name: 'Parity (today)',
  tone: 'neutral',
  exposure: 1.05,
  env: PARITY_ENV,
  envIntensity: 1,
  key: PARITY_KEY,
  rims: [],
  shadow: {
    type: THREE.PCFShadowMap,
    mapSize: 2048,
    radius: 6,
    blurSamples: 8,
    bias: -0.0004,
    normalBias: 0.03,
    intensity: 1,
    frustum: { left: -9, right: 9, top: 15, bottom: -15 },
  },
  ssao: { radius: 0.45, bias: 0.015, strength: 0.42 },
  contact: { box: 'r128', alpha: [0.38, 0.16, 0], fallbackAlpha: [0.38, 0.16, 0], scale: 1.7, drop: 0.02 },
  ground: null,
  pixelRatio: [0, 2],
  material: PARITY_RESPONSE,
};

/*
 * b: Product hero. A stronger key against dimmer fills models the form; bright rim strips and two rim lights cut the
 * silhouette from the backdrop; a soft floor shadow (VSM) pools under the base and fades out within a brush width or
 * two. Materials a touch more real: clear-coated Satin, faint roughness grain on Matte, velvety silicone, crisper
 * steel, lighter bristles.
 */
const HERO: Look = {
  ...PARITY,
  id: 'b',
  name: 'Product hero',
  exposure: 1.02,
  env: {
    room: 0.3,
    tint: [1, 0.98, 0.96],
    sigma: 0.022,
    panels: [
      { w: 22, h: 44, pos: [-22, 16, 16], i: 3.0, tint: [1, 0.99, 0.97] }, // key softbox
      { w: 26, h: 32, pos: [6, 0, 28], i: 0.42 }, // front fill, dimmer: more form
      { w: 14, h: 34, pos: [24, 0, 10], i: 0.22 }, // right fill, dimmer
      { w: 36, h: 32, pos: [-4, 28, 6], i: 1.4 }, // top
      { w: 5, h: 48, pos: [-20, 4, -16], i: 3.2 }, // rim left-back, brighter and wider: edge highlights
      { w: 5, h: 48, pos: [22, 4, -14], i: 3.4 }, // rim right-back
      { w: 50, h: 50, pos: [0, -27, 4], i: 0.38, tint: [1, 0.95, 0.93] }, // floor bounce
    ],
  },
  key: { colour: PARITY_KEY.colour, intensity: 0.6 * Math.PI, pos: [-14, 38, 14] }, // higher: a short floor shadow
  rims: [
    { colour: [1, 1, 1], intensity: 1.1, pos: [-18, 14, -26] },
    { colour: [0.96, 0.98, 1], intensity: 1.3, pos: [22, 10, -22] },
  ],
  shadow: {
    type: THREE.VSMShadowMap, // evenly blurred edges; the floor pool has no hard rim
    mapSize: 2048,
    radius: 20,
    blurSamples: 16,
    bias: -0.0002,
    normalBias: 0.02,
    intensity: 1,
    frustum: { left: -11, right: 11, top: 17, bottom: -17 }, // the brush plus the faded floor pool
  },
  ssao: { radius: 0.5, bias: 0.015, strength: 0.48 },
  contact: { box: 'true', alpha: [0.4, 0.16, 0], fallbackAlpha: [0.5, 0.22, 0], scale: 1.3, drop: 0.01 },
  ground: { opacity: 0.28, fade: [0, 1.8], stretch: 1.8 },
  pixelRatio: [1.5, 2],
  material: {
    roughness: 0.92,
    specular: 1.15,
    sheen: 0.45, // velvety silicone edges
    satin: { roughness: 0.3, clearcoat: 0.45, clearcoatRoughness: 0.08, siliconeClearcoat: 0.12 },
    matteGrain: 0.07,
    silicone: { roughnessAdd: 0.08, sheenRoughness: 0.5 },
    metal: { roughness: 0.16, envMapIntensity: 1.5 },
    bristle: { roughness: 0.68, sheen: 0.5, clearcoat: 0, lift: 0.06 },
  },
};

export const LOOKS: Record<LookId, Look> = { parity: PARITY, b: HERO };

export const isLookId = (v: unknown): v is LookId => typeof v === 'string' && (LOOK_IDS as string[]).includes(v);

/** Apply a look to the stage (and, through the scene, to every later snapshot). */
export function applyLook(scene: BrushScene, id: LookId): void {
  scene.setLook(LOOKS[id]);
}
