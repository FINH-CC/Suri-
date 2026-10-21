import * as THREE from 'three';

// Neutral tone mapping (Khronos PBR Neutral): colours stay true below ~0.8, highlights roll off softly
// instead of clipping to white. Installed by replacing three's CustomToneMapping stub (pure string work).
const STUB = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
const NEUTRAL = `vec3 CustomToneMapping( vec3 color ) {
    color *= toneMappingExposure;
    const float startCompression = 0.76; const float desaturation = 0.15;
    float x = min( color.r, min( color.g, color.b ) );
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;
    float peak = max( color.r, max( color.g, color.b ) );
    if ( peak < startCompression ) return color;
    const float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / ( peak + d - startCompression );
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / ( desaturation * ( peak - newPeak ) + 1.0 );
    return mix( color, vec3( newPeak ), g );
  }`;

function patchToneMapping(): boolean {
  const ch = THREE.ShaderChunk;
  if (ch.tonemapping_pars_fragment.includes(NEUTRAL)) return true; // already patched (HMR)
  if (!ch.tonemapping_pars_fragment.includes(STUB)) {
    console.warn('[renderer] CustomToneMapping stub not found; falling back to LinearToneMapping');
    return false;
  }
  ch.tonemapping_pars_fragment = ch.tonemapping_pars_fragment.replace(STUB, NEUTRAL);
  return true;
}

export const NEUTRAL_TONE_MAPPING = patchToneMapping();

export function makeRenderer(opts: THREE.WebGLRendererParameters = {}): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, ...opts });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = NEUTRAL_TONE_MAPPING ? THREE.CustomToneMapping : THREE.LinearToneMapping;
  r.toneMappingExposure = 1.05;
  r.setClearColor(0, 0);
  return r;
}

/* ---------- studio environment ---------- */

export type Tint = [number, number, number];
export type Vec3 = [number, number, number];
/** One emissive panel of the PMREM studio: size, position (it faces the origin), intensity, optional tint. */
export type EnvPanel = { w: number; h: number; pos: Vec3; i: number; tint?: Tint };
/** The studio a look reflects: a tinted room box, its panels, and the PMREM blur (sigma). */
export type EnvSpec = { room: number; tint: Tint; panels: EnvPanel[]; sigma: number };

/**
 * Soft product studio, warm-neutral to sit on the stage colour (the parity studio). A large key wraps from the
 * left-front so the cylinder shades gradually (no flat face, no hard dark band), a broad front fill keeps the shadow
 * side readable, and two thin rim strips behind outline both edges against the backdrop.
 */
export const PARITY_ENV: EnvSpec = {
  room: 0.42,
  tint: [1, 0.97, 0.94],
  sigma: 0.025,
  panels: [
    { w: 24, h: 46, pos: [-22, 16, 16], i: 2.6, tint: [1, 0.99, 0.97] }, // key: big softbox, high on the left, so tops read brightest and fade downwards
    { w: 30, h: 36, pos: [6, 0, 28], i: 0.7 }, // broad front fill: lifts the face without flattening it
    { w: 16, h: 36, pos: [24, 0, 10], i: 0.45 }, // soft right fill: shadow side falls off gently, never black
    { w: 40, h: 36, pos: [-4, 28, 6], i: 1.7 }, // top: broad overhead light, the long top-to-bottom gradient
    { w: 3, h: 44, pos: [-20, 4, -16], i: 1.5 }, // rim left-back
    { w: 3, h: 44, pos: [22, 4, -14], i: 1.6 }, // rim right-back: clean edge on the shadow side
    { w: 50, h: 50, pos: [0, -27, 4], i: 0.5, tint: [1, 0.95, 0.93] }, // warm floor bounce, picks up the stage tint
  ],
};

export function makeEnv(renderer: THREE.WebGLRenderer, spec: EnvSpec = PARITY_ENV): THREE.Texture {
  const env = new THREE.Scene();
  const warm = (i: number, t: Tint = spec.tint) => new THREE.Color(i * t[0], i * t[1], i * t[2]);
  env.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(60, 60, 60),
      new THREE.MeshBasicMaterial({ color: warm(spec.room), side: THREE.BackSide }),
    ),
  );
  for (const p of spec.panels) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(p.w, p.h),
      new THREE.MeshBasicMaterial({ color: warm(p.i, p.tint), side: THREE.DoubleSide }),
    );
    m.position.set(...p.pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, spec.sigma).texture;
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return tex;
}

/* ---------- key light ---------- */

/** The key light: linear colour (r128 took hex light colours as-is), intensity, position. */
export type KeySpec = { colour: Tint; intensity: number; pos: Vec3 };

/**
 * The studio key light (legacy 1087 / 1123: `DirectionalLight(0xfff8f0, .45)` on r128).
 * r128 ran lights in legacy mode: a light's irradiance was multiplied by PI, and a hex light colour was used as-is
 * (no sRGB -> linear). Current three is physically based on both counts, so the same look needs .45 * PI and the
 * colour taken as linear values. Measured in the Task 18 parity pass: without this every part rendered ~10% darker.
 */
export const PARITY_KEY: KeySpec = { colour: [1, 0xf8 / 255, 0xf0 / 255], intensity: 0.45 * Math.PI, pos: [-20, 26, 16] };

export function setKeyLight(key: THREE.DirectionalLight, spec: KeySpec): THREE.DirectionalLight {
  key.color.setRGB(...spec.colour, THREE.LinearSRGBColorSpace);
  key.intensity = spec.intensity;
  key.position.set(...spec.pos);
  return key;
}

export function makeKeyLight(spec: KeySpec = PARITY_KEY): THREE.DirectionalLight {
  return setKeyLight(new THREE.DirectionalLight(), spec);
}
