import * as THREE from 'three';
import { lum, mixHex } from '../data/palette';
import type { FinishId } from '../data/parts';

export { mixHex, lum };

/**
 * Palette hex -> linear working colour. With ColorManagement on (the default), `new Color(hex)`
 * already converts sRGB -> linear, which is what r128's `convertSRGBToLinear()` did by hand.
 */
export const lin = (hex: string): THREE.Color => new THREE.Color(hex);

// Real white plastic reflects ~80% of light, not 100%. Very light colours are eased down a little so the
// key light can still build a gradient across them instead of saturating to flat white. Mid and dark colours are untouched.
export function surfaceColour(hex: string): THREE.Color {
  const c = lin(hex);
  const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const t = Math.min(Math.max((L - 0.45) / (0.9 - 0.45), 0), 1);
  const k = 1 - 0.2 * t * t * (3 - 2 * t); // smoothstep: 1.0 at mid tones -> 0.8 at near-white
  return c.multiplyScalar(k);
}

/**
 * How the plastics answer the light, set by the active look (Task 19, `src/three/looks.ts`). Read when a material is
 * built, so a look change rebuilds the parts. The parity values reproduce the Task 18 render exactly.
 * - `roughness`: multiplies every plastic's roughness (1 = as authored).
 * - `specular`: specularIntensity of the plastics (dielectric reflectance at normal incidence, 1 = from the ior).
 * - `sheen`: the silicone parts' grazing sheen.
 * - `satin`: the Satin finish (roughness, clear coat, clear coat roughness); silicone parts take `siliconeClearcoat`;
 *   `specular` (optional) is the hard plastics' specularIntensity under Satin, for the renders' glossier reflections.
 * - `matteGrain`: amplitude of a faint roughness variation on Matte hard plastics (0 = none). Roughness only, never colour.
 * - `silicone`: roughness added to the silicone parts (cap, grip) and their sheen roughness (null = follows roughness).
 * - `metal`: roughness and environment strength of the metal parts.
 * - `bristle`: the filament material (roughness, sheen, clear coat) and `lift`, a faint self-light that lightens and
 *   flattens their shading (a translucency feel without a transmission pass).
 */
export type MaterialResponse = {
  roughness: number;
  specular: number;
  sheen: number;
  satin: { roughness: number; clearcoat: number; clearcoatRoughness: number; siliconeClearcoat: number; specular?: number };
  matteGrain: number;
  silicone: { roughnessAdd: number; sheenRoughness: number | null };
  metal: { roughness: number; envMapIntensity: number };
  bristle: { roughness: number; sheen: number; clearcoat: number; lift: number };
};
export const PARITY_RESPONSE: MaterialResponse = {
  roughness: 1,
  specular: 1,
  sheen: 0.32,
  satin: { roughness: 0.36, clearcoat: 0.3, clearcoatRoughness: 0.28, siliconeClearcoat: 0.3 },
  matteGrain: 0,
  silicone: { roughnessAdd: 0, sheenRoughness: null },
  metal: { roughness: 0.3, envMapIntensity: 1 },
  bristle: { roughness: 0.55, sheen: 0.35, clearcoat: 0.15, lift: 0 },
};
let response: MaterialResponse = PARITY_RESPONSE;
export const setMaterialResponse = (r: MaterialResponse): void => {
  response = r;
};
export const materialResponse = (): MaterialResponse => response;

/*
 * The studio environment and its strength, for materials that need their own environment strength. three r186 sets
 * envMapIntensity to scene.environmentIntensity on every standard material whose envMap is null, so a per-material
 * strength only holds when the material carries the environment itself (stage and snapshots share the same PMREM).
 */
let studioEnv: THREE.Texture | null = null;
let studioEnvIntensity = 1;
export const setStudioEnv = (tex: THREE.Texture | null, intensity: number): void => {
  studioEnv = tex;
  studioEnvIntensity = intensity;
};

/**
 * Soft-touch silicone: a faint velvety sheen at grazing angles, tinted toward white.
 * r128 `sheen: Color(c * .32)` -> current `sheen: .32, sheenColor: c`. Spread into `plastic` options.
 */
export const siliconeSheen = (hex: string): { sheen: number; sheenColor: THREE.Color } => ({
  sheen: response.sheen,
  sheenColor: lin(mixHex(hex, '#ffffff', 0.55)),
});

/** Matte bio-plastic, as in the SURI renders: high roughness, no clear coat, low reflectance. */
export const plastic = (hex: string, o: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial => {
  const m = new THREE.MeshPhysicalMaterial({
    color: surfaceColour(hex),
    roughness: 0.66,
    metalness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0.6,
    ior: 1.326, // r128 reflectivity .35: F0 = 0.16 * .35^2 = 0.0196 -> ior (1 + 0.14) / (1 - 0.14)
    ...o,
  });
  const silicone = m.sheen > 0;
  if (silicone && response.silicone.roughnessAdd) m.roughness = Math.min(1, m.roughness + response.silicone.roughnessAdd);
  if (response.roughness !== 1) m.roughness = Math.min(1, m.roughness * response.roughness);
  if (response.specular !== 1) m.specularIntensity = response.specular;
  // r128 sheen used the material's own roughness; current three has a separate sheenRoughness (default 1)
  if (silicone && o.sheenRoughness === undefined) m.sheenRoughness = response.silicone.sheenRoughness ?? m.roughness;
  return m;
};

/*
 * Shader patches compose: each material keeps an ordered list of named patches (string edits of three's physical
 * shader that keep the include they hook, so several can hook the same line). The program cache key is the list of
 * names. Finish patches (speckle, grain) are swapped by `clearFinishPatches` when the finish changes; detail patches
 * (src/three/details.ts: deboss, button rim, dot, seam, filaments) stay.
 */
type Patch = { key: string; finish: boolean; fn: (sh: THREE.WebGLProgramParametersWithUniforms) => void };
const PATCHES = new WeakMap<THREE.Material, Patch[]>();

function installPatches(mat: THREE.Material, list: Patch[]): void {
  PATCHES.set(mat, list);
  mat.onBeforeCompile = (sh) => {
    for (const p of list) p.fn(sh);
  };
  const key = list.map((p) => p.key).join('|');
  mat.customProgramCacheKey = () => key;
}

/** Add (or replace, by key) a shader patch on a material. */
export function addPatch<M extends THREE.Material>(
  mat: M,
  key: string,
  fn: Patch['fn'],
  finish = false,
): M {
  const list = (PATCHES.get(mat) ?? []).filter((p) => p.key !== key && !(finish && p.finish));
  list.push({ key, finish, fn });
  installPatches(mat, list);
  return mat;
}

/** Remove the finish patches (speckle, grain) and keep the detail patches. */
export function clearFinishPatches(mat: THREE.Material): void {
  installPatches(mat, (PATCHES.get(mat) ?? []).filter((p) => !p.finish));
}

/** Plant-based head: fine light/dark flecks, generated from position (CAD has no UVs). */
export function speckle<M extends THREE.Material>(mat: M): M {
  return addPatch(
    mat,
    'speckle',
    (sh) => {
      sh.vertexShader =
        'varying vec3 vObjPos;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vObjPos=position;');
      sh.fragmentShader =
        'varying vec3 vObjPos;\n' +
        sh.fragmentShader.replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
      { vec3 p=vObjPos*30.; vec3 ci=floor(p); float h=fract(sin(dot(ci,vec3(127.1,311.7,74.7)))*43758.5453);
        float d=length(fract(p)-.5); float fl=step(.935,h)*smoothstep(.34,.16,d);
        vec3 fc=fract(h*13.37)>.45?vec3(.42,.41,.40):vec3(1.);
        diffuseColor.rgb=mix(diffuseColor.rgb,fc*mix(vec3(1.),diffuseColor.rgb,.25),fl*.6); }`,
        );
    },
    true,
  );
}

/**
 * Matte hard plastic: a faint, smooth variation in roughness (two octaves of value noise from object position, CAD
 * has no UVs), so large flat areas catch the light a little unevenly, like moulded plastic. Colour is untouched.
 */
export function grain<M extends THREE.Material>(mat: M, amp: number): M {
  return addPatch(
    mat,
    `grain${amp}`,
    (sh) => {
      sh.vertexShader =
        'varying vec3 vGrainPos;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGrainPos=position;');
      sh.fragmentShader =
        `varying vec3 vGrainPos;
      float gH(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float gN(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(gH(i),gH(i+vec3(1,0,0)),f.x),mix(gH(i+vec3(0,1,0)),gH(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(gH(i+vec3(0,0,1)),gH(i+vec3(1,0,1)),f.x),mix(gH(i+vec3(0,1,1)),gH(i+vec3(1,1,1)),f.x),f.y),f.z);}
      ` +
        sh.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+${amp.toFixed(4)}*((gN(vGrainPos*2.)-.5)+.5*(gN(vGrainPos*9.)-.5)),.04,1.);`,
        );
    },
    true,
  );
}

/** The chosen finish, applied to the main plastic of handle, cap, grip and mount. */
export function applyFinish(m: THREE.MeshPhysicalMaterial, finish: FinishId): THREE.MeshPhysicalMaterial {
  // pre-finish values, kept so a finish-only change can re-finish the material without rebuilding (scene.refinish)
  m.userData.finishable = true;
  m.userData.base ??= { roughness: m.roughness, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness, sheenRoughness: m.sheenRoughness, specularIntensity: m.specularIntensity };
  const silicone = m.sheen > 0;
  if (finish === 'satin') {
    const s = response.satin;
    m.roughness = silicone ? Math.min(1, s.roughness + response.silicone.roughnessAdd) : s.roughness;
    m.clearcoat = silicone ? s.siliconeClearcoat : s.clearcoat;
    m.clearcoatRoughness = s.clearcoatRoughness;
    if (!silicone && s.specular !== undefined) m.specularIntensity = s.specular;
    if (silicone) m.sheenRoughness = response.silicone.sheenRoughness ?? m.roughness; // sheen follows the live roughness, as in r128
  } else if (finish === 'speckle') speckle(m);
  else if (finish === 'matte' && !silicone && response.matteGrain > 0) grain(m, response.matteGrain);
  return m;
}

export const INK = '#252525';
export const METAL = (): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color: lin('#c9c9c6'), metalness: 0.9, roughness: response.metal.roughness });
  // brighter steel: carry the studio itself so the stronger reflection is not overwritten (parity: 1, scene default)
  if (response.metal.envMapIntensity !== 1 && studioEnv) {
    m.envMap = studioEnv;
    m.envMapIntensity = studioEnvIntensity * response.metal.envMapIntensity;
  }
  return m;
};
export const GREY = (): THREE.MeshPhysicalMaterial => plastic('#bdbcbb', { roughness: 0.7, clearcoat: 0 });
