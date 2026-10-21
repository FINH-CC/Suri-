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

export function makeEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  // Soft product studio, warm-neutral to sit on the stage colour. A large key wraps from the left-front so the
  // cylinder shades gradually (no flat face, no hard dark band), a broad front fill keeps the shadow side readable,
  // and two thin rim strips behind outline both edges against the backdrop.
  const env = new THREE.Scene();
  const warm = (i: number, t: [number, number, number] = [1, 0.97, 0.94]) =>
    new THREE.Color(i * t[0], i * t[1], i * t[2]);
  env.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(60, 60, 60),
      new THREE.MeshBasicMaterial({ color: warm(0.42), side: THREE.BackSide }),
    ),
  );
  const panel = (w: number, h: number, pos: [number, number, number], i: number, t?: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: warm(i, t), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(24, 46, [-22, 16, 16], 2.6, [1, 0.99, 0.97]); // key: big softbox, high on the left, so tops read brightest and fade downwards
  panel(30, 36, [6, 0, 28], 0.7); // broad front fill: lifts the face without flattening it
  panel(16, 36, [24, 0, 10], 0.45); // soft right fill: shadow side falls off gently, never black
  panel(40, 36, [-4, 28, 6], 1.7); // top: broad overhead light, the long top-to-bottom gradient
  panel(3, 44, [-20, 4, -16], 1.5); // rim left-back
  panel(3, 44, [22, 4, -14], 1.6); // rim right-back: clean edge on the shadow side
  panel(50, 50, [0, -27, 4], 0.5, [1, 0.95, 0.93]); // warm floor bounce, picks up the stage tint
  return new THREE.PMREMGenerator(renderer).fromScene(env, 0.025).texture;
}

/**
 * The studio key light (legacy 1087 / 1123: `DirectionalLight(0xfff8f0, .45)` on r128).
 * r128 ran lights in legacy mode: a light's irradiance was multiplied by PI, and a hex light colour was used as-is
 * (no sRGB -> linear). Current three is physically based on both counts, so the same look needs .45 * PI and the
 * colour taken as linear values. Measured in the Task 18 parity pass: without this every part rendered ~10% darker.
 */
export function makeKeyLight(): THREE.DirectionalLight {
  const colour = new THREE.Color().setRGB(1, 0xf8 / 255, 0xf0 / 255, THREE.LinearSRGBColorSpace);
  const key = new THREE.DirectionalLight(colour, 0.45 * Math.PI);
  key.position.set(-20, 26, 16);
  return key;
}
