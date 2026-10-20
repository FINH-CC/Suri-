# SURI Kids Lab configurator — rebuild design

Date: 2026-10-20. Status: draft for review.
Companion: [the audit](../../2026-10-20-audit.md) of the current build.

## 1. Intent

The SURI Kids Lab configurator lets a child (with a grown-up) assemble a kids' electric toothbrush in 3D: pick a Season 01 character or start blank, swap parts, choose colours and a finish, stick stickers on it, name it, see it on a box and a "passport", then hand over to a grown-up to review. It is a concept prototype shown to SURI; there is no checkout or backend.

The current build is one 8.8 MB HTML file. It renders beautifully but downloads 6.5 MB on every visit, freezes for up to a second on simple clicks, hides its own errors, has a tangled two-mode step flow, and is close to unusable on a phone. The audit has the measurements.

This rebuild keeps the 3D rendering (part builders, materials, lighting, soft shadows, stickers, take-apart animation) and replaces everything around it: the build, the data pipeline, the state and rendering model, the flow, the layout, and error handling.

## 2. Goals, non-goals, anti-goals

Goals
- Fast: first visit under 3 MB total and the model cached; repeat visits instant. Every click paints within 50 ms except loading the model.
- Reliable: one state model, one render pass, no polling, no timers that paper over failures. Errors are shown with a retry.
- Clear flow: one linear path, Start → Design → Name → Hand over, with a visible progress indicator and sensible Back/Next.
- Works on a phone: the brush is always visible while picking parts; page scrolling always works; one bottom bar.
- Maintainable: TypeScript modules, a real build, tests for the logic, a documented asset pipeline, so the next change is a 20-line diff and not an edit to an 8 MB line.

Non-goals (v1)
- Checkout, accounts, a backend, a CMS, analytics.
- New characters, new parts, new stickers, or a visual redesign of the brand look. Copy and colours stay as they are.
- Drawing (line-art) render mode. The code is dropped in v1; it has no button in the current UI.

Anti-goals (it fails even if it works)
- The 3D looks worse than today.
- The page gets heavier or slower on first load.
- A framework or abstraction layer for its own sake. The DOM here is small; the 3D is the product.
- Copy that invents facts about the product.

## 3. Constraints

- Static site. Hosted on Vercel, team finhcc, project `suri` (`suri-finhcc.vercel.app`), deployed from the CLI. GitHub `FINH-CC/Suri-`, work on branch `fixes`.
- The client's CAD (handle, head, mount) is the only real geometry and must be shipped as-is in shape; it may be compressed and may be decimated only if it is visually identical at the sizes the app shows.
- Fonts: the trial "Plain" woff2 files and the existing unicode-range fallback to Inter stay until licensed files arrive.
- Browser support: current Safari (iOS and macOS), Chrome, Firefox. WebGL2. No IE, no legacy Edge.
- The app is for children with a grown-up present: large tap targets, no destructive action without an obvious undo, no text input needed except the name.

## 4. The product, screen by screen

Four steps. A 4-dot progress track with labels (Start, Design, Name it, Hand over) sits at the top of the options column. Back and Next live in one bar at the bottom of the options column (sticky on phones). Review "Edit" links go to the Design step and scroll to the relevant card. Tapping a part on the brush does the same.

### Start
- Four Season 01 character cards (Pip, Puff, Splash, Nova) plus a "Start from blank" card. Each card has a pre-rendered image, name and one-line tag.
- Tapping a card applies that build to the brush immediately (parts, colours, finish, name) and marks the card selected. Next → Design.
- The brush shows the current selection; on first visit this is Nova (today's default).

### Design
One scrolling column of cards, in this order:
1. Colourway: the ten presets (five families × A/B) as today, plus the Finish segment (Matte, Satin, Speckle).
2. One card per part: Cap, Head, Grip, Charm, Mount, then Handle colour and Button colour (those two are colour-only). Each part card has: title, the 11 colour swatches (current ringed), the short description, and shape tiles (current pressed) plus an "Upload" tile for STL.
3. Stickers: eight sticker tiles, Size and Rotate sliders, the list of placed stickers with Remove, Clear stickers. "Surprise me" button sits above the part cards.
4. Reset appearance link at the bottom.

Behaviour
- Tiles and swatches change the brush instantly. Only the changed part is rebuilt (cap also when the head changes).
- Finish changes materials in place; it does not rebuild geometry.
- Sticker placing: tap a sticker tile to arm it, tap the brush to place it. After placing, the tile disarms (one sticker per tap on a tile). Escape or tapping the tile again also disarms. The placed sticker becomes selected so the sliders edit it.
- STL upload: session only, as today; the uploaded part is scaled and centred into the slot of the original. Shown as a tile with an "STL" badge. Share links and saved designs substitute the original part.

### Name it
- Name input (max 14 characters, no `<` `>`), a box-front preview and a passport preview, both using a hero snapshot of the current brush (see Snapshots below).
- Previews update on each keystroke (text only) and once when arriving at the step (image).

### Hand over
- Review list: Name, Cap, Head, Grip, Charm, Mount, Handle, Button, Finish, Stickers, each with an Edit link.
- "I'm a grown-up and I've checked this build" checkbox enables "Check out", which shows the prototype notice as today.

### Header
- SURI wordmark (links to trysuri.com), "My designs" and "Share" buttons. Nav links Shop/Learn/Impact as today. No other chrome.

### My designs and Share
- My designs: a dialog listing saved designs (name, 300 px thumbnail from the main canvas, Open, Delete) and "Save current design". Stored in localStorage, max 24.
- Share: encodes the design into the URL hash and copies the link; a visitor opening the link sees that design loaded. Same encoding as today so existing links keep working (validate() stays lenient).

### Loading and errors
- Intro: the "Meet the SURI Lab" word animation plays while the model loads, with a thin progress bar fed by the model download. It leaves as soon as the model is built and the first frame rendered, never on a fixed timer. If loading fails, the intro shows "Couldn't load the brush" with a Retry button and the error is logged.
- Runtime errors (uncaught or in handlers) show a toast "Something went wrong, your design is saved" and are logged to the console. State is persisted before any rebuild so a crash cannot lose the design.

## 5. Layout

Desktop (≥ 1000 px): as today. Two columns, the 3D stage sticky in the left column at full viewport height under the header, the options column on the right.

Phone and tablet (< 1000 px)
- The stage is pinned at the top: `position: sticky; top: header height`, height 40 svh, minimum 280 px. The options column scrolls underneath it. The brush is always visible while choosing.
- Dragging on the canvas rotates the brush (`touch-action: none` on the canvas only). Everything outside the canvas scrolls the page normally. The toolbar (Take apart, Front/Side/Back/Iso) stays inside the stage.
- One sticky bottom bar with Back and Next. The step track is not sticky on phones.
- The camera reframes the brush to fit the smaller stage (same frameDefault logic as today).

Both
- Light scheme only. Reduced motion respected (no pops, no intro jump, no camera lerp).
- Keyboard: every control focusable, visible focus ring, Cmd/Ctrl+Z undo outside inputs, Escape disarms a sticker.
- No visible scrollbars inside the phone stage.

## 6. Architecture

### Stack
- Vite + TypeScript, no UI framework. DOM rendered by small idempotent functions (`renderStart(state)`, `renderPartCard(id, state)`, …) that replace a card's contents from state.
- Three.js (current release) from npm, with the addons it needs: OrbitControls, GLTFLoader + MeshoptDecoder (or DRACOLoader), STLLoader, DecalGeometry.
- Output is static files in `dist/`, deployed to the existing Vercel project.

### Repo layout
```
index.html                 Vite entry (small: markup shell only)
src/
  main.ts                  boot: load model, build scene, mount UI
  state/                   Design type, store, validate, encode/decode, undo, persist
  data/                    palette, parts, presets, characters, finishes, stickers (today's DATA block)
  three/                   renderer, env, materials, part builders, stickers, scene, camera, animation
  ui/                      one module per screen/card + flow + dialogs + toast
  styles/                  CSS (today's stylesheet, split by area, dead rules removed)
public/
  model/brush.glb          handle, head, mount CAD
  model/cap-fit.json       precomputed cap core parameters per head style
  tiles/*.webp             pre-rendered option tiles and character cards
  fonts/                   the trial Plain files
scripts/
  extract-cad.ts           old index.html → brush.glb (one-off, kept for provenance)
  cap-fit.ts               computes cap-fit.json from the glb using the shared capEnvelope code
  render-tiles.ts          renders tiles with the app's own part builders in headless Chromium
docs/                      audit, this design, the plan
tests/                     Vitest unit tests; Playwright smoke tests
legacy/index.html          the current single-file build, kept for reference until v1 ships
```

### Data pipeline (build time, not runtime)
- Model: the three CAD groups become one `.glb` with one mesh per sub-part, named `handle/body`, `handle/button`, `head/pad`, `mount/body`, `mount/insert`, etc., so the role mapping stays explicit. Compress with meshopt (gltf-transform). The CAD is 354k vertices / 616k triangles. Shape wins over size: quantise and compress, keep the STEP normals (do not recompute them; the hard edges on the button recess, seal and metal rings depend on them), and expect 1.8–2.5 MB gzipped. Simplification is allowed only per sub-part, only where it is indistinguishable from the reference screenshots at 2× the stage size, and the ratio used is recorded in the script. Served with a hashed filename and long cache.
- Cap fit: `capEnvelope` and `capCore` move into a shared module. The script runs them for each head style (plain, ears, spots) and writes the core parameters. At runtime the cap mesh is still generated from those parameters (cheap). An uploaded head STL falls back to running the fit live, once, in the browser.
- Tiles: one image per part × shape option (23) and one per character card (5), rendered by a script that drives the real app code in headless Chromium at 2× and writes webp. Tiles are rendered in the soft neutral colour; the chosen colour is shown by the swatch row and the brush itself, not by re-rendering tiles. Finish is shown on the brush only.
- Bristles, stickers' canvas art, procedural caps/grips/charms/themed mounts stay runtime, as today. They are cheap.

### State and rendering
- `Design` type: `{ parts, colours, stickers, name, finish, character }`, exactly today's shape so share links and saved designs keep working.
- One store: `get()`, `update(patch, {history?: boolean})`, `subscribe(listener)`. `update` validates, pushes an undo snapshot (bursts within 700 ms collapse, max 50), persists to localStorage, then notifies.
- Two subscribers: the 3D scene and the UI. Each diffs previous vs next and touches only what changed: the scene rebuilds a part when its shape, colour, or (for cap) head changed; swaps materials when finish changed; re-projects decals when stickers or any part changed. The UI re-renders only the affected cards.
- No polling, no global state swapping. Previews that need a different design (character cards, saved designs) are rendered from explicit arguments, never by mutating the live state.
- Render loop: on demand. A frame is requested when state changes, the camera moves, or an animation (explode, lift, pop, camera move) is running. Idle means no GPU work; this matters on phones.

### Snapshots
One facility, `snapshot(design, pose, size)`, renders a design off screen from the main renderer into a render target with its own camera and no backdrop or SSAO, and returns a data URL. Two poses: `hero` (today's leaning three-quarter perspective pose used by the box, the passport and the character cards) and `tile` (today's `THUMB_VIEW` orthographic framing per part). Uses: box and passport previews (hero, once on entering Name it and when a part changes), My designs thumbnails (hero, replacing today's crop of the live view), the uploaded-STL tile (tile pose, live, since it cannot be pre-rendered). The tile script uses the same facility in headless Chromium for the 23 part tiles and the 5 character cards, so pre-rendered and live images match.

### Scene (ported, not rewritten)
Carry over with minimal change: the neutral tone-mapping patch, `makeEnv`, `plastic`/`speckle`/`applyFinish`, every builder in `B`, `capEnvelope`/`capCore`/`CAP_STYLES`, bristle instancing, sticker canvas art and decal placement, explode/lift/pop animation, SSAO and contact shadow, `frameDefault`, the four views. Drop: drawing mode and everything only it uses (edge shader, id materials, flat materials). Update API calls to the current Three.js release (colour management, `outputColorSpace`, `sheen` as float + `sheenColor`, `ior` in place of `reflectivity`, addons imports).

Visual parity is judged against a fixed reference set captured from the current build before any porting starts: the four views (Front, Side, Back, Iso) × the four characters, plus one Take-apart view, at 1200 × 900 on a real GPU. These 17 PNGs are committed under `docs/reference/`. The port is accepted when a side-by-side pass shows no visible difference in colour, shading or edge quality. If parity cannot be reached within that pass, the fallback is to pin Three.js r128 from npm (the ESM build exists) and keep the materials byte-for-byte; "current release" is the preference, not the requirement.

### Flow
- `flow.ts` holds `step: 1|2|3|4` and a single `goStep(n)` that hides/shows the four sections, updates the track and the bottom bar, and triggers step-entry work (snapshot for Name it, review for Hand over). No modes, no aliasing.

### Persistence and sharing
- `localStorage['suri-kids-current']` (current design), `localStorage['suri-kids-designs']` (saved list). Same keys as today, so a visitor's current work survives the switch.
- Share hash `#d=` with the same base64 JSON as today.

### Tests
- Vitest: validate (bad input, old links, uploads), encode/decode round trip, undo collapsing, store diffing, cap-fit parameters match the shared module.
- Playwright smoke: load without console errors, pick a character, swap a part, place a sticker, name it, reach Hand over, share link round-trips, on desktop and a 375 px phone viewport (page scrolls, brush visible on the Design step).

### Performance budget (checked in the smoke test)
| Metric | Budget |
|---|---|
| HTML + CSS + JS, gzip | ≤ 350 KB |
| Model glb | ≤ 2.5 MB gzipped, cached one year |
| Tiles total | ≤ 400 KB |
| Swatch, colourway, grip/charm/mount/cap tile → paint | ≤ 50 ms |
| Head tile (rebuilds head + refits cap) and any rebuild with stickers on the brush | ≤ 200 ms |
| Finish change → paint | ≤ 100 ms |
| Long tasks after load | none over 200 ms during the smoke flow |

Budgets are measured by hand on a real GPU (a MacBook and an iPhone), not in headless Chromium: the Playwright smoke test checks behaviour and console errors only. Decal projection may use a low-poly proxy of each part instead of the full CAD mesh (builder's call) to stay inside the 200 ms line.

## 7. Decisions already made

- Rebuild the shell and port the 3D; do not patch the single file. (Alexis, 2026-10-20)
- v1 keeps STL upload, My designs and Surprise me; drops drawing mode. (Alexis)
- Phone layout: viewer pinned at the top, options scroll underneath. (Alexis)
- Fonts: keep the trial-file workaround. (Alexis)
- Vite + TypeScript without a UI framework. (Claude's call: the DOM is a handful of cards; the 3D dominates; it keeps the port of today's code closest to one-to-one.)
- Tiles pre-rendered in neutral colour rather than per colour. (Claude's call: 23 images instead of hundreds; colour is already communicated by the swatch row and the live brush.)
- Same state shape, storage keys and share encoding as today. (Claude's call: existing links and visitors' saved designs keep working.)
- Keep the same copy and visual language; the layout changes only where the flow and the phone layout need it.
- Reference screenshots of today's build are the acceptance target for the 3D; current Three.js preferred, r128 pinned as the fallback. (Claude's call after review.)
- The CAD's shape and normals win over the size budget; the budget is 2.5 MB gzipped. (Claude's call after review.)
- Performance budget split into a 50 ms common case and a 200 ms heavy case, measured by hand on real devices. (Claude's call after review.)
- All brush snapshots share one off-screen facility and keep today's hero pose. (Claude's call after review.)

## 8. Left to the builder

- Exact module boundaries inside `src/three` and `src/ui`.
- meshopt vs Draco, and whether simplification is needed, within the budget above.
- The tooling for the tile script (Playwright vs Puppeteer) and the exact framing of each tile; match today's `THUMB_VIEW` angles.
- CSS specifics, as long as the phone layout rules in section 5 hold.
- STL upload limits (file size, triangle count) and how an oversized file is refused.
- How the on-demand render loop schedules animation frames.
- Whether to try `vercel git connect` again or keep CLI deploys.
