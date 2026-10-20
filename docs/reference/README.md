# Reference screenshots

Screenshots of the legacy single-file build (`legacy/index.html`): four characters (pip, puff, splash, nova) in four views (front, side, back, iso), plus `nova-apart.png` (Nova, Iso, Take apart). 17 PNGs, each 1200x900.

These are the visual parity target for the rebuild (spec section 6) and the acceptance images for Task 18.

Regenerate (headed Chromium opens, for a real GPU):

    npm run legacy &
    npm run capture-reference

Note: the capture viewport is 2100x1100, not 1600x1000. At 1600x1000 the stage is only about 930px wide because the side panel takes the rest, so the viewport was widened until the stage was at least 1200x900. The script clips 1200x900 from the stage's top-left corner. In `nova-apart.png` the top of the cap sits slightly above the clip.
