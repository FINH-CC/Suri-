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
 * Soft-touch silicone: a faint velvety sheen at grazing angles, tinted toward white.
 * r128 `sheen: Color(c * .32)` -> current `sheen: .32, sheenColor: c`. Spread into `plastic` options.
 */
export const siliconeSheen = (hex: string): { sheen: number; sheenColor: THREE.Color } => ({
  sheen: 0.32,
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
  // r128 sheen used the material's own roughness; current three has a separate sheenRoughness (default 1)
  if (m.sheen > 0 && o.sheenRoughness === undefined) m.sheenRoughness = m.roughness;
  return m;
};

/** Plant-based head: fine light/dark flecks, generated from position (CAD has no UVs). */
export function speckle<M extends THREE.Material>(mat: M): M {
  mat.onBeforeCompile = (sh) => {
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
  };
  mat.customProgramCacheKey = () => 'speckle';
  return mat;
}

/** The chosen finish, applied to the main plastic of handle, cap, grip and mount. */
export function applyFinish(m: THREE.MeshPhysicalMaterial, finish: FinishId): THREE.MeshPhysicalMaterial {
  // pre-finish values, kept so a finish-only change can re-finish the material without rebuilding (scene.refinish)
  m.userData.finishable = true;
  m.userData.base ??= { roughness: m.roughness, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness, sheenRoughness: m.sheenRoughness };
  if (finish === 'satin') {
    m.roughness = 0.36;
    m.clearcoat = 0.3;
    m.clearcoatRoughness = 0.28;
    if (m.sheen > 0) m.sheenRoughness = 0.36; // sheen follows the live roughness, as in r128
  } else if (finish === 'speckle') speckle(m);
  return m;
}

export const INK = '#252525';
export const METAL = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: lin('#c9c9c6'), metalness: 0.9, roughness: 0.3 });
export const GREY = (): THREE.MeshPhysicalMaterial => plastic('#bdbcbb', { roughness: 0.7, clearcoat: 0 });
