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
