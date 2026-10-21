# Reference screenshots

Screenshots of the legacy single-file build (`legacy/index.html`): four characters (pip, puff, splash, nova) in four views (front, side, back, iso), plus `nova-apart.png` (Nova, Iso, Take apart). 17 PNGs, each 1200x900.

These are the visual parity target for the rebuild (spec section 6) and the acceptance images for Task 18.

Regenerate (headed Chromium opens, for a real GPU):

    npm run legacy &
    npm run capture-reference

The same script captures the new build (`npm run dev &` then `npm run capture-reference -- --target new`, written to
`new/`) or a fresh legacy set (`-- --target legacy --out <dir>`). Each shot waits for two identical consecutive frames
instead of fixed sleeps. Both builds are cropped the same way, so stage chrome (undo/redo, toolbar) shows in both sets.

- `new/`: the rebuild, captured for the Task 18 parity pass.
- `legacy-settled/`: legacy re-captured in the same session as `new/`. The Task 2 images above are uniformly 4-5%
  brighter than this re-capture of the same build (a capture-environment difference), so `legacy-settled/` is the
  like-for-like comparison. Results: `parity-2026-10.md`.

Note: the capture viewport is 2100x1100, not 1600x1000. At 1600x1000 the stage is only about 930px wide because the side panel takes the rest, so the viewport was widened until the stage was at least 1200x900. The script clips 1200x900 from the stage's top-left corner. In `nova-apart.png` the top of the cap sits slightly above the clip.
