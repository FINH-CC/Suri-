import * as THREE from 'three';
import { PARITY_RESPONSE } from './materials';
import type { MaterialResponse } from './materials';
import { PARITY_ENV, PARITY_KEY } from './renderer';
import type { EnvSpec, KeySpec, Tint, ToneCurve, Vec3 } from './renderer';
import type { BrushScene } from './scene';

/*
 * Studio looks (Task 19). `parity` is the Task 18 render, value for value; a, b and c are the three candidate
 * looks Alexis chooses between. Production stays on `parity` until a look is chosen; in dev `?look=a|b|c` switches.
 * Every number a look can change lives in its row of LOOKS, nothing else in the render differs between looks.
 */

export type LookId = 'parity' | 'a' | 'b' | 'c';
export const LOOK_IDS: LookId[] = ['parity', 'a', 'b', 'c'];

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
  /** Key light shadow: map type and size, softness (radius; VSM blur samples), bias, darkness, light-space extent. */
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
   * brush width, and how far under the box it sits.
   */
  contact: { box: 'r128' | 'true'; alpha: [number, number, number]; scale: number; drop: number };
  /** A transparent floor that only shows the key light's shadow, fading out between fade[0] and fade[1] units from the base (null = none). */
  ground: { opacity: number; fade: [number, number] } | null;
  /** Stage pixel ratio = clamp(devicePixelRatio, min, max): a min above 1 supersamples on 1x screens. */
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
  contact: { box: 'r128', alpha: [0.38, 0.16, 0], scale: 1.7, drop: 0.02 },
  ground: null,
  pixelRatio: [0, 2],
  material: PARITY_RESPONSE,
};

/* a: Soft studio. A bigger, higher softbox and a brighter overhead give a long top-down gradient; VSM shadows blur
   evenly (no PCF grain); the contact shadow is seated under the real base; a little more crease occlusion. */
const SOFT: Look = {
  ...PARITY,
  id: 'a',
  name: 'Soft studio',
  env: {
    room: 0.4,
    tint: [1, 0.975, 0.95],
    sigma: 0.04,
    panels: [
      { w: 36, h: 56, pos: [-20, 22, 18], i: 2.3, tint: [1, 0.99, 0.97] }, // key softbox: larger and higher
      { w: 34, h: 34, pos: [6, -2, 28], i: 0.7 }, // front fill
      { w: 20, h: 40, pos: [24, 2, 10], i: 0.5 }, // right fill
      { w: 50, h: 44, pos: [-2, 30, 4], i: 2.6 }, // broad overhead: the top-down gradient
      { w: 4, h: 44, pos: [-20, 4, -16], i: 1.3 }, // rim left-back
      { w: 4, h: 44, pos: [22, 4, -14], i: 1.4 }, // rim right-back
      { w: 50, h: 50, pos: [0, -27, 4], i: 0.3, tint: [1, 0.95, 0.93] }, // floor bounce, lower: tops read brighter than bases
    ],
  },
  key: { colour: PARITY_KEY.colour, intensity: 0.42 * Math.PI, pos: [-16, 34, 16] },
  shadow: {
    ...PARITY.shadow,
    type: THREE.VSMShadowMap,
    mapSize: 2048,
    radius: 14,
    blurSamples: 16,
    bias: -0.0002,
    normalBias: 0.02,
    intensity: 0.85,
  },
  ssao: { radius: 0.6, bias: 0.015, strength: 0.58 },
  contact: { box: 'true', alpha: [0.34, 0.14, 0], scale: 1.45, drop: 0.01 },
  pixelRatio: [1.5, 2],
};

/* b: Product hero. A stronger key against dimmer fills models the form; bright rim strips and two rim lights cut the
   silhouette from the backdrop; tighter, glossier satin; a floor catches the key shadow. */
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
    ...PARITY.shadow,
    mapSize: 4096,
    radius: 10,
    frustum: { left: -20, right: 20, top: 26, bottom: -26 },
  },
  ssao: { radius: 0.5, bias: 0.015, strength: 0.48 },
  contact: { box: 'true', alpha: [0.4, 0.16, 0], scale: 1.3, drop: 0.01 },
  ground: { opacity: 0.15, fade: [0.5, 5] },
  pixelRatio: [1.5, 2],
  material: {
    roughness: 0.92,
    specular: 1.15,
    sheen: 0.32,
    satin: { roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.16 },
  },
};

/* c: Bright & playful. Higher key, lifted fills and a warm bounce so nothing goes grey; very soft, light shadows;
   barely any occlusion; colours kept true by keeping the light itself near-white. */
const BRIGHT: Look = {
  ...PARITY,
  id: 'c',
  name: 'Bright & playful',
  exposure: 1.12,
  env: {
    room: 0.55,
    tint: [1, 0.97, 0.93],
    sigma: 0.05,
    panels: [
      { w: 36, h: 52, pos: [-20, 18, 18], i: 2.2, tint: [1, 0.985, 0.96] }, // key softbox
      { w: 40, h: 40, pos: [6, 0, 28], i: 1.0 }, // front fill, brighter
      { w: 24, h: 40, pos: [24, 0, 10], i: 0.75 }, // right fill, brighter: no grey side
      { w: 50, h: 40, pos: [-4, 28, 6], i: 1.8 }, // top
      { w: 4, h: 44, pos: [-20, 4, -16], i: 1.2 }, // rim left-back
      { w: 4, h: 44, pos: [22, 4, -14], i: 1.2 }, // rim right-back
      { w: 56, h: 56, pos: [0, -27, 4], i: 0.75, tint: [1, 0.94, 0.88] }, // warm floor bounce
    ],
  },
  envIntensity: 1.05,
  key: { colour: [1, 0.96, 0.9], intensity: 0.4 * Math.PI, pos: [-18, 30, 20] },
  shadow: {
    ...PARITY.shadow,
    type: THREE.VSMShadowMap,
    mapSize: 2048,
    radius: 20,
    blurSamples: 16,
    bias: -0.0002,
    normalBias: 0.02,
    intensity: 0.55,
  },
  ssao: { radius: 0.4, bias: 0.015, strength: 0.2 },
  contact: { box: 'true', alpha: [0.24, 0.09, 0], scale: 1.6, drop: 0.01 },
  pixelRatio: [1.5, 2],
};

export const LOOKS: Record<LookId, Look> = { parity: PARITY, a: SOFT, b: HERO, c: BRIGHT };

export const isLookId = (v: unknown): v is LookId => typeof v === 'string' && (LOOK_IDS as string[]).includes(v);

/** Apply a look to the stage (and, through the scene, to every later snapshot). */
export function applyLook(scene: BrushScene, id: LookId, override?: Partial<Look>): void {
  scene.setLook(override ? { ...LOOKS[id], ...override } : LOOKS[id]);
}
