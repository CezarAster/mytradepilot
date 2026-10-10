"""Generate the MyTradePilot logo set into public/brand.

The mark is a night-flight porthole: a dark glass orb with the equity river
running across it, one drawdown then the climb, ending in the glowing
"you are here" node that lights the glass from the top right. The wordmark
is Inter Display SemiBold (editorial variant: Instrument Serif) with the dot
of the "i" in Pilot replaced by the glowing "you are here" node from the chart.

Usage: python3 scripts/make-logo.py public/brand
Needs: pip install fonttools uharfbuzz; Inter installed system-wide.
Instrument Serif is downloaded to ~/.cache/mytradepilot-fonts if missing.
"""
import os, sys, math, urllib.request
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/brand"
SANS = "/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf"
SERIF_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf"
SERIF = os.path.expanduser("~/.cache/mytradepilot-fonts/InstrumentSerif-Regular.ttf")

ACC = "#6fe3ff"      # site accent
BG = "#070b0f"       # site background
GROUND = "#0e1f2a"   # instrument ground
CREAM = "#f1ece3"    # wordmark on dark
INK = "#0d1820"      # wordmark on light

def ensure_serif():
    if not os.path.exists(SERIF):
        os.makedirs(os.path.dirname(SERIF), exist_ok=True)
        urllib.request.urlretrieve(SERIF_URL, SERIF)

# ---------------------------------------------------------------- geometry
def seg_path(segs):
    d = f"M{segs[0][0][0]} {segs[0][0][1]}"
    for p0, p1, p2, p3 in segs:
        d += f" C{p1[0]} {p1[1]} {p2[0]} {p2[1]} {p3[0]} {p3[1]}"
    return d

# The river: a run-up, one drawdown, then the climb to the node.
RIVER = [((7, 44), (14, 44), (17, 30), (23, 29)),
         ((23, 29), (29, 28), (30, 40), (36, 39)),
         ((36, 39), (42, 38), (46, 22), (53, 18))]
NODE = (53.5, 17.5)

def mark(flat=False, mono=None):
    """Inner SVG of the mark in a 64x64 box.

    A dark glass orb, the night-flight porthole, with the equity river running
    across it and the glowing "you are here" node lighting the glass from the
    top right. flat=True drops filters and gradients (favicons, tiny sizes).
    mono: one colour for single-colour use.
    """
    d = seg_path(RIVER); nx, ny = NODE
    if mono:
        return f'''
  <circle cx="32" cy="32" r="29" fill="none" stroke="{mono}" stroke-width="2.6"/>
  <path d="{d}" fill="none" stroke="{mono}" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="{nx}" cy="{ny}" r="5.6" fill="{mono}"/>'''
    if flat:
        return f'''
  <circle cx="32" cy="32" r="30" fill="#0b1c28"/>
  <path d="{d}" fill="none" stroke="{ACC}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="{nx}" cy="{ny}" r="6" fill="{ACC}"/><circle cx="{nx}" cy="{ny}" r="2.6" fill="#ffffff"/>'''
    return f'''
  <defs>
    <radialGradient id="mtp-glass" cx="{nx}" cy="{ny}" r="52" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#17445c"/><stop offset="0.45" stop-color="#0c2231"/><stop offset="1" stop-color="#050d14"/>
    </radialGradient>
    <linearGradient id="mtp-rim" x1="54" y1="10" x2="14" y2="56" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{ACC}" stop-opacity="0.7"/><stop offset="0.5" stop-color="{ACC}" stop-opacity="0.12"/><stop offset="1" stop-color="{ACC}" stop-opacity="0.05"/>
    </linearGradient>
    <filter id="mtp-bloom" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <filter id="mtp-haze" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.2"/></filter>
  </defs>
  <circle cx="32" cy="32" r="30" fill="url(#mtp-glass)"/>
  <circle cx="32" cy="32" r="29.2" fill="none" stroke="url(#mtp-rim)" stroke-width="1.4"/>
  <path d="{d}" fill="none" stroke="{ACC}" stroke-width="6.5" stroke-linecap="round" opacity="0.28" filter="url(#mtp-haze)"/>
  <path d="{d}" fill="none" stroke="{ACC}" stroke-width="2.8" stroke-linecap="round"/>
  <circle cx="{nx}" cy="{ny}" r="11" fill="{ACC}" opacity="0.5" filter="url(#mtp-bloom)"/>
  <circle cx="{nx}" cy="{ny}" r="4.6" fill="{ACC}"/><circle cx="{nx}" cy="{ny}" r="2" fill="#ffffff"/>'''

def svg(body, vb="0 0 64 64", w=64, h=64, label="MyTradePilot"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" '
            f'role="img" aria-label="{label}">{body}\n</svg>\n')

# ---------------------------------------------------------------- wordmark
def _pts(contour):
    out = []
    for op, args in contour:
        if op in ("closePath", "endPath"):
            continue
        out += [a for a in args if a is not None]
    return out

def wordmark(font_path, cap, tracking_em, node_fill=ACC, core="#ffffff", glow=True):
    """Outline 'MyTradePilot' at the given cap height; the i-dot of Pilot becomes the node."""
    text = "MyTradePilot"
    blob = hb.Blob.from_file_path(font_path); face = hb.Face(blob); font = hb.Font(face)
    tt = TTFont(font_path); gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
    k = cap / tt["OS/2"].sCapHeight
    tracking = tracking_em * face.upem * k
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}")
    x = 0.0; node = None; i_cluster = text.rindex("i")
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        T = (k, 0, 0, -k, x + pos.x_offset * k, -pos.y_offset * k)
        if info.cluster == i_cluster:
            rec = RecordingPen(); gs[name].draw(rec)
            contours, cur = [], []
            for op, args in rec.value:
                cur.append((op, args))
                if op in ("closePath", "endPath"):
                    contours.append(cur); cur = []
            dot = max(contours, key=lambda c: min(p[1] for p in _pts(c)))
            px = [p[0] for p in _pts(dot)]; py = [p[1] for p in _pts(dot)]
            cx, cy, w = (min(px) + max(px)) / 2, (min(py) + max(py)) / 2, max(px) - min(px)
            node = (T[4] + cx * k, -cy * k, w * k)
            tp = TransformPen(pen, T)
            for c in contours:
                if c is not dot:
                    for op, args in c:
                        getattr(tp, op)(*args)
        else:
            gs[name].draw(TransformPen(pen, T))
        x += pos.x_advance * k + tracking
    nx, ny, w = node; r = w * 0.78
    extra = f'<circle cx="{nx:.2f}" cy="{ny:.2f}" r="{r*2.0:.2f}" fill="{node_fill}" opacity="0.32" filter="url(#mtp-wbloom)"/>' if glow else ""
    extra += f'<circle cx="{nx:.2f}" cy="{ny:.2f}" r="{r:.2f}" fill="{node_fill}"/><circle cx="{nx:.2f}" cy="{ny:.2f}" r="{r*0.42:.2f}" fill="{core}"/>'
    return pen.getCommands(), x - tracking, extra

FONTS = {"sans": (SANS, 0.62, -0.03), "serif": (SERIF, 0.70, 0.0)}

def lockup(fill, font="sans", mark_body=None, mark_h=32, gap=10, node_fill=ACC, core="#ffffff", glow=True):
    path, cap, tr = FONTS[font]
    d, adv, extra = wordmark(path, cap * mark_h, tr, node_fill, core, glow)
    tx = mark_h + gap if mark_body else 0
    base = mark_h / 2 + cap * mark_h / 2
    W, H = tx + adv + 2, mark_h
    body = f'\n  <g transform="scale({mark_h/64:.5f})">{mark_body}\n  </g>' if mark_body else ""
    body += f'\n  <defs><filter id="mtp-wbloom" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="{cap*mark_h*0.03:.2f}"/></filter></defs>'
    body += f'\n  <g transform="translate({tx:.2f} {base:.2f})"><path fill="{fill}" d="{d}"/>{extra}</g>'
    return svg(body, vb=f"0 0 {W:.2f} {H:.2f}", w=f"{W:.0f}", h=f"{H:.0f}")

# ---------------------------------------------------------------- files
ensure_serif()
files = {
    "logo-mark.svg": svg(mark()),
    "logo-mark-flat.svg": svg(mark(flat=True)),
    "logo-mark-mono-light.svg": svg(mark(mono=CREAM)),
    "logo-mark-mono-dark.svg": svg(mark(mono=INK)),
    "favicon.svg": svg(mark(flat=True)),
    "logo.svg": lockup(CREAM, "sans", mark()),
    "logo-light.svg": lockup(INK, "sans", mark()),
    "logo-serif.svg": lockup(CREAM, "serif", mark()),
    "logo-serif-light.svg": lockup(INK, "serif", mark()),
    "wordmark.svg": lockup(CREAM, "sans"),
    "wordmark-light.svg": lockup(INK, "sans"),
    "wordmark-serif.svg": lockup(CREAM, "serif"),
    "wordmark-serif-light.svg": lockup(INK, "serif"),
    "logo-mono-light.svg": lockup(CREAM, "sans", mark(mono=CREAM), node_fill=CREAM, core=BG, glow=False),
    "logo-mono-dark.svg": lockup(INK, "sans", mark(mono=INK), node_fill=INK, core="#ffffff", glow=False),
    "app-icon.svg": svg(f'\n  <rect width="64" height="64" fill="{BG}"/>\n  <g transform="translate(5 5) scale(0.84375)">{mark()}\n  </g>'),
}
os.makedirs(OUT, exist_ok=True)
for name, content in files.items():
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)
print(f"wrote {len(files)} files to {OUT}")
