# MyTradePilot brand assets

The mark is the site's accent diamond with an equity curve running through it:
one drawdown, then a climb to the "current equity" dot sitting on the diamond's edge.
All SVGs are self-contained (the wordmark is outlined from Inter SemiBold, no font needed).

| File | Use |
| --- | --- |
| `logo.svg` | Lockup (mark + wordmark) on dark backgrounds |
| `logo-light.svg` | Lockup on light backgrounds |
| `logo-mono-dark.svg` / `logo-mono-light.svg` | One-colour lockups (white / ink) for print and embossing |
| `logo-mark.svg` | Mark alone, any background |
| `logo-mark-mono.svg` | One-colour mark; set `color` to recolour |
| `favicon.svg` | Mark with heavier strokes for 16–32 px |
| `app-icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Full-bleed app icons on the site's dark navy |
| `logo-1200.png`, `logo-mark-512.png` | Raster exports for places that can't take SVG |

Colours: cyan `#8ae8ff → #2e9fd1`, ink `#07131c`, tile navy `#0b1218`.
Keep clear space of at least half the mark's height around the lockup, and don't put the
colour mark on cyan or on mid-blue backgrounds; use a mono variant there.

Regenerate with `python3 scripts/make-logo.py public/brand` (needs `fonttools`, `uharfbuzz`, and Inter installed).
