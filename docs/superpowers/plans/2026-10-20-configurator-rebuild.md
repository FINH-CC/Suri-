# SURI Kids Lab Configurator Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the single-file SURI Kids Lab 3D toothbrush configurator as a Vite + TypeScript app that loads fast, never freezes on a click, has one linear flow, and works on a phone, while keeping today's 3D look.

**Architecture:** The client CAD moves out of the HTML into a compressed `.glb`; option tiles become pre-rendered images; cap fitting is precomputed. One typed store notifies two subscribers (the Three.js scene and the DOM) which each diff previous vs next state and touch only what changed. The 3D code is ported from `legacy/index.html` module by module and checked against reference screenshots of the current build.

**Tech Stack:** Node 24, Vite 6 or newer, TypeScript 5 or newer (strict), three (current release, r170+), @gltf-transform/core + /functions (meshopt), Vitest, Playwright. No UI framework. Static deploy to Vercel project finhcc/suri via the CLI.

**Spec:** `docs/superpowers/specs/2026-10-20-configurator-rebuild-design.md` (and the audit in `docs/2026-10-20-audit.md`).

## Global Constraints

- Branch `fixes` in `/Users/alexisbardini/Documents/Code Project/Clients/Suri`; commit locally after every task; do not push and do not deploy production until Task 18.
- Keep today's copy, colours, part names, option names, character names and tag lines verbatim (copied from `legacy/index.html` lines 567–612 and the markup). Never invent product facts.
- State shape, `localStorage` keys `suri-kids-current` and `suri-kids-designs`, and the `#d=` share encoding stay exactly as in the legacy build.
- Fonts: keep `public/fonts/plain-*.woff2` and the `@font-face` rules with their `unicode-range` (legacy lines 11–16) unchanged.
- Light scheme only; `prefers-reduced-motion` disables pops, the intro jump and camera lerps.
- Budgets (spec §6): HTML+CSS+JS ≤ 350 KB gzip; `brush.glb` ≤ 2.5 MB gzip; tiles ≤ 400 KB; swatch/simple-tile click → paint ≤ 50 ms; head tile or any rebuild with stickers ≤ 200 ms; finish change ≤ 100 ms. Measured by hand on a real GPU (Task 18); Playwright checks behaviour only.
- Drawing mode is dropped. Keep SSAO's normal+depth pass (it is what drawing mode shared).
- The 3D is accepted only against `docs/reference/*.png` (Task 2). Preference: current three; fallback: pin `three@0.128.0` from npm with materials byte-for-byte.
- No cross-client references in code, copy or commit messages.

## Review Focus

1. A share link made by the legacy build with a part option or sticker type that no longer exists (or garbage after `#d=`) must load the default for the bad field and never crash. → test in Task 5.
2. `localStorage` throwing (Safari private mode, quota full) must not break loading, undo, Save design or Share. → tests in Task 5 and Task 15.
3. The model request failing (offline, 404, aborted) must show "Couldn't load the brush" with a working Retry, not an empty stage. → test in Task 12.
4. Choosing a non-STL file, an empty file, or an STL over the limit must leave the design unchanged and show a toast. → test in Task 13.
5. Changing the head (or any part) while stickers are on that part must re-project the surviving stickers and silently drop any that no longer hit a surface, never throw. → test in Task 10.

---

## File structure

```
index.html                      Vite entry: markup shell (header, stage, 4 step sections, dialog, toast)
package.json / tsconfig.json / vite.config.ts / vitest.config.ts / playwright.config.ts
vercel.json                     { "outputDirectory": "dist" } plus long cache headers for /model and /tiles
src/main.ts                     boot sequence (Task 12)
src/data/palette.ts             N, FAM, SWATCHES, PRESETS, mixing helpers that need no three
src/data/parts.ts               PARTS, PART, FINISHES, STICKERS, DIM constants
src/data/characters.ts          CHARACTERS, DEFAULT
src/state/design.ts             Design, Sticker types; validate(); encode()/decode()
src/state/store.ts              createStore(): get/update/subscribe/undo, persistence
src/three/renderer.ts           makeRenderer, neutral tone mapping, makeEnv
src/three/materials.ts          lin, mixHex, lum, surfaceColour, plastic, speckle, applyFinish, siliconeSheen, METAL, GREY, INK
src/three/model.ts              loadModel(url, onProgress) → CadGeo; brush-meta.json types
src/three/capfit.ts             capEnvelope, capCore, coreOuter, sq, smax, CapCore type (shared with scripts)
src/three/parts/{handle,button,head,grip,cap,charm,mount}.ts   one builder each: (style, hex, ctx) → Group
src/three/parts/index.ts        buildPart(id, style, hex, ctx), dispose()
src/three/stickers.ts           drawSticker(), sticker textures/urls, decalFor(), projectStickers()
src/three/scene.ts              Scene class: groups, controls, camera, animation, SSAO, contact shadow, frameDefault, views, on-demand loop, applyDesign(prev,next)
src/three/snapshot.ts           snapshot(scene, design, pose, w, h) → data URL
src/ui/flow.ts                  step state, goStep(), track + bottom bar
src/ui/start.ts                 character cards
src/ui/design.ts                colourway+finish card, part cards, stickers card, surprise, reset, upload
src/ui/nameit.ts                name input, box mock, passport (incl. MRZ helpers)
src/ui/handover.ts              review list, grown-up check, checkout
src/ui/designs.ts               My designs dialog
src/ui/share.ts                 share button
src/ui/intro.ts                 intro/loader/progress/error+retry
src/ui/toast.ts                 toast()
src/styles/*.css                base.css, header.css, stage.css, cards.css, flow.css, prints.css, mobile.css
public/model/brush.glb, public/model/brush-meta.json, public/model/cap-fit.json
public/tiles/{part}-{option}.webp, public/tiles/char-{id}.webp
public/fonts/plain-*.woff2
scripts/capture-reference.ts, scripts/extract-cad.ts, scripts/cap-fit.ts, scripts/render-tiles.ts
tests/unit/*.test.ts            Vitest
tests/e2e/*.spec.ts             Playwright
legacy/index.html, legacy/fonts/   the current build, served for reference capture and parity checks
docs/reference/*.png            17 reference screenshots
```

Module import rule: `src/data` and `src/state` import nothing from `src/three` or `src/ui`; `src/three` never imports `src/ui`; only `src/main.ts` wires them together.

---

### Task 1: Scaffold the project and park the legacy build

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore` (add `node_modules`, `dist`, `test-results`, `playwright-report`), `index.html` (temporary placeholder: `<h1>SURI Kids Lab</h1>`), `src/main.ts` (empty), `tests/unit/smoke.test.ts`, `tests/e2e/legacy.spec.ts`
- Move: `index.html` → `legacy/index.html`, `fonts/` → `legacy/fonts/` (git mv), and copy `legacy/fonts/*` → `public/fonts/`
- Remove: `.nojekyll`

**Interfaces:**
- Produces: npm scripts `dev` (vite, port 3240), `build`, `preview`, `test` (vitest run), `e2e` (playwright test), `legacy` (`vite preview --outDir legacy --port 3241`: serves the old build for Tasks 2 and 18).

- [ ] **Step 1:** `npm init -y`; install `vite typescript three @types/three vitest @playwright/test @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer tsx` as devDependencies (three as a dependency). `npx playwright install chromium`.
- [ ] **Step 2:** Write `tsconfig.json` with `"strict": true`, `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"types": ["vite/client"]`, include `src`, `scripts`, `tests`.
- [ ] **Step 3:** Write `vite.config.ts` (server and preview port 3240) and `vitest.config.ts` (`environment: 'node'`, include `tests/unit/**/*.test.ts`). Write `playwright.config.ts` with `webServer: { command: 'npm run dev', port: 3240 }`, two projects: `desktop` (1280×900 Chromium) and `mobile` (`devices['iPhone 13']`), `use.launchOptions.args: ['--use-gl=angle','--use-angle=swiftshader']`.
- [ ] **Step 4:** Write `tests/unit/smoke.test.ts` asserting `1 + 1 === 2`, and `tests/e2e/legacy.spec.ts` that opens `http://localhost:3241/` and expects the title `SURI Kids lab · Brush` (uses its own `webServer` via a second config entry, or starts `npm run legacy` manually; pick one and document it in the script).
- [ ] **Step 5:** Run `npm test` → PASS. Run `npm run build` → `dist/index.html` exists. Run `npm run legacy` and `curl -s localhost:3241 | head -3` → the legacy doctype.
- [ ] **Step 6:** Update `../.claude/launch.json` entry `suri` to `npm run dev` in this folder (port 3240).
- [ ] **Step 7:** Commit: `chore: scaffold vite project, park legacy build`.

---

### Task 2: Capture reference screenshots of the legacy build

**Files:**
- Create: `scripts/capture-reference.ts`, `docs/reference/README.md`
- Output: `docs/reference/{pip,puff,splash,nova}-{front,side,back,iso}.png`, `docs/reference/nova-apart.png` (17 files, 1200×900)

**Interfaces:**
- Consumes: `npm run legacy` on port 3241.
- Produces: the acceptance images used by Task 18.

- [ ] **Step 1:** Write the script with Playwright `chromium.launch({ headless: false })` (real GPU), viewport 1600×1000, `page.goto('http://localhost:3241/')`, wait for `#intro` to be removed, then for each character: click the card `#chars .char[data-id=<id>]`, wait 800 ms, for each of the four view buttons `#tb-views [data-view=<i>]` click, wait 1200 ms (camera lerp), screenshot the element `#stage` clipped to 1200×900 to the named file. For `nova-apart`: Nova, Iso, click `#tb-apart`, wait 1200 ms.
- [ ] **Step 2:** Run `npm run legacy &` then `npx tsx scripts/capture-reference.ts`. Expected: 17 PNGs, each showing a coloured brush (open two by eye).
- [ ] **Step 3:** Write `docs/reference/README.md`: what the images are, the command, and that they are the parity target from spec §6.
- [ ] **Step 4:** Commit: `docs: reference screenshots of the legacy build`.

---

### Task 3: Extract the CAD into `brush.glb` and `brush-meta.json`

**Files:**
- Create: `scripts/extract-cad.ts`, `tests/unit/extract-cad.test.ts`
- Output: `public/model/brush.glb`, `public/model/brush-meta.json`

**Interfaces:**
- Produces: a glTF whose meshes are named `handle/body`, `handle/button`, `handle/seal`, `handle/metal-N` (one per remaining handle sub, N from 0), `head/pad`, `mount/body`, `mount/insert`, `mount/other-N`; positions as float32 in the legacy's units (scene units = 10 mm), normals copied from the source (never recomputed), indices preserved. `brush-meta.json` = `{ tufts: number[][], tuftFaceZ: number, gripProfile: unknown, roles: Record<string, string> }` where `roles` maps mesh name → legacy role.

- [ ] **Step 1:** Write the test: run the extractor as a function `extractCad(legacyHtmlPath, outDir)` and assert the glb's total vertex count is 353564 and triangle count 615832 (read back with `@gltf-transform/core` `NodeIO`), that a mesh named `handle/body` exists, and that `brush-meta.json` has 59 tufts and `tuftFaceZ === 0.24`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/extract-cad.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `extractCad(legacyHtmlPath: string, outDir: string): Promise<void>` in `scripts/extract-cad.ts`: read `legacy/index.html`, take the line that starts with `<script id="cad-data"`, strip the tags, `JSON.parse`; for each of `handle`, `head`, `mount` decode each sub with the same logic as legacy lines 744–772 (`b64`, `gunzip` via Node's `zlib.gunzipSync`, `buildCadGeo` dequantisation `q/65535*size+min`, normals `/127` or `/32767`); build a Document with one Node + Mesh + Primitive per sub; run `quantize({ quantizePosition: 14, quantizeNormal: 10 })` then `meshopt({ encoder: MeshoptEncoder, level: 'medium' })` from `@gltf-transform/functions`, register `EXT_meshopt_compression` and `KHR_mesh_quantization`; write the glb and the meta JSON. Role naming: legacy `role` field `body|button|seal|insert`; anything else becomes `metal-N`/`other-N`.
- [ ] **Step 4:** Run the test → PASS. Run `gzip -9c public/model/brush.glb | wc -c` and record the number in the script's header comment. Expected ≤ 2 621 440 (2.5 MB). If larger, apply `simplify({ ratio: 0.75, error: 0.0005 })` per primitive except `handle/button` and `handle/seal`, re-measure, and record the ratio; do not go below the point where an edge in `docs/reference/nova-front.png` visibly changes (compare in Task 18).
- [ ] **Step 5:** Add `"extract-cad": "tsx scripts/extract-cad.ts"` to package.json scripts. Commit: `feat(model): extract client CAD to compressed glb`.

---

### Task 4: Data modules

**Files:**
- Create: `src/data/palette.ts`, `src/data/parts.ts`, `src/data/characters.ts`, `tests/unit/data.test.ts`

**Interfaces:**
- Produces (exact exports):
  - palette: `N: string`, `FAM: Record<'lilac'|'green'|'coral'|'yellow'|'blue', { name: string; light: string; bold: string }>`, `SWATCHES: [hex: string, name: string][]`, `PRESETS: { name: string; c: Record<PartId, string> }[]`, `HEX: RegExp`, `swatchName(hex: string): string`, `mixHex(a: string, b: string, t: number): string` (pure sRGB lerp, no three), `lum(hex: string): number` (linear luminance as legacy line 678).
  - parts: `type PartId = 'cap'|'head'|'grip'|'handle'|'button'|'charm'|'mount'`, `PARTS: { id: PartId; name: string; sub: string; options: Record<string, string> }[]`, `PART: Record<PartId, PartDef>`, `FINISHES`, `type FinishId = 'matte'|'satin'|'speckle'`, `STICKERS: Record<StickerType, string>`, `type StickerType`, `DIM` (legacy lines 775–781, with `padFrontZ` read from meta at runtime, so `DIM.padFrontZ` is a function of `tuftFaceZ`: export `dimFor(tuftFaceZ: number)`).
  - characters: `CHARACTERS` (incl. `blank`), `type CharacterId`, `DEFAULT: Design` (Nova), `presetC(name)`.

- [ ] **Step 1:** Write tests: `SWATCHES.length === 11`, `PRESETS.length === 10` and `PRESETS[1].name === 'Lilac B'`, `CHARACTERS.puff.colours.cap === '#adaae1'`, `PART.cap.options.bubble === 'Pebble'`, `mixHex('#000000','#ffffff',.5) === '#808080'` (match legacy's `THREE.Color.lerp` on sRGB values: legacy lerps the already-decoded sRGB components, so a plain per-channel lerp rounded with `Math.round` is correct), `lum('#ffffff') === 1`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port legacy lines 567–612 verbatim into the three files (strings unchanged). `mixHex`: `new THREE.Color(a).lerp(new THREE.Color(b), t)` in r128 lerps in the colour's stored (sRGB-as-given) space; implement per channel `Math.round(a + (b - a) * t)`.
- [ ] **Step 4:** Run → PASS. Commit: `feat(data): palette, parts, characters`.

---

### Task 5: Design type, validate, encode/decode, store with undo and persistence

**Files:**
- Create: `src/state/design.ts`, `src/state/store.ts`, `tests/unit/design.test.ts`, `tests/unit/store.test.ts`

**Interfaces:**
- Produces:
  - `type Sticker = { t: StickerType; p: PartId; x: number; y: number; z: number; nx: number; ny: number; nz: number; s: number; r: number }`
  - `type Design = { parts: Record<PartId, string>; colours: Record<PartId, string>; stickers: Sticker[]; name: string; finish: FinishId; character: CharacterId | '' }`
  - `validate(input: unknown, opts?: { uploads?: Partial<Record<PartId, boolean>> }): Design` (legacy lines 619–631; `'upload'` is kept for a part only when `opts.uploads[part]` is true)
  - `encode(d: Design): string` (base64 of JSON with uploads replaced by `DEFAULT.parts[id]`, legacy line 1630) and `decode(hash: string): Design | null` (accepts with or without the leading `#d=`, legacy line 632).
  - `createStore(init: { load: () => string | null; save: (json: string) => void; now?: () => number }): Store` with `Store = { get(): Design; update(patch: Partial<Design> | ((d: Design) => Design), opts?: { history?: boolean }): void; replace(d: Design): void; subscribe(fn: (next: Design, prev: Design) => void): () => void; undo(): boolean; canUndo(): boolean; }`. Rules: every `update`/`replace` runs `validate`, snapshots for undo (collapse when `now() - lastPush < 700`, max 50 entries), calls `save(JSON.stringify(next))` inside try/catch, then notifies. `undo()` restores without pushing history and returns whether anything changed.

- [ ] **Step 1:** Write `design.test.ts`: `validate({})` equals `DEFAULT` minus `character` behaviour (character `'nova'`); `validate({ parts: { cap: 'nope' }, stickers: [{ t: 'ghost', p: 'cap' }] })` gives `parts.cap === 'bubble'` and `stickers.length === 0`; `validate({ name: 'a<b>cdefghijklmnopq' }).name === 'abcdefghijklmn'`; `validate({ parts: { cap: 'upload' } }).parts.cap === 'bubble'` but with `{ uploads: { cap: true } }` it stays `'upload'`; `decode(encode(DEFAULT))` deep-equals `DEFAULT`; `decode('#d=not-base64!')` is `null`; the exact legacy hash `#d=` + `btoa(unescape(encodeURIComponent(JSON.stringify({parts:{cap:'cloud'}}))))` decodes with `parts.cap === 'cloud'` (Review Focus 1).
- [ ] **Step 2:** Write `store.test.ts` with an in-memory `load/save` and a fake clock: `update` then `get()` reflects the patch; subscribers get `(next, prev)`; two updates 100 ms apart collapse into one undo step, two updates 1000 ms apart make two; `undo()` after 60 updates leaves at most 50 steps; `save` throwing does not throw out of `update` and the state still changes (Review Focus 2); `load` returning invalid JSON falls back to `DEFAULT`.
- [ ] **Step 3:** Run both → FAIL.
- [ ] **Step 4:** Implement both files. `createStore` initial state = `validate(decode(location hash) ?? JSON.parse(load()) ?? DEFAULT)` is the caller's job: the store takes `initial: Design` as a second parameter: `createStore(initial, io)`. Adjust the signature accordingly in the tests before implementing.
- [ ] **Step 5:** Run → PASS. Commit: `feat(state): design validation, share encoding, store with undo`.

---

### Task 6: Renderer, environment, materials, model loader

**Files:**
- Create: `src/three/renderer.ts`, `src/three/materials.ts`, `src/three/model.ts`, `tests/unit/materials.test.ts`

**Interfaces:**
- Produces:
  - `makeRenderer(opts?: THREE.WebGLRendererParameters): THREE.WebGLRenderer` (legacy 717–721: `outputColorSpace = SRGBColorSpace`, custom neutral tone mapping from legacy 658–676 patched into `ShaderChunk.tonemapping_pars_fragment`, exposure 1.05, clear alpha 0).
  - `makeEnv(renderer): THREE.Texture` (legacy 722–738 verbatim).
  - materials: `lin(hex): THREE.Color` (in current three: `new THREE.Color().setStyle(hex)` already yields linear when ColorManagement is on, so `lin` = `new THREE.Color(hex)`; keep the name so ports read the same), `mixHex` and `lum` re-exported from palette, `surfaceColour`, `siliconeSheen(hex): { sheen: number; sheenColor: THREE.Color }` (r128 `sheen: Color(c*.32)` → current `sheen: .32, sheenColor: c`), `plastic(hex, o?)`, `speckle(mat)`, `applyFinish(mat, finish: FinishId)`, `METAL()`, `GREY()`, `INK`.
  - `type CadGeo = Record<'handle'|'head'|'mount', { role: string; geo: THREE.BufferGeometry }[]>`; `loadModel(url: string, metaUrl: string, onProgress: (loaded: number, total: number) => void): Promise<{ cad: CadGeo; meta: BrushMeta }>` using `GLTFLoader` + `MeshoptDecoder` from `three/addons/libs/meshopt_decoder.module.js`; each loaded geometry gets `computeBoundingBox/Sphere` and `userData.keepGeo = true` on meshes made from it.

- [ ] **Step 1:** Write `materials.test.ts` (Vitest with `environment: 'node'`; three's Color works without WebGL): `surfaceColour('#ffffff')` has `r` within 0.001 of `0.8`; `surfaceColour('#808080')` has `r` within 0.01 of `lin('#808080').r`; `siliconeSheen('#adaae1').sheen === 0.32`; `applyFinish(plastic('#fff'), 'satin').roughness === 0.36`; `applyFinish(plastic('#fff'), 'speckle').customProgramCacheKey() === 'speckle'`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port legacy 656–738 into the two files with the API changes listed in spec §6 (`reflectivity: .35` → `ior: 1.45`, remove `sRGBEncoding`). `plastic` keeps `m.userData.flatColour`? No: drop it (drawing mode only).
- [ ] **Step 4:** Implement `loadModel` in `model.ts`; map glTF mesh names back to `{ role }` via `meta.roles`, grouping by the name's prefix (`handle/…`).
- [ ] **Step 5:** Run → PASS. Commit: `feat(three): renderer, environment, materials, glb loader`.

---

### Task 7: Part builders (handle, button, head, grip, charm, mount)

**Files:**
- Create: `src/three/parts/{handle,button,head,grip,charm,mount}.ts`, `src/three/parts/index.ts`, `src/three/parts/context.ts`, `tests/unit/parts.test.ts`

**Interfaces:**
- Produces: `type BuildCtx = { cad: CadGeo; dim: ReturnType<typeof dimFor>; tufts: number[][]; finish: FinishId; headStyle: string; uploads: Partial<Record<PartId, THREE.BufferGeometry>> }`; each builder `build<Part>(style: string, hex: string, ctx: BuildCtx): THREE.Group`; `buildPart(id: PartId, style: string, hex: string, ctx: BuildCtx): THREE.Group` (handles `'upload'` as legacy 1073–1078); `dispose(obj: THREE.Object3D): void` (legacy 1079).
- Note: `cap` is Task 8; `index.ts` imports it, so Task 7's test registers a stub for cap or the test only calls the six builders directly.

- [ ] **Step 1:** Write `parts.test.ts` using a `ctx` whose `cad` is built from `public/model/brush.glb` loaded with `NodeIO` from `@gltf-transform/core` (no WebGL needed to build geometry): `buildHead('ears', '#ffffff', ctx)` contains one `InstancedMesh` with `count === 59` and two extra sphere meshes beyond the plain head's count; `buildGrip('dots', ..)` contains an `InstancedMesh` with `count === 100`; `buildCharm('none', ..)` has zero children; `buildCharm('star', ..)` bounding box `min.x > ctx.dim.handleHalfX` (hangs clear of the handle); `buildMount('arch', ..)` has 3 meshes.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port legacy `B.handle`…`B.mount` (lines 904–1071 minus `cap`), replacing closures over `state`/`cadParts`/`DIM`/`CAD.tufts` with `ctx`. `applyFinish(m, ctx.finish)`.
- [ ] **Step 4:** Run → PASS. Commit: `feat(three): port part builders`.

---

### Task 8: Cap fit module, cap builder, and the precompute script

**Files:**
- Create: `src/three/capfit.ts`, `src/three/parts/cap.ts`, `scripts/cap-fit.ts`, `tests/unit/capfit.test.ts`
- Output: `public/model/cap-fit.json` = `Record<headStyle, CapCore>`

**Interfaces:**
- Produces: `type CapCore = { a: number; b: number; cz: number; y0: number; top: number; ceil: number }`; `capEnvelope(head: THREE.Group): CapEnvelope` (takes the built head, not a style, so scripts and the upload path share it; legacy 784–818); `capCore(env: CapEnvelope): CapCore` (legacy 820–829); `coreOuter`, `sq`, `smax`, `CAP_WALL`; `buildCap(style: string, hex: string, ctx: BuildCtx & { capCore: CapCore }): THREE.Group` (legacy 990–1030 + `CAP_STYLES` 846–902 + `addCapAccessory` 837–845).
- Runtime rule (spec §6): `scene.ts` reads `cap-fit.json` for `plain|ears|spots`; for an uploaded head it calls `capCore(capEnvelope(builtHead))` once and caches it.

- [ ] **Step 1:** Write `capfit.test.ts`: run `capCore(capEnvelope(buildHead('plain', '#fff', ctx)))` and assert `top > y0`, `a > 0.4 && a < 1.5`, `b > 0.4 && b < 1.5`, and that the result deep-equals `public/model/cap-fit.json['plain']` within 1e-6 (so the script and the module cannot drift). `buildCap('bubble', '#fff', ctxWithCore)` returns a group with 3 meshes; `buildCap('hat', …)` with more than 3.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port the cap-fit functions and `buildCap`. Write `scripts/cap-fit.ts`: load the glb with NodeIO → `CadGeo`, build each head style, write the JSON with 6 decimals. Add script `"cap-fit": "tsx scripts/cap-fit.ts"`; run it.
- [ ] **Step 4:** Run → PASS. Commit: `feat(three): cap fit precompute and cap builder`.

---

### Task 9: Scene: groups, controls, animation, SSAO, contact shadow, framing, on-demand loop

**Files:**
- Create: `src/three/scene.ts`, `src/three/ssao.ts` (legacy 1789–1853 minus drawing-mode materials), `tests/unit/scene-diff.test.ts`

**Interfaces:**
- Produces `class BrushScene`:
  - `constructor(stage: HTMLElement, model: { cad: CadGeo; meta: BrushMeta }, capFit: Record<string, CapCore>)`
  - `applyDesign(next: Design, prev: Design | null): void` — rebuilds only the parts whose `partKey` changed (`partKey(id, d) = [d.parts[id], d.colours[id], d.finish, id==='cap'?d.parts.head:'', id==='head'?d.colours.head:''].join('|')`), swaps materials for a finish-only change (walk meshes, `applyFinish` on clones of the base material; no geometry rebuild), re-projects stickers when any part or the sticker list changed (Task 10 hook `onPartsChanged`), pops changed parts.
  - `setExploded(on: boolean)`, `setCapLift(on: boolean)`, `setView(i: 0|1|2|3)`, `frameDefault()`, `requestFrame()`, `on('userMove', fn)`, `partAt(clientX, clientY): PartId | null`, `raycastSurface(clientX, clientY): { part: PartId; point: Vector3; normal: Vector3 } | null`, `uploads: BuildCtx['uploads']`, `groups: Record<PartId, THREE.Group>`, `renderer`, `camera`, `controls`.
  - Loop: `requestFrame()` schedules one `requestAnimationFrame`; the frame renders and re-requests itself only while `exploded/lift/pop/camTo` animations are mid-way or `controls` are damping (`controls.update()` returns true) — legacy 1896–1917 logic, without the 400 ms polling block.
- Pure helper exported for testing: `partsToRebuild(prev: Design | null, next: Design): PartId[]` and `finishOnly(prev, next): boolean`.

- [ ] **Step 1:** Write `scene-diff.test.ts`: `partsToRebuild(null, DEFAULT)` is all 7; changing `colours.cap` → `['cap']`; changing `parts.head` → `['head','cap']`; changing only `finish` → `[]` and `finishOnly === true`; changing `name` → `[]`.
- [ ] **Step 2:** Run → FAIL. Implement the helpers. Run → PASS.
- [ ] **Step 3:** Port the scene: legacy 1081–1117 (groups, lights, camera, controls), 1677–1686 (take apart, views, `VIEWS` constants), 1835–1853 (`renderReal` as the frame's render), 1855–1878 (`frameDefault`, resize observer), 1880–1891 (contact shadow), 1893–1917 (loop). Keep `renderer.shadowMap.autoUpdate=false; needsUpdate=true` per frame.
- [ ] **Step 4:** Manual check: temporary `src/main.ts` that loads the model and shows Nova; `npm run dev`, open http://localhost:3240, confirm the brush renders, orbits, Take apart animates, idle CPU is flat (DevTools Performance: no rAF when idle).
- [ ] **Step 5:** Commit: `feat(three): scene with diff-based rebuilds and on-demand loop`.

---

### Task 10: Stickers: artwork, decals, placement

**Files:**
- Create: `src/three/stickers.ts`, `tests/unit/stickers.test.ts`
- Modify: `src/three/scene.ts` (call `projectStickers` from `applyDesign`)

**Interfaces:**
- Produces: `stickerUrl(type: StickerType): string` and `stickerTexture(type)` (legacy 1175–1195, canvas art drawn once, lazily); `projectStickers(scene: BrushScene, stickers: Sticker[]): { placed: number; dropped: number }` (legacy 1201–1222: parts at rest, decal per sticker, parented to the part group; a sticker whose ray hits nothing is skipped); `placeSticker(scene, type, clientX, clientY, size, rot): Sticker | null` (legacy 1226–1239 hit → part-local coords).

- [ ] **Step 1:** Write `stickers.test.ts` (node, with jsdom `canvas` unavailable → test only the pure part): `toPartLocal(point, groupPosition)` and the rounding to 3 decimals; and a test that `projectStickers` with a sticker whose normal points away from any surface returns `dropped === 1` and does not throw, using a scene stub exposing `groups` with one `Mesh(BoxGeometry)` (Review Focus 5).
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3:** Manual: in the temporary main, arm a sticker via console and click the brush; it appears, and moving to Take apart carries it with its part.
- [ ] **Step 4:** Commit: `feat(three): sticker decals and placement`.

---

### Task 11: Snapshot facility

**Files:**
- Create: `src/three/snapshot.ts`

**Interfaces:**
- Produces: `snapshot(scene: BrushScene, design: Design, pose: 'hero' | 'tile', w: number, h: number, opts?: { part?: PartId; style?: string }): string` (data URL PNG). `hero` = legacy `brushHero` camera (1459–1472: perspective fov 24, rotation `(.08,.5,-.5)`, direction `(.35,-.3,1)`, fit factor 1.04) over all parts except mount; `tile` = legacy `thumbOfRaw` (1151–1171) framing with `THUMB_VIEW` per part (lines 1130–1138), including the `minY` clipping plane for `head`. Renders into a `WebGLRenderTarget` with the scene's renderer, environment and key light, no backdrop, no SSAO, no contact shadow; parts built from the `design` argument via `buildPart` and disposed after. Never touches the live groups.

- [ ] **Step 1:** Implement (no unit test possible without WebGL; covered by Task 16's script output and Task 17's e2e).
- [ ] **Step 2:** Manual: console `snapshot(scene, store.get(), 'hero', 280, 360)` → opens as an image showing the leaning hero pose matching legacy's passport photo.
- [ ] **Step 3:** Commit: `feat(three): off-screen snapshot facility`.

---

### Task 12: App shell, styles, intro/loader/error, flow, Start screen

**Files:**
- Create: `index.html` (final markup), `src/styles/{base,header,stage,cards,flow,prints,mobile}.css`, `src/ui/flow.ts`, `src/ui/intro.ts`, `src/ui/start.ts`, `src/ui/toast.ts`, `src/main.ts` (final boot), `tests/e2e/load.spec.ts`

**Interfaces:**
- Markup ids kept from legacy where the UI code references them: `intro`, `stage`, `undo`, `placing-hint`, `tb-apart`, `tb-views`, `info`, `steps`, `step-1..4` (four sections: Start, Design, Name it, Hand over), `chars`, `presets`, `finishes`, `part-cards` (new container replacing `build-sections`/`style-sections`), `sticker-card`, `sticker-tiles`, `st-size`, `st-rot`, `sticker-list`, `clear-stickers`, `surprise`, `reset`, `char-name`, `box-mock`, `passport`, `review`, `grownup`, `checkout`, `step-back`, `step-next`, `designs-dlg`, `designs`, `designs-empty`, `save-design`, `open-designs`, `close-designs`, `share`, `file`, `toast`. Drop: `stage-title`, `pills`, `hint`, `views`, `tabs`, `features`, `to-stickers` banner, `loader`.
- `flow.ts`: `type Step = 1|2|3|4`; `createFlow(opts: { onEnter: (step: Step) => void }): { goStep(n: Step, scroll?: boolean): void; step(): Step }`; labels `['Start','Design','Name it','Hand over']`; bottom bar Next text `Next: <label of n+1>`, Back hidden on 1, Next hidden on 4.
- `intro.ts`: `showProgress(loaded, total)`, `finish()` (plays the jump then slides out, legacy 1940–1952 timing), `fail(err: unknown, retry: () => void)` renders "Couldn't load the brush" + a Retry button.
- `main.ts` boot order: read hash/localStorage → `createStore` → `loadModel` with progress → `new BrushScene` → `applyDesign(initial, null)` → mount UI modules → `goStep(1)` → `intro.finish()`. On any rejection → `intro.fail(err, boot)`. Global `error`/`unhandledrejection` → `toast('Something went wrong, your design is saved')` + `console.error`.
- `start.ts`: `mountStart(store, scene)` renders the five cards (images `/tiles/char-<id>.webp`; until Task 16 exists use `snapshot(.., 'hero', 192, 192)` lazily, then switch) and on click `store.replace(characterDesign(id))` (`stickers: []`, `name: c.name`, `character: id`).

- [ ] **Step 1:** Write `tests/e2e/load.spec.ts`: (a) page loads, `#intro` is detached within 15 s, `#stage canvas` exists, no console errors; (b) with `page.route('**/model/brush.glb', r => r.abort())` the intro shows text `Couldn't load the brush` and a `Retry` button; after `page.unroute` and clicking Retry, `#intro` detaches (Review Focus 3); (c) clicking the Puff card makes `localStorage['suri-kids-current']` contain `"character":"puff"`.
- [ ] **Step 2:** Run `npx playwright test load.spec.ts --project=desktop` → FAIL.
- [ ] **Step 3:** Write the markup and port the CSS from legacy lines 10–430 (drop rules for the removed elements and the TYPE + SPACING overrides fold into the rules they override; keep values). Implement the four modules and `main.ts`.
- [ ] **Step 4:** Run → PASS. Commit: `feat(ui): app shell, flow, intro with error handling, start screen`.

---

### Task 13: Design screen

**Files:**
- Create: `src/ui/design.ts`, `src/ui/upload.ts`, `tests/e2e/design.spec.ts`, `tests/unit/upload.test.ts`

**Interfaces:**
- `mountDesign(store, scene): void` renders, in order: colourway card (10 presets as legacy 1335–1344 + finish segment legacy 1538–1548), Surprise me (legacy 1433–1442, pure function `surpriseDesign(d: Design, rand: () => number): Design` exported for test), one card per part (title `Pick your <name>` or `<Name> colour` for handle/button; swatch row; `.sub`; tiles with `<img src="/tiles/<part>-<option>.webp">`; upload tile; the uploaded-STL tile uses `snapshot(.., 'tile', 192, 192, { part, style: 'upload' })`), stickers card (legacy 1352–1385 with the change: after a successful `placeSticker` the armed type is cleared), Reset appearance (legacy 1346–1350). Subscribes to the store and re-renders only the cards whose inputs changed (compare per card: `parts[id]`, `colours[id]`, `finish`, armed state, sticker list).
- `upload.ts`: `parseStl(buf: ArrayBuffer, part: PartId, reference: THREE.Box3): THREE.BufferGeometry` (legacy 1309–1325 scaling/centring) and limits: reject files over `20 * 1024 * 1024` bytes or with more than `500000` triangles with `Error('too-big')`; reject unparsable with `Error('not-stl')`. Toast copy: `That file could not be read as an STL` / `That file is too big (max 20 MB, 500k triangles)` / `Part loaded. It stays in this browser.`

- [ ] **Step 1:** Write `upload.test.ts`: a 12-triangle binary STL cube buffer (built in the test) parses to 36 positions and is scaled to fit the reference box; a text buffer `'hello'` throws `not-stl`; a header claiming 600000 triangles throws `too-big` before allocating (Review Focus 4).
- [ ] **Step 2:** Write `design.spec.ts` (desktop): go to Design; click the Cloud cap tile → `aria-pressed=true` and `localStorage` has `"cap":"cloud"`; click the 5th swatch in the cap card → `"colours":{"cap":"#66bf8d"` appears; click Satin → `"finish":"satin"`; arm Star, click the canvas centre → sticker list has 1 row and the Star tile is no longer `aria-pressed`; click the canvas again → still 1 sticker; Remove → 0; set a non-STL file on `#file` via `setInputFiles` → toast text `That file could not be read as an STL` and state unchanged.
- [ ] **Step 3:** Run both → FAIL. Implement. Run → PASS.
- [ ] **Step 4:** Commit: `feat(ui): design screen with parts, colours, stickers, upload`.

---

### Task 14: Name it and Hand over screens

**Files:**
- Create: `src/ui/nameit.ts`, `src/ui/handover.ts`, `tests/unit/mrz.test.ts`, `tests/e2e/flow.spec.ts`

**Interfaces:**
- `nameit.ts`: `passportNo(d: Design): string` (legacy 1552), `mrzCheck(s: string): string`, `mrzLines(d: Design, date: Date): [string, string]` (legacy 1573–1579), `mountNameIt(store, scene)`: on step enter renders box + passport with a hero snapshot (280×360) cached by `[parts, colours, finish]`; on input re-renders text only (legacy 1563–1601 markup verbatim, `fitName` 1557–1561).
- `handover.ts`: `mountHandover(store, flow)`: review rows (legacy 1605–1619) with Edit → `goStep(2, true)` then `scrollIntoView` of `#card-<part>` (or `#char-name` for Name); checkbox enables checkout; checkout → toast `Concept prototype: checkout isn't connected yet.`

- [ ] **Step 1:** `mrz.test.ts`: `mrzCheck('L898902C3') === '6'` (ICAO 9303 worked example); `mrzLines` returns two strings of length 44 each; for a design named `Puff` line 1 starts with `P<SRKPUFF<<KIDS<LAB`.
- [ ] **Step 2:** `flow.spec.ts`: Start → Next → Design → Next → Name it: type `Puff`, `#box-mock .nm` text is `Puff`, `#passport .pp-mrz` contains `PUFF`; Next → Hand over: review Name row is `Puff`; checkout disabled until the checkbox; click checkbox then Check out → toast contains `Concept prototype`; click the Cap row's Edit → step 2 visible and the cap card is in the viewport (`toBeInViewport`).
- [ ] **Step 3:** Run → FAIL. Implement. Run → PASS. Commit: `feat(ui): name it and hand over`.

---

### Task 15: Share, My designs, undo button, keyboard

**Files:**
- Create: `src/ui/share.ts`, `src/ui/designs.ts`, `tests/e2e/share.spec.ts`
- Modify: `src/main.ts` (wire undo button, Cmd/Ctrl+Z, Escape)

**Interfaces:**
- `share.ts`: click → `history.replaceState(null, '', '#d=' + encode(d))`, clipboard write, toast `Link copied` (or `Link copied. Uploaded parts show as originals.`), fallback `prompt`.
- `designs.ts`: list/open/delete/save (legacy 1639–1660) with thumbnail `snapshot(.., 'hero', 300, 300)` as JPEG quality .8; `saveDesigns` failure → toast `Storage is full. Delete a design first.`
- Undo button `#undo` disabled when `!store.canUndo()`; keyboard as legacy 1443.

- [ ] **Step 1:** `share.spec.ts`: change the cap to Cloud, click Share, read `location.hash`, open a new page at that URL → cap tile Cloud is pressed; with `page.addInitScript` making `localStorage.setItem` throw, the page still loads and Save design shows the storage toast rather than an error (Review Focus 2); Save design → the dialog lists one card; Cmd/Ctrl+Z after a swatch click restores the previous colour.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS. Commit: `feat(ui): share links, my designs, undo`.

---

### Task 16: Tile render script

**Files:**
- Create: `scripts/render-tiles.ts`, `src/dev/tiles.ts` (a dev-only page module mounted when `location.search === '?tiles'` that exposes `window.__renderTile(part, style)` and `window.__renderChar(id)` returning data URLs from Task 11 `snapshot`)
- Output: `public/tiles/<part>-<option>.webp` (23) and `public/tiles/char-<id>.webp` (5), 384×384 source, webp quality 82

**Interfaces:**
- Tiles are rendered in colour `N` (`#ebeaeb`) with finish `matte`, cap tiles fitted to the `plain` head; character cards with the character's real colours and finish. The script runs Playwright headed (real GPU) against `npm run dev`, calls the window functions, converts PNG → webp with `sharp` (add as devDependency), and writes the files.

- [ ] **Step 1:** Implement the dev page module and the script; add script `"tiles": "tsx scripts/render-tiles.ts"`.
- [ ] **Step 2:** Run it. Expected: 28 files; `du -ch public/tiles | tail -1` ≤ 400 KB. Open `cap-hat.webp` and `char-splash.webp` by eye: match the legacy tiles' framing (`THUMB_VIEW`).
- [ ] **Step 3:** Switch `start.ts` and `design.ts` to the static tile URLs (remove the lazy snapshot fallbacks). Run `npx playwright test --project=desktop` → PASS.
- [ ] **Step 4:** Commit: `feat(assets): pre-rendered option tiles and character cards`.

---

### Task 17: Phone layout and mobile smoke tests

**Files:**
- Modify: `src/styles/mobile.css`, `src/styles/stage.css`, `src/three/scene.ts` (reframe on resize), `index.html`
- Create: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Below 1000 px: `.media { position: sticky; top: <header height>; z-index: 5 }`, `.stage { height: 40svh; min-height: 280px }`, canvas `touch-action: none`, everything else default; `.steps` not sticky; `.step-nav` sticky bottom with `env(safe-area-inset-bottom)`; `.nav` hidden; icon buttons label-less. Desktop rules unchanged from legacy.

- [ ] **Step 1:** `mobile.spec.ts` (`--project=mobile`): load; `document.documentElement.scrollWidth <= innerWidth`; go to Design; `page.mouse.wheel(0, 1500)` with the pointer over the options column → `scrollY > 1000` and `#stage` bounding box `top >= 0 && bottom <= innerHeight` (still visible); the cap card is in the viewport; `#step-next` is in the viewport; rotate: `page.setViewportSize({ width: 812, height: 375 })` → no horizontal overflow and `#stage` height ≥ 280.
- [ ] **Step 2:** Run → FAIL. Implement the CSS and the `ResizeObserver → frameDefault()` (when the user has not moved the camera). Run → PASS.
- [ ] **Step 3:** Screenshot by eye at 375 and 768 wide, Start and Design steps, scrolled (per the project's responsive rule): brush visible, no clipped cards, one bottom bar.
- [ ] **Step 4:** Commit: `feat(ui): phone layout with pinned viewer`.

---

### Task 18: Parity pass, budgets, deploy

**Files:**
- Create: `docs/reference/parity-2026-10.md` (table of 17 comparisons + 6 budget numbers), `vercel.json`, `README.md`
- Modify: `scripts/capture-reference.ts` (add `--target new` to capture the same 17 shots from port 3240 into `docs/reference/new/`)

- [ ] **Step 1:** Capture the 17 shots from the new build. Compare each pair side by side (`docs/reference/<x>.png` vs `docs/reference/new/<x>.png`); note any difference in colour, shading, edge quality or framing in the table. Fix material tuning until none is visible. If after one full pass a difference remains that cannot be tuned away, pin `three@0.128.0`, revert the API changes from Task 6, and note it in the table.
- [ ] **Step 2:** Measure on a real GPU in Chrome DevTools with the local build (`npm run build && npm run preview`): the six budgets from Global Constraints; record them in the table. Fix anything over budget (decal proxy meshes, cap mesh row counts) before continuing.
- [ ] **Step 3:** `vercel.json`: `{ "outputDirectory": "dist", "headers": [{ "source": "/(model|tiles|fonts)/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }] }`. Vite already hashes `src` imports; `public/` files are referenced by stable paths, so bump the filename (e.g. `brush.v2.glb`) when the model changes; note this in README.
- [ ] **Step 4:** `npx vercel@latest deploy --scope finhcc` (preview). Open the preview URL on a phone and a laptop: load, Design, stickers, Name it, Hand over, Share. Then `npx vercel@latest deploy --prod --scope finhcc`.
- [ ] **Step 5:** README: how to run, test, regenerate model/cap-fit/tiles, deploy; link the audit, the design and this plan. Delete `legacy/` only after Alexis signs off (leave it in this task).
- [ ] **Step 6:** Commit: `chore: parity report, vercel config, readme`. Run `npm test && npx playwright test` → all PASS.

---

## Self-review notes

- Spec coverage: §4 screens → Tasks 12–15; §5 layout → Tasks 12, 17; §6 stack/pipeline/state/scene/snapshots/tests/budgets → Tasks 1, 3, 4–11, 16, 18; §7 decisions → Global Constraints and Task 18 fallback. Decision "Finish changes materials in place" → Task 9 `finishOnly`. "Tapping a part on the brush scrolls to its card" → Task 13 uses `scene.partAt` (add: on canvas click without an armed sticker, `goStep(2)` and scroll to `#card-<part>` with the flash class; included in Task 13's implementation).
- Types: `BuildCtx`, `CapCore`, `CadGeo`, `Design`, `Store`, `BrushScene` names are used consistently above.
- Review Focus items map to Tasks 5, 5/15, 12, 13, 10.

---

## Amendments (2026-10-21, from Alexis during execution)

### Task 11b: Remove the charm part

**Files:**
- Modify: `src/data/parts.ts` (drop `charm` from `PARTS`/`PartId`), `src/data/palette.ts` (presets no longer carry a `charm` key), `src/data/characters.ts` (no `charm` in parts/colours), `src/state/design.ts` (validate ignores a legacy `charm` key in `parts`/`colours` and drops stickers with `p === 'charm'`), `src/three/parts/index.ts` (no charm builder), `src/three/scene.ts` (no charm group/explode offset), `src/three/snapshot.ts` (no charm special case), tests touched by these.
- Delete: `src/three/parts/charm.ts`.
- Later tasks: no charm card (Task 13), no Charm review row (Task 14), no charm tiles (Task 16), no "Collectible charms" feature copy anywhere.

- [ ] Update tests first (data: `PARTS.length === 6`; design: a legacy link carrying `parts.charm`/`colours.charm`/a charm sticker validates without those and without throwing; scene-diff: no charm), run → FAIL; implement; `npm run typecheck`; `npm test` → PASS; commit `refactor: remove the charm part`.

### Task 15 (amended): Undo and Redo, bottom-left of the stage
- Store: add `redo(): boolean` and `canRedo(): boolean`; `undo()` pushes the undone state onto a forward stack; any new `update`/`replace` clears the forward stack. Tests for both.
- Markup/CSS: `#undo` and `#redo` as a pair of round buttons at the bottom-left of `#stage` (`left: 16px; bottom: 16px`), same style as today's undo; both disabled when nothing to undo/redo; Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y = redo.

### Task 19: Render quality pass (after Task 18)
- Baseline = parity with legacy (Task 18). Produce three variants of the studio look (lighting rig, shadow softness, environment tint, anti-aliasing/supersampling) as side-by-side screenshots of Nova front + iso, with a one-line description each; Alexis picks one; apply it; re-capture the 17 shots as the new reference set. No geometry or UI changes in this task.
