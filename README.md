# SURI Kids Lab configurator

A 3D toothbrush configurator: pick a character, swap the parts, add stickers, name it, hand it over.
Vite + TypeScript + three, no UI framework. Static site, deployed to Vercel (team finhcc, project `suri`).

- Audit of the old build: [docs/2026-10-20-audit.md](docs/2026-10-20-audit.md)
- Design (spec): [docs/superpowers/specs/2026-10-20-configurator-rebuild-design.md](docs/superpowers/specs/2026-10-20-configurator-rebuild-design.md)
- Plan: [docs/superpowers/plans/2026-10-20-configurator-rebuild.md](docs/superpowers/plans/2026-10-20-configurator-rebuild.md)
- Parity and budgets: [docs/reference/parity-2026-10.md](docs/reference/parity-2026-10.md)
- Studio look (shipped: **b · Product hero**): [docs/reference/looks/README.md](docs/reference/looks/README.md),
  before/after sheet [docs/reference/final/compare.png](docs/reference/final/compare.png)

## Run

    npm install
    npm run dev                       # http://localhost:3240
    npm run build && npm run preview  # the production build, also on 3240
    npm run legacy                    # the old single-file build (legacy/), http://localhost:3241

`legacy/` is the parked pre-rebuild build and the visual reference. Keep it until Alexis signs off the rebuild.

## Test

    npm test                    # unit tests (Vitest)
    npm run typecheck
    npx playwright test --project=desktop --project=mobile   # end-to-end, starts dev + legacy servers itself

Playwright renders with SwiftShader (software GL), so it checks behaviour, not looks or speed.

## Look and speed checks (headed Chromium, real GPU)

    npm run legacy &
    npm run dev &
    npm run capture-reference                                   # legacy -> docs/reference/*.png
    npm run capture-reference -- --target new                   # new build -> docs/reference/new/*.png
    npm run capture-reference -- --target legacy --out <dir>    # a fresh legacy set to compare against

Both targets crop 1200x900 from the top-left of `#stage` at a 2100x1100 viewport, so the stage chrome (undo/redo,
toolbar) shows in both sets. Each shot waits until two consecutive frames are identical.

    npm run build && npx vite preview --port 3242 --strictPort &
    npx tsx scripts/measure-budgets.ts [--stickers 6]           # click-to-paint and Long Tasks

The render's look (lights, studio, shadows, occlusion, material response) lives in `src/three/looks.ts`. Look `b`
(Product hero) ships; in dev, `?look=parity` shows the Task 18 render for comparison, e.g.
`npm run capture-reference -- --target new --url 'http://localhost:3240/?look=parity' --out <dir>`.
`npx tsx scripts/compare-final.ts` rebuilds the before/after sheet from `docs/reference/new` and `docs/reference/final`.

## Regenerate generated assets

| What | Command | Writes |
| --- | --- | --- |
| Model (from the CAD embedded in `legacy/index.html`) | `npm run extract-cad` | `src/assets/model/brush.glb`, `src/assets/model/brush-meta.json` |
| Cap fit (cap cavity per head style) | `npm run cap-fit` | `src/assets/model/cap-fit.json` |
| Option and character tiles (needs `npm run dev`, opens headed Chromium) | `npm run tiles` | `src/assets/tiles/*.webp` |

Run cap-fit after the model changes, and tiles after the model, the cap fit, materials or lighting change.

## Deploy

    npx vercel@latest deploy --scope finhcc            # preview
    npx vercel@latest deploy --prod --scope finhcc     # production (only with Alexis's go-ahead)

Vercel builds from source (`npm run build`, output `dist`, see `vercel.json`; `.vercelignore` keeps `legacy/`, `docs/`
and tests out of the upload). The model, cap fit, tiles and fonts live in `src/assets/` and are imported through
Vite (`?url` imports in `src/main.ts`, `import.meta.glob` in `src/assets/tiles.ts`, relative `url()` in
`src/styles/base.css`), so every build gives each one a content-hashed name under `/assets/`. Only `/assets/*` is
served with `Cache-Control: public, max-age=31536000, immutable`; `index.html` and the rest of `public/` keep Vercel's
default revalidating cache. Regenerating a file changes its hash, so returning visitors pick it up on their next visit
with no renaming. The hashed brush glb is also preloaded from `index.html` (a small plugin in `vite.config.ts`).
