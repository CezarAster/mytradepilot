# MyTradePilot brand assets

**The mark is a night-flight porthole**: a dark glass orb with the equity river running
across it, one drawdown then the climb, ending in the glowing "you are here" node that
lights the glass from the top right. It is rendered the way the hero chart is rendered:
deep navy, neon line, soft bloom.

**The wordmark** is Inter Display SemiBold. The dot of the "i" in Pilot is the glowing
"you are here" node from the equity chart. An editorial variant uses Instrument Serif, the
headline face.

All SVGs are self-contained (text is outlined, no fonts needed).

| File | Use |
| --- | --- |
| `logo.svg` / `logo-light.svg` | Primary lockup on dark / light backgrounds |
| `logo-serif.svg` / `logo-serif-light.svg` | Editorial lockup (Instrument Serif) |
| `logo-mono-light.svg` / `logo-mono-dark.svg` | One-colour lockups: cream for dark surfaces, ink for light |
| `wordmark*.svg` | Wordmark alone, same variants |
| `logo-mark.svg` | Mark alone, any background |
| `logo-mark-mono-light.svg` / `-dark.svg` | One-colour mark |
| `logo-mark-flat.svg` / `favicon.svg` | Mark without filters or gradients, heavier line, for 16 to 32 px and places that can't render SVG filters |
| `app-icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Full-bleed app icons on the site background |
| `logo-1600.png`, `logo-light-1600.png`, `logo-mark-512.png` | Raster exports |

Colours: accent `#6fe3ff`, glass `#17445c → #050d14`, background `#070b0f`, cream `#f1ece3`, ink `#0d1820`.
Keep clear space of at least half the mark's height around the lockup. On cyan or mid-blue
surfaces use a mono variant.

Regenerate with `python3 scripts/make-logo.py public/brand` (needs `fonttools` and `uharfbuzz`,
Inter installed; Instrument Serif is fetched on first run).
