# Studio looks (Task 19)

**Shipped: b · Product hero** (chosen by Alexis, Task 19b), with refined materials and a soft VSM floor shadow. Looks a
and c were removed from the code after the choice; their captures below stay as the record of the comparison. The
final captures of b are in `docs/reference/final/` (17 shots) with the before/after sheet `docs/reference/final/compare.png`.
In dev, `?look=parity` still shows the Task 18 render. The `b-*.png` images in this folder are the Task 19 version of b
(before the 19b material and shadow changes).

Four looks of the same build, Nova and Splash, front and iso: `<look>-<character>-<view>.png` (1200x900 crop of the
stage at a 2100x1100 viewport, headed Chromium, dev server with `?look=<id>`). `compare.png` puts them side by side
(columns parity, a, b, c). Rebuild the sheet with `npx tsx scripts/compare-looks.ts` (needs all four look captures).

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

## Shipped look b (Task 19b)

Changes over the Task 19 b above:

- Floor shadow: VSM, 2048 map, radius 20, 16 blur samples, frustum ±11 / ±17. The floor fades from 0 to 1.8 brush
  widths from the base, with distances along the shadow's direction counted 1.8x, so the pool never reaches the edge of
  the shadow map in any view (front, side, back, iso, taken apart) at desktop or phone stage sizes. Without float render
  targets (no `EXT_color_buffer_float` / `_half_float`) it falls back to PCF, no floor, and a stronger contact pool
  (.50 / .22).
- Satin: clear coat .45 at roughness .08 on hard plastics (silicone .12). Matte hard plastics: a roughness grain of
  ±.07 (value noise, two octaves; colour untouched). Silicone (cap, grip): roughness +.08, sheen .45 at sheen roughness .5.
  Metal: roughness .16, environment 1.5. Bristles: roughness .68, sheen .5, no clear coat, self-light .06.
- Cap hue drift against the swatch, final shots: Nova -1.1 to -0.2°, Splash -0.1 to +1.5°, Pip -1.2 to -0.6°,
  Puff +1.0° (limit 3°; parity was up to +3.2°).

Budgets, production build (`npm run build`, `vite preview`, headed Chromium 1280x900, DPR 1, M5 Pro), two runs,
median / max ms:

| Interaction (limit) | Run 1 | Run 2 |
| --- | --- | --- |
| Cap colour swatch (≤ 50) | 25.9 / 27.7 | 26.1 / 26.8 |
| Grip tile (≤ 50) | 15.6 / 17.1 | 15.4 / 17.3 |
| Cap tile (≤ 50) | 27.1 / 28.4 | 26.7 / 27.1 |
| Head tile (≤ 200) | 40.6 / 42.9 | 37.9 / 40.6 |
| Head tile, 3 stickers on (≤ 200) | 74.8 / 79.0 | 75.4 / 83.5 |
| Handle colour, 3 stickers on (≤ 200) | 51.1 / 53.8 | 52.6 / 55.2 |
| Grip tile, 3 stickers on (≤ 200) | 50.6 / 54.1 | 49.8 / 52.0 |
| Place a sticker (≤ 200) | 57.3 / 194.6 | 51.7 / 57.4 |
| Finish (≤ 100) | 15.8 / 35.4 | 15.6 / 33.9 |
| Pick a character (no budget) | 72.3 / 87.4 | 70.0 / 91.2 |
| Next: Name it (no budget) | 165.9 | 153.6 |

Size: HTML + CSS + JS 213.1 KB gzip (≤ 350), tiles 108 KB (≤ 400). No frames while idle.
The first run's first placed sticker took 194.6 ms (one 156 ms Long Task, first compile of the sticker program); it
did not come back in run 2.
