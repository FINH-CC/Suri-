import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { dimFor, PARTS } from '../data/parts';
import type { FinishId, PartId } from '../data/parts';
import type { Design } from '../state/design';
import type { CapCore } from './capfit';
import { applyFinish, clearFinishPatches, setMaterialResponse, setStudioEnv } from './materials';
import type { BrushMeta, CadGeo } from './model';
import { buildPart, dispose } from './parts/index';
import type { BuildCtx } from './parts/index';
import { expandByMeshes, expandByObjectR128 } from './box';
import { LOOKS } from './looks';
import type { Look } from './looks';
import { makeEnv, makeKeyLight, makeRenderer, setKeyLight } from './renderer';
import { disposeSnapshots } from './snapshot';
import { indexMesh } from './pick-index';
import { SSAO } from './ssao';
import { disposeWarmSticker } from './stickers';

/* ---------- pure helpers (no DOM) ---------- */

/** Rebuild order: the cap is fitted to the head, so the head always builds first. */
const BUILD_ORDER: PartId[] = ['head', 'cap', ...PARTS.map((p) => p.id).filter((id) => id !== 'head' && id !== 'cap')];

/**
 * Legacy partKey (1097) minus the finish: a finish change swaps materials in place instead of rebuilding.
 */
const geomKey = (id: PartId, d: Design): string =>
  [d.parts[id], d.colours[id], id === 'cap' ? d.parts.head : '', id === 'head' ? d.colours.head : ''].join('|');

/** Parts whose geometry/colour must be rebuilt going from `prev` to `next` (head before cap). */
export function partsToRebuild(prev: Design | null, next: Design): PartId[] {
  return BUILD_ORDER.filter((id) => !prev || geomKey(id, prev) !== geomKey(id, next));
}

/** True when the finish is the only change that touches the 3D parts. */
export function finishOnly(prev: Design | null, next: Design): boolean {
  return !!prev && prev.finish !== next.finish && partsToRebuild(prev, next).length === 0;
}

/** Re-finish a material built through `applyFinish`: back to its pre-finish values, then the new finish. */
export function refinish(m: THREE.MeshPhysicalMaterial, finish: FinishId): void {
  const b = m.userData.base as
    | { roughness: number; clearcoat: number; clearcoatRoughness: number; sheenRoughness?: number; specularIntensity?: number }
    | undefined;
  if (b) {
    m.roughness = b.roughness;
    m.clearcoat = b.clearcoat;
    m.clearcoatRoughness = b.clearcoatRoughness;
    if (b.sheenRoughness !== undefined) m.sheenRoughness = b.sheenRoughness;
    if (b.specularIntensity !== undefined) m.specularIntensity = b.specularIntensity;
  }
  // speckle() and grain() install shader patches; a new finish removes them (detail patches such as the deboss stay)
  clearFinishPatches(m);
  applyFinish(m, finish);
  m.needsUpdate = true;
}

/* ---------- scene ---------- */

const VIEWS: [number, number, number][] = [
  [0, 12, 50],
  [50, 12, 0],
  [14, 12, -48],
  [30, 42, 30], // isometric (equal x/y/z, ~35deg down, 45deg round)
];

type Listener = () => void;

export class BrushScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly scene: THREE.Scene;
  readonly groups = {} as Record<PartId, THREE.Group>;
  readonly stickerGroup = new THREE.Group();
  uploads: BuildCtx['uploads'] = {};
  /** Task 10: re-project stickers after parts were rebuilt or the sticker list changed. */
  onPartsChanged?: (d: Design) => void;
  /** Frames rendered (diagnostics / idle check / first-frame gate). */
  frames = 0;
  /** The last error thrown by the frame loop, if any. */
  lastError: unknown = null;
  /** The studio look in use (Task 19); `lookVersion` bumps on every change so snapshots can follow. */
  look: Look = LOOKS.parity;
  lookVersion = 0;
  readonly key: THREE.DirectionalLight;
  /** Extra lights a look adds (rim lights); no shadows. */
  readonly extraLights = new THREE.Group();

  private readonly stage: HTMLElement;
  private readonly cad: CadGeo;
  private readonly meta: BrushMeta;
  private readonly capFit: Record<string, CapCore>;
  private readonly ssao: SSAO;
  private readonly contact: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>;
  private floor: Look['ground'] = null;
  /** Floor fade: start and end distance (world units, set per frame from the brush width) and the along-light stretch. */
  private readonly groundFade = { value: new THREE.Vector3(0, 4, 1) };
  /** The shadow's direction on the floor, in the floor plane's local xy. */
  private readonly groundDir = { value: new THREE.Vector2(1, 0) };
  /** False where the GPU cannot render the float targets VSM needs: such looks fall back to PCF and the contact pool. */
  readonly vsmSupported: boolean;
  private dprQuery: MediaQueryList | null = null;
  private readonly onDpr = () => {
    this.watchDpr();
    this.resize();
    this.invalidateShadows();
  };
  private design: Design | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly reduceMotion: boolean;
  private readonly listeners: Record<'userMove', Set<Listener>> = { userMove: new Set() };
  private readonly ro: ResizeObserver;

  private exploded = false;
  private ex = 0;
  private capLift = false;
  private lift = 0;
  private camTo: THREE.Vector3 | null = null;
  private viewIdx = -1;
  private userMoved = false;
  private fitD = 47;
  private pops: Partial<Record<PartId, { t0: number }>> = {};
  private popReady = false;
  private raf = 0;
  /** The key light's shadow map is redrawn only on frames where what casts or receives it changed (or moved). */
  private shadowsDirty = true;
  private lastPose = '';
  private readonly _cb = new THREE.Box3();

  constructor(
    stage: HTMLElement,
    model: { cad: CadGeo; meta: BrushMeta },
    capFit: Record<string, CapCore>,
    look: Look = LOOKS.parity,
  ) {
    this.stage = stage;
    this.cad = model.cad;
    this.meta = model.meta;
    this.capFit = capFit;
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* main scene (legacy 1081-1117) */
    const renderer = (this.renderer = makeRenderer());
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    stage.prepend(renderer.domElement);
    // soft shadows: the brush shades the mount behind it, parts shade each other where they meet
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false; // redrawn only when content changed (shadowsDirty), plain orbit frames reuse it
    const ext = renderer.extensions;
    this.vsmSupported = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    const scene = (this.scene = new THREE.Scene());
    // environment, exposure, tone curve, key light values and shadow softness come from the look (setLook, below)
    const key = (this.key = makeKeyLight());
    scene.add(key);
    key.target.position.set(0, 11, 0);
    scene.add(key.target);
    key.castShadow = true;
    scene.add(this.extraLights);
    this.camera = new THREE.PerspectiveCamera(28, 1, 1, 300);
    this.camera.position.set(16, 13, 47);
    for (const p of PARTS) {
      this.groups[p.id] = new THREE.Group();
      scene.add(this.groups[p.id]);
    }
    scene.add(this.stickerGroup);

    const controls = (this.controls = new OrbitControls(this.camera, renderer.domElement));
    controls.target.set(0, 11, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 12;
    controls.maxDistance = 80;
    controls.autoRotate = false; // turntable off: the brush stays where it's put
    controls.addEventListener('start', () => {
      this.camTo = null;
      this.viewIdx = -1;
      this.userMoved = true;
      this.listeners.userMove.forEach((fn) => fn());
    });
    controls.addEventListener('change', () => this.requestFrame());

    this.ssao = new SSAO(renderer);
    this.contact = this.makeContact();
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ transparent: true, depthWrite: false, opacity: 0 }),
    );
    // the floor's shadow fades out with distance from the base, so it never ends on the shadow camera's edge
    // the floor's shadow fades out close to the base (sooner along the shadow's direction), so it never reaches the
    // edge of the shadow map, whatever the view or stage size
    this.ground.material.onBeforeCompile = (sh) => {
      sh.uniforms.fade = this.groundFade;
      sh.uniforms.fadeDir = this.groundDir;
      sh.vertexShader =
        'varying vec2 vGround;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGround = position.xy;');
      sh.fragmentShader =
        'uniform vec3 fade;\nuniform vec2 fadeDir;\nvarying vec2 vGround;\n' +
        sh.fragmentShader.replace(
          'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
          `float gd = length( vec2( dot( vGround, fadeDir ) * fade.z, dot( vGround, vec2( -fadeDir.y, fadeDir.x ) ) ) );
  gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * ( 1.0 - smoothstep( fade.x, fade.y, gd ) ) );`,
        );
    };
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.visible = false;
    scene.add(this.ground);
    this.look = look;
    this.setLook(look);
    this.watchDpr();

    this.ro = new ResizeObserver(() => {
      this.resize();
      if (!this.userMoved) this.frameDefault();
      this.invalidateShadows();
    });
    this.ro.observe(stage);
    this.resize();
  }

  /* ---------- design ---------- */

  applyDesign(next: Design, prev: Design | null): void {
    this.design = next;
    const ids = partsToRebuild(prev, next);
    for (const id of ids) this.rebuild(id, next);
    // re-finish the parts that were not rebuilt (rebuilt parts already carry the new finish)
    if (prev && prev.finish !== next.finish) {
      for (const p of PARTS) {
        if (ids.includes(p.id)) continue;
        this.groups[p.id].traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
            if (m.userData.finishable) refinish(m as THREE.MeshPhysicalMaterial, next.finish);
          });
        });
      }
    }
    if (ids.length || !prev || JSON.stringify(prev.stickers) !== JSON.stringify(next.stickers)) this.onPartsChanged?.(next);
    ids.forEach((id) => this.popPart(id));
    if (!prev) setTimeout(() => (this.popReady = true), 400);
    this.invalidateShadows(); // part rebuilds, finish swaps and sticker changes all arrive here
  }

  /** Redraw the shadow map on the next frame (call after changing anything that casts or receives the key shadow). */
  invalidateShadows(): void {
    this.shadowsDirty = true;
    this.requestFrame();
  }

  private ctxFor(d: Design): BuildCtx {
    return {
      cad: this.cad,
      dim: dimFor(this.meta.tuftFaceZ),
      tufts: this.meta.tufts,
      finish: d.finish,
      headStyle: d.parts.head,
      uploads: this.uploads,
    };
  }

  /** Build context (finish, uploads, cap cavity fitted to `d.parts.head`) for building any design's parts, e.g. snapshots. */
  buildCtxFor(d: Design): BuildCtx {
    const ctx = this.ctxFor(d);
    ctx.capCore = this.capCoreFor();
    return ctx;
  }

  /** The head has no shapes and no upload (Task 21): the cap always fits the plain head. */
  private capCoreFor(): CapCore {
    return this.capFit.plain;
  }

  private rebuild(id: PartId, d: Design): void {
    const ctx = this.buildCtxFor(d);
    const g = this.groups[id];
    while (g.children.length) dispose(g.children.pop()!);
    const part = buildPart(id, d.parts[id], d.colours[id], ctx);
    // brush parts cast shadows onto the mount only; self-shadowing on curved parts caused blotchy 'crumpled' shading
    part.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !(mesh.material as THREE.Material).transparent;
      mesh.receiveShadow = id === 'mount';
    });
    g.add(part);
  }

  /** Hop a part on demand (tapping it); no-op under reduced motion, like the change pops. */
  pop(id: PartId): void {
    this.popPart(id);
    this.requestFrame();
  }

  private popPart(id: PartId): void {
    if (!this.popReady || this.reduceMotion) return;
    this.pops[id] = { t0: performance.now() };
  }

  /* ---------- studio look (Task 19, src/three/looks.ts) ---------- */

  /** Apply every render parameter of `look`. Safe at any time; a change of material response rebuilds the parts. */
  setLook(look: Look): void {
    const prev = this.look, first = this.lookVersion === 0, r = this.renderer, key = this.key;
    this.look = look;
    this.lookVersion++;
    r.toneMappingExposure = look.exposure;
    if (first || prev.env !== look.env) {
      const old = this.scene.environment;
      this.scene.environment = makeEnv(r, look.env);
      old?.dispose();
    }
    this.scene.environmentIntensity = look.envIntensity;
    setKeyLight(key, look.key);
    // shadows: three recompiles the materials when the map type changes; a new size needs a fresh map
    const sh = look.shadow;
    const vsm = sh.type === THREE.VSMShadowMap && this.vsmSupported;
    const type = sh.type === THREE.VSMShadowMap && !vsm ? THREE.PCFShadowMap : sh.type;
    if (r.shadowMap.type === THREE.VSMShadowMap && type !== THREE.VSMShadowMap) {
      // leaving VSM: its blur target is not used by PCF
      key.shadow.mapPass?.dispose();
      key.shadow.mapPass = null;
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    r.shadowMap.type = type;
    if (key.shadow.mapSize.x !== sh.mapSize) {
      key.shadow.mapSize.set(sh.mapSize, sh.mapSize);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    key.shadow.radius = sh.radius;
    key.shadow.blurSamples = sh.blurSamples;
    key.shadow.bias = sh.bias;
    key.shadow.normalBias = sh.normalBias;
    key.shadow.intensity = sh.intensity;
    Object.assign(key.shadow.camera, { ...sh.frustum, near: 1, far: 80 });
    key.shadow.camera.updateProjectionMatrix();
    // rim lights
    while (this.extraLights.children.length) this.extraLights.remove(this.extraLights.children[0]);
    for (const l of look.rims) {
      const d = new THREE.DirectionalLight(new THREE.Color().setRGB(...l.colour, THREE.LinearSRGBColorSpace), l.intensity);
      d.position.set(...l.pos);
      d.target.position.set(0, 11, 0);
      this.extraLights.add(d, d.target);
    }
    // contact shadow and shadow-catching floor
    // the floor shadow needs VSM's soft edge; without it the contact pool carries the grounding alone
    this.floor = vsm ? look.ground : null;
    this.drawContact(this.floor || !look.ground ? look.contact.alpha : look.contact.fallbackAlpha);
    this.ground.visible = !!this.floor;
    this.ground.material.opacity = this.floor?.opacity ?? 0;
    const lx = 0 - look.key.pos[0], lz = 0 - look.key.pos[2]; // the key aims at the y axis
    this.groundDir.value.set(lx, -lz).normalize(); // world xz -> the floor plane's local xy (rotated -90deg about x)
    this.ssao.set(look.ssao);
    setStudioEnv(this.scene.environment, look.envIntensity);
    setMaterialResponse(look.material);
    // materials read the response and the studio when built: rebuild when either changed
    const rebuild = prev.material !== look.material || prev.env !== look.env || prev.envIntensity !== look.envIntensity;
    if (!first && rebuild && this.design) this.rebuildAll(this.design);
    this.resize();
    this.shadowsDirty = true;
    if (!first) this.requestFrame();
  }

  private rebuildAll(d: Design): void {
    for (const id of BUILD_ORDER) this.rebuild(id, d);
    this.onPartsChanged?.(d);
  }

  /* ---------- toolbar: take apart, cap lift, views (legacy 1677-1686) ---------- */

  setExploded(on: boolean): void {
    this.exploded = on;
    this.requestFrame();
  }

  setCapLift(on: boolean): void {
    this.capLift = on;
    this.requestFrame();
  }

  setView(i: 0 | 1 | 2 | 3): void {
    this.viewIdx = i;
    this.camTo = new THREE.Vector3(...VIEWS[i])
      .sub(new THREE.Vector3(0, 12, 0))
      .normalize()
      .multiplyScalar(this.fitD)
      .add(this.controls.target);
    this.requestFrame();
  }

  /** Current preset view, or -1 once the user has moved the camera. */
  get view(): number {
    return this.viewIdx;
  }

  on(ev: 'userMove', fn: Listener): () => void {
    this.listeners[ev].add(fn);
    return () => this.listeners[ev].delete(fn);
  }

  /* ---------- framing (legacy 1855-1878) ---------- */

  /** Follow DPR changes (a window dragged to another screen, browser zoom): no resize event fires for those. */
  private watchDpr(): void {
    this.dprQuery?.removeEventListener('change', this.onDpr);
    if (typeof matchMedia !== 'function' || typeof devicePixelRatio !== 'number') return;
    this.dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    this.dprQuery.addEventListener('change', this.onDpr, { once: true });
  }

  private resize(): void {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    // pixel ratio: the look's clamp of the current DPR, and never a canvas larger than the GPU's max texture size
    const r = this.renderer, max = r.capabilities.maxTextureSize || 4096;
    const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const [lo, hi] = this.look.pixelRatio;
    const pr = Math.min(Math.max(dpr, lo), hi, max / w, max / h);
    if (r.getPixelRatio() !== pr) r.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 38 : 28;
    this.camera.updateProjectionMatrix();
  }

  /** Fit the whole brush into the free band beside the toolbar (below it or above it), so nothing overlaps. */
  frameDefault(): void {
    const r = this.stage.getBoundingClientRect();
    if (!r.height) return;
    // keep the brush clear of the toolbar, wherever the stylesheet puts it (bottom on wide stages, top on narrow ones)
    const bar = this.stage.querySelector('.toolbar')?.getBoundingClientRect();
    const barOnTop = !!bar && bar.top + bar.height / 2 < r.top + r.height / 2;
    const top = Math.max(28, r.height * 0.06, bar && barOnTop ? bar.bottom - r.top + 14 : 0); // breathing room above the cap
    const bot = bar && !barOnTop ? r.bottom - bar.top + 14 : 16;
    const H = r.height, f = Math.max(0.3, (H - top - bot) / H);
    const box = new THREE.Box3();
    PARTS.forEach((p) => expandByObjectR128(box, this.groups[p.id]));
    if (box.isEmpty()) return;
    const h = box.max.y - box.min.y, cy = (box.max.y + box.min.y) / 2;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.fitD = h / (2 * t * f * 0.86); // the brush fills ~86% of the free band, so the cap and base never clip
    const visH = 2 * this.fitD * t;
    // shift so the brush centres in the free band, not the whole panel
    const target = new THREE.Vector3(0, cy + ((top - bot) / 2 / H) * visH, 0);
    const dir = new THREE.Vector3(16, 2, 47).normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, this.fitD);
    this.controls.maxDistance = Math.max(80, this.fitD * 1.8);
    this.controls.update();
    this.requestFrame();
  }

  /* ---------- contact shadow (legacy 1880-1891) ---------- */

  private readonly contactCanvas = document.createElement('canvas');

  private makeContact(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    // A soft pool of shade under the base grounds the brush, like a studio product shot.
    const c = this.contactCanvas;
    c.width = c.height = 256;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = -1;
    this.scene.add(m);
    return m;
  }

  /** Radial pool of shade, `alpha` = opacity at the centre, at 30% and at the edge (parity .38 / .16 / 0). */
  private drawContact(alpha: [number, number, number]): void {
    const x = this.contactCanvas.getContext('2d')!;
    x.clearRect(0, 0, 256, 256);
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, `rgba(60,45,40,${alpha[0]})`);
    g.addColorStop(0.3, `rgba(60,45,40,${alpha[1]})`);
    g.addColorStop(1, `rgba(60,45,40,${alpha[2]})`);
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    this.contact.material.map!.needsUpdate = true;
  }

  private placeContact(): void {
    const cb = this._cb.makeEmpty(), contact = this.contact, lc = this.look.contact;
    // parity keeps the r128 box (its floor sits ~1 unit under the base); the other looks seat it under the real base
    const expand = lc.box === 'r128' ? expandByObjectR128 : expandByMeshes;
    PARTS.forEach((p) => {
      if (p.id !== 'mount') expand(cb, this.groups[p.id]);
    });
    if (cb.isEmpty()) {
      contact.visible = false;
      this.ground.visible = false;
      return;
    }
    const w = Math.max(cb.max.x - cb.min.x, cb.max.z - cb.min.z);
    contact.visible = true;
    contact.position.set((cb.min.x + cb.max.x) / 2, cb.min.y - lc.drop, (cb.min.z + cb.max.z) / 2);
    const spread = 1 + 0.45 * this.ex + 0.08 * (this.lift / 3.2);
    contact.scale.set(w * lc.scale * spread, w * lc.scale * spread, 1);
    contact.material.opacity = 1 - 0.38 * this.ex - 0.1 * (this.lift / 3.2);
    if (this.floor) {
      this.ground.visible = true;
      this.ground.position.set(contact.position.x, cb.min.y - lc.drop - 0.01, contact.position.z);
      // fade distances in brush widths, so the pool scales with the brush (and spreads with it when taken apart)
      this.groundFade.value.set(this.floor.fade[0] * w, this.floor.fade[1] * w, this.floor.stretch);
    }
  }

  /* ---------- picking ---------- */

  private pickMeshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const p of PARTS)
      this.groups[p.id].traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !m.userData.isSticker) {
          m.userData.part = p.id;
          out.push(m);
        }
      });
    return out;
  }

  private hitAt(clientX: number, clientY: number): THREE.Intersection | undefined {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.far = Infinity;
    this.raycaster.firstHitOnly = true; // nearest hit per mesh; intersectObjects still sorts across meshes
    const meshes = this.pickMeshes();
    meshes.forEach(indexMesh); // a part swapped in since indexPicking() builds its index here, once
    return this.raycaster.intersectObjects(meshes, false)[0];
  }

  /** Build the hit-test index of every part in idle time, one mesh per slice, so the first hover never pays for it. */
  indexPicking(): void {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 50));
    const todo = this.pickMeshes().filter((m) => !m.geometry.boundsTree);
    const next = () => {
      const m = todo.shift();
      if (!m) return;
      indexMesh(m);
      idle(next);
    };
    idle(next);
  }

  partAt(clientX: number, clientY: number): PartId | null {
    const hit = this.hitAt(clientX, clientY);
    return hit ? (hit.object.userData.part as PartId) : null;
  }

  /** World-space hit point and normal on the brush surface. */
  raycastSurface(clientX: number, clientY: number): { part: PartId; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    const hit = this.hitAt(clientX, clientY);
    if (!hit?.face) return null;
    return {
      part: hit.object.userData.part as PartId,
      point: hit.point.clone(),
      normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld),
    };
  }

  /* ---------- on-demand loop (legacy 1893-1917, without the 400 ms polling block) ---------- */

  requestFrame(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      try {
        this.frame();
      } catch (e) {
        this.raf = 0;
        this.lastError = e; // boot's firstFrame() routes a first-render failure to the intro error
        throw e;
      }
    });
  }

  private frame(): void {
    this.raf = 0;
    const G = this.groups, rm = this.reduceMotion;
    const tgt = this.capLift && !this.exploded ? 3.2 : 0;
    this.lift = rm ? tgt : this.lift + (tgt - this.lift) * 0.12;
    if (Math.abs(this.lift - tgt) <= 0.001) this.lift = tgt;
    const et = this.exploded ? 1 : 0;
    this.ex = rm ? et : this.ex + (et - this.ex) * 0.1;
    if (Math.abs(this.ex - et) <= 0.001) this.ex = et;
    const ex = this.ex;
    G.head.position.set(0, 2.8 * ex, 0);
    G.cap.position.set(0, this.lift + 5.6 * ex, 0);
    G.grip.position.set(-3.2 * ex, 0, 0);
    G.mount.position.set(0, 0, -3.6 * ex);
    G.handle.position.set(0, 0, 0);
    G.button.position.set(0, 0, 0); // reset every frame so the pop offset never accumulates
    // a small hop (lift and settle) on parts that just changed; parts changed together hop together, so nothing separates
    const now = performance.now();
    let popping = false;
    for (const id of Object.keys(this.pops) as PartId[]) {
      const t = (now - this.pops[id]!.t0) / 1000;
      if (t > 0.32) {
        delete this.pops[id];
        continue;
      }
      G[id].position.y += Math.sin((Math.PI * t) / 0.32) * 0.16;
      popping = true;
    }
    if (this.camTo) {
      this.camera.position.lerp(this.camTo, rm ? 1 : 0.1);
      if (this.camera.position.distanceTo(this.camTo) < 0.05) this.camTo = null;
    }
    const damping = this.controls.update();
    this.placeContact();
    // parts that moved (take apart, cap lift, pops) move their shadows; camera-only frames keep the last map
    const pose = popping ? `pop${now}` : `${ex}|${this.lift}`;
    if (pose !== this.lastPose) this.shadowsDirty = true;
    this.lastPose = pose;
    this.ssao.render(this.scene, this.camera, this.shadowsDirty);
    this.shadowsDirty = false;
    this.frames++; // counted only once the frame has actually rendered
    if (damping || this.camTo || popping || this.ex !== et || this.lift !== tgt) this.requestFrame();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.controls.dispose();
    PARTS.forEach((p) => this.groups[p.id].children.forEach((c) => dispose(c)));
    disposeSnapshots(this);
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.contact.geometry.dispose();
    this.contact.material.map?.dispose();
    this.contact.material.dispose();
    this.scene.environment?.dispose();
    this.key.shadow.dispose();
    this.ssao.dispose();
    disposeWarmSticker();
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // hand the GL context back now (browsers cap live contexts), not at GC
  }
}
