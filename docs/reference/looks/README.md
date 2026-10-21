# Studio looks (Task 19)

Four looks of the same build, Nova and Splash, front and iso: `<look>-<character>-<view>.png` (1200x900 crop of the
stage at a 2100x1100 viewport, headed Chromium, dev server with `?look=<id>`). `compare.png` puts them side by side
(columns parity, a, b, c). Rebuild the sheet with `npx tsx scripts/compare-looks.ts`. The parameters of each look are
in `src/three/looks.ts`. Production renders **parity** until a look is chosen.

- **parity**: today's render, unchanged (re-captured nova-iso differs from `docs/reference/new/nova-iso.png` by a mean of 0.004 per channel).
- **a, Soft studio**: a larger, higher softbox and a brighter overhead give a longer top-to-bottom gradient, shadows blur evenly instead of grainy, the contact shadow sits right under the base, and creases get a little more depth, so it reads like a calm studio product shot.
- **b, Product hero**: a stronger key against dimmer fills models the shape, bright rim lights trace both edges against the backdrop, Satin reads glossier, and a soft floor shadow grounds the brush, so it reads like an advert hero shot.
- **c, Bright & playful**: higher, slightly warm light with lifted fills and a warm bounce, very soft light shadows and almost no crease darkening, so the colours look sunny and clean without being pushed.

Tone curve: AgX and ACES were tried on look a against the neutral curve. AgX washed the brand colours out (Splash cap
chroma down to about half of the swatch), ACES shifted the blue cap's hue by about 13 degrees; the neutral curve keeps
hue within about 2 degrees, so all looks keep it.

Brand colour check (pixels in the cap/grip/button colour, median against the swatch; hue shift in degrees):

| Look | Nova front | Nova iso | Splash front | Splash iso |
| --- | --- | --- | --- | --- |
| parity | ΔE 3.0, hue -1.0 | ΔE 13.1, hue -1.1 | ΔE 1.9, hue +0.7 | ΔE 12.2, hue +2.4 |
| a | ΔE 4.8, hue -1.0 | ΔE 10.7, hue -1.1 | ΔE 3.9, hue +1.6 | ΔE 10.7, hue +2.4 |
| b | ΔE 8.2, hue -1.0 | ΔE 9.6, hue -0.7 | ΔE 6.1, hue +1.7 | ΔE 10.5, hue +1.2 |
| c | ΔE 5.9, hue -1.0 | ΔE 3.2, hue -1.9 | ΔE 4.4, hue -1.1 | ΔE 1.4, hue +0.1 |

The ΔE is mostly lightness (shading); no look moves the hue more than 2.5 degrees.

## Budgets per look

Production build per look (`VITE_LOOK=<id> npx vite build`, served by `vite preview` on 3242),
`scripts/measure-budgets.ts`, headed Chromium 1280x900, DPR 1, Apple M5 Pro (ANGLE Metal). Median / max in ms,
5 runs (3 for placing a sticker). Looks a, b and c render the stage at pixel ratio 1.5 on a 1x screen (2.25x the
pixels of parity); on phones every look is capped at 2, as parity is.

| Interaction (limit) | parity | a | b | c |
| --- | --- | --- | --- | --- |
| Cap colour swatch (≤ 50) | 35.7 / 36.7 | 41.4 / 44.9 | 35.3 / 36.0 | 34.9 / 35.5 |
| Grip tile (≤ 50) | 32.0 / 34.0 | 30.7 / 38.1 | 32.0 / 32.1 | 31.9 / 33.8 |
| Cap tile (≤ 50) | 35.8 / 37.1 | 40.8 / 43.1 | 35.4 / 36.3 | 34.4 / 34.9 |
| Head tile (≤ 200) | 56.8 / 59.0 | 55.0 / 61.0 | 47.4 / 48.4 | 47.1 / 48.3 |
| Head tile, 3 stickers on (≤ 200) | 90.5 / 101.6 | 76.0 / 77.8 | 76.7 / 84.4 | 75.1 / 84.9 |
| Handle colour, 3 stickers on (≤ 200) | 54.3 / 65.8 | 51.5 / 53.6 | 50.8 / 53.2 | 51.6 / 52.5 |
| Grip tile, 3 stickers on (≤ 200) | 52.4 / 60.5 | 50.0 / 57.4 | 50.8 / 58.3 | 50.5 / 58.6 |
| Place a sticker (≤ 200) | 68.6 / 71.2 | 49.0 / 61.5 | 48.9 / 56.9 | 49.2 / 57.0 |
| Finish (≤ 100) | 31.9 / 52.2 | 32.2 / 40.6 | 32.3 / 41.5 | 32.2 / 41.5 |
| Pick a character (no budget) | 80.4 / 92.6 | 87.9 / 97.9 | 81.6 / 92.7 | 77.8 / 89.5 |
| Next: Name it, box + passport snapshots (no budget) | 212.1 | 166.8 | 151.9 | 163.7 |

Idle: 0 frames in 3 s on every look (dev, `__scene.frames`).

a and b were measured twice. The first run of each had one slow character pick (a 333 ms, b 294 ms) and b one slow
Name it (1164 ms, a 1161 ms Long Task); neither came back in the second run (above), so they read as one-off shader
compiles or GC, not a steady cost. Worth one more look on a phone before shipping b.
