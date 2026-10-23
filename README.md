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
    npx playwright test --project=gate --project=prod        # password gate (dev, port 3242) and the production build

Playwright renders with SwiftShader (software GL), so it checks behaviour, not looks or speed.

## Password gate

The configurator only opens after the right password is typed on the loader, and the check is on the server: without
a valid unlock cookie, Vercel refuses the brush model, its data and the tiles.

- `api/unlock.js` (POST `{ password }`) compares against the `SURI_PASSWORD` environment variable in constant time.
  Right: `204` and an HttpOnly cookie `suri_gate` for 30 days. Wrong: `401` after ~600 ms. No variable set: `503`
  and the loader says "This preview isn't set up yet." (it never falls open).
- `api/gate.js` (GET) tells the page whether this browser is unlocked (the cookie itself is HttpOnly).
- `middleware.js` (Vercel Routing Middleware, no matcher so it sees every path) normalises the path first (decodes
  escapes, collapses `//`, resolves `..`, drops a trailing `/`, ignores case). Under `/assets/` only `.js`, `.css` and
  `.woff2` are public (the loader needs them); everything else there (model, data, tiles, any other type) answers
  `401` without a valid cookie, and with one is served `private, max-age=31536000, immutable` + `Vary: Cookie`, so no
  shared cache keeps it. Outside `/assets/` (the page, the wordmark) stays public.
- The server files (`api/`, `lib/`, `middleware.js`) are plain ESM JavaScript with JSDoc types, checked by
  `npm run typecheck`, so Vercel runs them without compiling them with the project's TypeScript.
- The cookie value is an HMAC of a fixed message keyed by the password (`lib/gate.js`), so **changing
  `SURI_PASSWORD` signs everyone out**; they type the new password once.

Set the password in Vercel → Project `suri` → Settings → Environment Variables as `SURI_PASSWORD`, for Production and
Preview, then redeploy (env changes apply to new deployments). Never put it in the repo, tests or scripts.

Locally the gate is off in `npm run dev`. To try it, start the dev or preview server with the gate emulation (in
`vite.config.ts`, runs the same `lib/` code, never part of the build) and a throwaway password:

    VITE_GATE=1 SURI_PASSWORD=some-local-test-value npm run dev
    npm run build && VITE_GATE=1 SURI_PASSWORD=some-local-test-value npm run preview

A production build always gates, so `npm run preview` without `VITE_GATE=1` stops at the loader with the load error.

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

Deploy from a clean checkout of a committed, reviewed commit (the CLI uploads the working tree, so uncommitted edits
would ship): `git worktree add --detach /tmp/suri-deploy <commit>`, copy `.vercel/` into it, deploy from there, then
`git worktree remove /tmp/suri-deploy`. Production is https://suri-finhcc.vercel.app (Vercel team `finhcc`, project
`suri`). Deploys are by CLI only: the GitHub repo `FINH-CC/Suri-` is not connected to Vercel, because the Vercel
GitHub app has no access to it; the FINH-CC account owner must grant that before pushes can deploy automatically.

Vercel builds from source (`npm run build`, output `dist`, see `vercel.json`; `.vercelignore` keeps `legacy/`, `docs/`
and tests out of the upload). The model, cap fit, tiles and fonts live in `src/assets/` and are imported through
Vite (`?url` imports in `src/main.ts`, `import.meta.glob` in `src/assets/tiles.ts`, relative `url()` in
`src/styles/base.css`), so every build gives each one a content-hashed name under `/assets/`. Only `/assets/*` is
served with a year-long immutable cache (`public` for JS, CSS and fonts from `vercel.json`; `private` for the gated
model, data and tiles, set by `middleware.js`); `index.html` and the rest of `public/` keep Vercel's
default revalidating cache. Regenerating a file changes its hash, so returning visitors pick it up on their next visit
with no renaming. The hashed brush glb is also preloaded from `index.html` (a small plugin in `vite.config.ts`), but
only for a browser that has unlocked the password gate (the readable `suri_unlocked` hint cookie); see Password gate.
