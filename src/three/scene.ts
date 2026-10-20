import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { dimFor, PARTS } from '../data/parts';
import type { FinishId, PartId } from '../data/parts';
import type { Design } from '../state/design';
import { capCore, capEnvelope } from './capfit';
import type { CapCore } from './capfit';
import { applyFinish } from './materials';
import type { BrushMeta, CadGeo } from './model';
import { buildPart, dispose } from './parts/index';
import type { BuildCtx } from './parts/index';
import { makeEnv, makeRenderer } from './renderer';
import { SSAO } from './ssao';

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

const noop = () => {};

/** Re-finish a material built through `applyFinish`: back to its pre-finish values, then the new finish. */
export function refinish(m: THREE.MeshPhysicalMaterial, finish: FinishId): void {
  const b = m.userData.base as
    | { roughness: number; clearcoat: number; clearcoatRoughness: number; sheenRoughness?: number }
    | undefined;
  if (b) {
    m.roughness = b.roughness;
    m.clearcoat = b.clearcoat;
    m.clearcoatRoughness = b.clearcoatRoughness;
    if (b.sheenRoughness !== undefined) m.sheenRoughness = b.sheenRoughness;
  }
  // speckle() installs a shader patch; leaving speckle must remove it
  m.onBeforeCompile = noop;
  m.customProgramCacheKey = () => '';
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
  /** Frames rendered (diagnostics / idle check). */
  frames = 0;

  private readonly stage: HTMLElement;
  private readonly cad: CadGeo;
  private readonly meta: BrushMeta;
  private readonly capFit: Record<string, CapCore>;
  private readonly ssao: SSAO;
  private readonly contact: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
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
  private uploadCap: { geo: THREE.BufferGeometry; core: CapCore } | null = null;
  private readonly _cb = new THREE.Box3();

  constructor(stage: HTMLElement, model: { cad: CadGeo; meta: BrushMeta }, capFit: Record<string, CapCore>) {
    this.stage = stage;
    this.cad = model.cad;
    this.meta = model.meta;
    this.capFit = capFit;
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* main scene (legacy 1081-1117) */
    const renderer = (this.renderer = makeRenderer());
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    stage.prepend(renderer.domElement);
    // soft shadows: the brush shades the mount behind it, parts shade each other where they meet
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false; // updated once per frame in SSAO.render
    const scene = (this.scene = new THREE.Scene());
    scene.environment = makeEnv(renderer);
    const key = new THREE.DirectionalLight(0xfff8f0, 0.45);
    key.position.set(-20, 26, 16);
    scene.add(key);
    key.target.position.set(0, 11, 0);
    scene.add(key.target);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    Object.assign(key.shadow.camera, { left: -9, right: 9, top: 15, bottom: -15, near: 1, far: 80 });
    key.shadow.camera.updateProjectionMatrix();
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

    this.ro = new ResizeObserver(() => {
      this.resize();
      if (!this.userMoved) this.frameDefault();
      this.requestFrame();
    });
    this.ro.observe(stage);
    this.resize();
  }

  /* ---------- design ---------- */

  applyDesign(next: Design, prev: Design | null): void {
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
    ctx.capCore = this.capCoreFor(d, ctx);
    return ctx;
  }

  private capCoreFor(d: Design, ctx: BuildCtx): CapCore {
    if (d.parts.head !== 'upload') return this.capFit[d.parts.head];
    const geo = this.uploads.head;
    if (!geo) return this.capFit.plain;
    if (this.uploadCap?.geo !== geo) {
      const head = buildPart('head', 'upload', '#ffffff', ctx);
      this.uploadCap = { geo, core: capCore(capEnvelope(head)) };
      dispose(head);
    }
    return this.uploadCap.core;
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

  private popPart(id: PartId): void {
    if (!this.popReady || this.reduceMotion) return;
    this.pops[id] = { t0: performance.now() };
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

  private resize(): void {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 38 : 28;
    this.camera.updateProjectionMatrix();
  }

  /** Fit the whole brush into the free band above the toolbar, so nothing overlaps. */
  frameDefault(): void {
    const r = this.stage.getBoundingClientRect();
    if (!r.height) return;
    const bar = this.stage.querySelector('.toolbar');
    const top = Math.max(28, r.height * 0.06); // breathing room above the cap
    const bot = bar ? r.bottom - bar.getBoundingClientRect().top + 14 : 0;
    const H = r.height, f = Math.max(0.3, (H - top - bot) / H);
    const box = new THREE.Box3();
    PARTS.forEach((p) => box.expandByObject(this.groups[p.id]));
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

  private makeContact(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    // A soft pool of shade under the base grounds the brush, like a studio product shot.
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(60,45,40,.38)');
    g.addColorStop(0.3, 'rgba(60,45,40,.16)');
    g.addColorStop(1, 'rgba(60,45,40,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = -1;
    this.scene.add(m);
    return m;
  }

  private placeContact(): void {
    const cb = this._cb.makeEmpty(), contact = this.contact;
    PARTS.forEach((p) => {
      if (p.id !== 'mount') cb.expandByObject(this.groups[p.id]);
    });
    if (cb.isEmpty()) {
      contact.visible = false;
      return;
    }
    const w = Math.max(cb.max.x - cb.min.x, cb.max.z - cb.min.z);
    contact.visible = true;
    contact.position.set((cb.min.x + cb.max.x) / 2, cb.min.y - 0.02, (cb.min.z + cb.max.z) / 2);
    const spread = 1 + 0.45 * this.ex + 0.08 * (this.lift / 3.2);
    contact.scale.set(w * 1.7 * spread, w * 1.7 * spread, 1);
    contact.material.opacity = 1 - 0.38 * this.ex - 0.1 * (this.lift / 3.2);
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
    return this.raycaster.intersectObjects(this.pickMeshes(), false)[0];
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
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = 0;
    this.frames++;
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
    G.charm.position.set(2.6 * ex, 0, 0);
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
    this.ssao.render(this.scene, this.camera);
    if (damping || this.camTo || popping || this.ex !== et || this.lift !== tgt) this.requestFrame();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    this.controls.dispose();
    PARTS.forEach((p) => this.groups[p.id].children.forEach((c) => dispose(c)));
    this.renderer.dispose();
  }
}
