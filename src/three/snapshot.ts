import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { PARTS } from '../data/parts';
import type { PartId } from '../data/parts';
import type { Design } from '../state/design';
import { buildPart, dispose } from './parts/index';
import { expandByObjectR128 } from './box';
import { makeKeyLight, setKeyLight } from './renderer';
import type { BrushScene } from './scene';

/*
 * Off-screen snapshots of any design (legacy thumbnail renderer, legacy/index.html 1119-1171 and 1456-1488).
 * Parts are built fresh from the `design` argument and disposed after; the live groups are never touched.
 *
 * Rendering goes through the stage's renderer into a multisampled HalfFloat target (linear), then a full-screen
 * pass un-premultiplies the anti-aliased edges, applies the renderer's tone mapping and the sRGB transfer into an
 * 8-bit target that is read back. (three skips tone mapping and output encoding when drawing into a plain
 * render target, so this pass stands in for what the legacy canvas did on its own.)
 */

export type SnapshotPose = 'hero' | 'tile' | 'card';

/** Per-part tile cameras (legacy THUMB_VIEW, 1130-1138). */
const THUMB_VIEW: Record<PartId, { dir: [number, number, number]; tilt: number; minY?: number }> = {
  head: { dir: [0.55, 0.25, -1], tilt: 0.45, minY: 19.6 }, // character cues sit on the back of the head pad
  cap: { dir: [0.35, 0.18, 1], tilt: 0 }, // upright, from the front, so character accessories read like the sketches
  grip: { dir: [0.6, 0.3, 1], tilt: 0.75 },
  handle: { dir: [0.6, 0.3, 1], tilt: 0.75 },
  button: { dir: [0.25, 0.2, 1], tilt: 0 },
  mount: { dir: [0.35, 0.15, 1], tilt: 0.2 },
};
/** Whole-brush tile camera (legacy THUMB_BRUSH, 1456). */
const THUMB_BRUSH = { dir: [0.45, 0.18, 1] as [number, number, number], tilt: 0.55 };

/* ---------- framing helpers ---------- */

/** World-space vertex samples (~2.5k per mesh, instances expanded), optionally only those at or above `minY` (legacy worldPoints). */
function worldPoints(g: THREE.Object3D, minY?: number): THREE.Vector3[] {
  g.updateMatrixWorld(true);
  const out: THREE.Vector3[] = [], v = new THREE.Vector3(), m = new THREE.Matrix4(), im = new THREE.Matrix4();
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const pos = mesh.isMesh ? mesh.geometry?.attributes.position : undefined;
    if (!pos) return;
    const step = Math.max(1, Math.ceil(pos.count / 2500));
    const push = (mat: THREE.Matrix4) => {
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mat);
        if (minY === undefined || v.y >= minY) out.push(v.clone());
      }
    };
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, im);
        m.multiplyMatrices(inst.matrixWorld, im);
        push(m);
      }
    } else push(mesh.matrixWorld);
  });
  return out;
}

/** Aim the orthographic camera along `dir` (rolled by `tilt`) and fit `pts` with `margin` (legacy thumbOfRaw / brushThumb). */
function frameOrtho(
  cam: THREE.OrthographicCamera,
  pts: THREE.Vector3[],
  dir: [number, number, number],
  tilt: number,
  margin: number,
  aspect: number,
): void {
  const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
  const d = new THREE.Vector3(...dir).normalize();
  cam.position.copy(c).addScaledVector(d, 60);
  // roll the camera so tall parts sit on a diagonal
  cam.up.copy(new THREE.Vector3(0, 1, 0).applyAxisAngle(d, tilt));
  cam.lookAt(c);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse, p = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of pts) {
    p.copy(q).applyMatrix4(inv);
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, half = (Math.max(x1 - x0, y1 - y0) / 2) * margin;
  // legacy tiles are square; a non-square size widens the long side so nothing stretches
  const hx = half * Math.max(1, aspect), hy = half * Math.max(1, 1 / aspect);
  Object.assign(cam, { left: cx - hx, right: cx + hx, top: cy + hy, bottom: cy - hy });
  cam.updateProjectionMatrix();
}

/** Leaning three-quarter hero camera (legacy brushHero, 1459-1472). */
function frameHero(cam: THREE.PerspectiveCamera, g: THREE.Object3D, aspect: number): void {
  g.updateMatrixWorld(true);
  const box = expandByObjectR128(new THREE.Box3(), g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  const d = new THREE.Vector3(0.35, -0.3, 1).normalize();
  const fitH = Math.max(size.y, size.x / cam.aspect);
  const dist = ((fitH * 0.5) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.04;
  cam.position.copy(c).addScaledVector(d, dist);
  cam.lookAt(c);
}

/* ---------- per-scene state (lazily created once per BrushScene) ---------- */

type Targets = { msaa: THREE.WebGLRenderTarget; out: THREE.WebGLRenderTarget; buf: Uint8Array };
type State = {
  scene: THREE.Scene;
  key: THREE.DirectionalLight;
  rims: THREE.Group;
  lookVersion: number;
  ortho: THREE.OrthographicCamera;
  persp: THREE.PerspectiveCamera;
  quad: FullScreenQuad;
  mat: THREE.RawShaderMaterial;
  targets: Map<string, Targets>;
};

const states = new WeakMap<BrushScene, State>();

const OUTPUT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D( tDiffuse, vUv );
    // MSAA resolves edges against the transparent clear: colour is premultiplied there, the PNG wants it straight
    if ( c.a > 0.0 ) c.rgb /= c.a;
    #if defined( CUSTOM_TONE_MAPPING )
      c.rgb = CustomToneMapping( c.rgb );
    #elif defined( LINEAR_TONE_MAPPING )
      c.rgb = LinearToneMapping( c.rgb );
    #endif
    #ifdef SRGB_TRANSFER
      c = sRGBTransferOETF( c );
    #endif
    gl_FragColor = c;
  }`;
const OUTPUT_VERT = /* glsl */ `
  precision highp float;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;

function stateFor(bs: BrushScene): State {
  let s = states.get(bs);
  if (s) return s;
  const scene = new THREE.Scene();
  // legacy thumb key light (1123); its colour and intensity follow the look (syncLook), its aim stays the thumb aim
  const key = makeKeyLight();
  scene.add(key);
  const rims = new THREE.Group();
  scene.add(rims);
  const mat = new THREE.RawShaderMaterial({
    name: 'SnapshotOutput',
    uniforms: { tDiffuse: { value: null }, toneMappingExposure: { value: 1 } },
    vertexShader: OUTPUT_VERT,
    fragmentShader: OUTPUT_FRAG,
    defines: outputDefines(bs.renderer),
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  s = {
    scene,
    key,
    rims,
    lookVersion: -1,
    ortho: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 500),
    persp: new THREE.PerspectiveCamera(24, 1, 1, 400),
    quad: new FullScreenQuad(mat),
    mat,
    targets: new Map(),
  };
  states.set(bs, s);
  return s;
}

/** The output pass's tone curve and transfer, matching the stage renderer. */
function outputDefines(r: THREE.WebGLRenderer): Record<string, string> {
  const defines: Record<string, string> = {};
  if (r.toneMapping === THREE.CustomToneMapping) defines.CUSTOM_TONE_MAPPING = '';
  else if (r.toneMapping === THREE.LinearToneMapping) defines.LINEAR_TONE_MAPPING = '';
  if (THREE.ColorManagement.getTransfer(r.outputColorSpace) === THREE.SRGBTransfer) defines.SRGB_TRANSFER = '';
  return defines;
}

/** Tiles, box and passport images follow the stage's look: key colour and intensity, rim lights. */
function syncLook(s: State, bs: BrushScene): void {
  if (s.lookVersion === bs.lookVersion) return;
  s.lookVersion = bs.lookVersion;
  const k = bs.look.key;
  setKeyLight(s.key, k); // aimed at the origin, as the legacy thumb key was
  while (s.rims.children.length) s.rims.remove(s.rims.children[0]);
  bs.extraLights.children.forEach((l) => {
    const d = l as THREE.DirectionalLight;
    if (!d.isDirectionalLight) return;
    const c = d.clone();
    c.target.position.copy(d.target.position); // same aim as the stage's rim (direction is all a directional light has)
    s.rims.add(c, c.target);
  });
  const d = outputDefines(bs.renderer);
  if (JSON.stringify(d) !== JSON.stringify(s.mat.defines)) {
    s.mat.defines = d;
    s.mat.needsUpdate = true;
  }
}

/** One pair of targets per size, reused (tile grids render many snapshots at the same size). */
function targetsFor(s: State, w: number, h: number): Targets {
  const k = `${w}x${h}`;
  let t = s.targets.get(k);
  if (!t) {
    t = {
      msaa: new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType }),
      out: new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false }),
      buf: new Uint8Array(w * h * 4),
    };
    s.targets.set(k, t);
  }
  return t;
}

/** Free a scene's snapshot targets, quad and private scene (call when the BrushScene is disposed). */
export function disposeSnapshots(bs: BrushScene): void {
  const s = states.get(bs);
  if (!s) return;
  s.targets.forEach((t) => (t.msaa.dispose(), t.out.dispose()));
  s.quad.dispose();
  s.mat.dispose();
  states.delete(bs);
}

/* ---------- snapshot ---------- */

/**
 * Render `design` off-screen as a transparent PNG data URL.
 * - `hero`: leaning three-quarter perspective of the whole brush (no mount) — box, passport, My designs.
 * - `card`: orthographic whole-brush tile (no mount) — character cards, Start screen.
 * - `tile`: one part (`opts.part`, style `opts.style` or the design's), framed by its THUMB_VIEW.
 */
export function snapshot(
  bs: BrushScene,
  design: Design,
  pose: SnapshotPose,
  w: number,
  h: number,
  opts: { part?: PartId; style?: string } = {},
): string {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const s = stateFor(bs);
  const ctx = bs.buildCtxFor(design);
  const g = new THREE.Group();
  let cam: THREE.Camera;
  let clip = false;

  if (pose === 'tile') {
    const id = opts.part;
    if (!id) throw new Error("snapshot(tile): opts.part is required");
    const style = opts.style ?? design.parts[id];
    g.add(buildPart(id, style, design.colours[id], ctx));
    const view = THUMB_VIEW[id];
    const minY = style !== 'upload' ? view.minY : undefined;
    if (minY !== undefined) {
      clip = true;
      const planes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -minY)];
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => (m.clippingPlanes = planes));
      });
    }
    frameOrtho(s.ortho, worldPoints(g, minY), view.dir, view.tilt, 1.2, w / h);
    cam = s.ortho;
  } else {
    for (const p of PARTS) if (p.id !== 'mount') g.add(buildPart(p.id, design.parts[p.id], design.colours[p.id], ctx));
    if (pose === 'hero') {
      g.rotation.set(0.08, 0.5, -0.5); // leaning hero pose
      frameHero(s.persp, g, w / h);
      cam = s.persp;
    } else {
      frameOrtho(s.ortho, worldPoints(g), THUMB_BRUSH.dir, THUMB_BRUSH.tilt, 1.06, w / h);
      cam = s.ortho;
    }
  }

  syncLook(s, bs);
  s.scene.environment = bs.scene.environment; // reuse the stage's PMREM studio
  s.scene.environmentIntensity = bs.scene.environmentIntensity;
  s.scene.add(g);
  const r = bs.renderer, t = targetsFor(s, w, h);

  // save renderer state
  const prevTarget = r.getRenderTarget();
  const prevViewport = r.getViewport(new THREE.Vector4());
  const prevScissor = r.getScissor(new THREE.Vector4());
  const prevScissorTest = r.getScissorTest();
  const prevClear = r.getClearColor(new THREE.Color());
  const prevAlpha = r.getClearAlpha();
  const prevClip = r.localClippingEnabled;
  const prevAutoClear = r.autoClear;

  try {
    r.localClippingEnabled = clip;
    r.autoClear = true;
    r.setClearColor(0, 0);
    r.setRenderTarget(t.msaa);
    r.render(s.scene, cam);
    s.mat.uniforms.tDiffuse.value = t.msaa.texture;
    s.mat.uniforms.toneMappingExposure.value = r.toneMappingExposure;
    r.setRenderTarget(t.out);
    s.quad.render(r);
    r.readRenderTargetPixels(t.out, 0, 0, w, h, t.buf);
  } finally {
    r.setRenderTarget(prevTarget);
    r.setViewport(prevViewport);
    r.setScissor(prevScissor);
    r.setScissorTest(prevScissorTest);
    r.setClearColor(prevClear, prevAlpha);
    r.localClippingEnabled = prevClip;
    r.autoClear = prevAutoClear;
    s.scene.remove(g);
    dispose(g);
    s.mat.uniforms.tDiffuse.value = null;
  }

  // GL rows run bottom-up; flip into the canvas
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c2 = canvas.getContext('2d')!;
  const img = c2.createImageData(w, h), row = w * 4;
  for (let y = 0; y < h; y++) img.data.set(t.buf.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  c2.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
