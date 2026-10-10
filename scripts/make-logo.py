"""Generate the MyTradePilot logo set into public/brand.

The mark is an attitude indicator (the pilot's artificial horizon) whose
horizon is an equity curve: one drawdown, then the climb. The white bars and
dot are the aircraft reference, fixed while the horizon moves. The wordmark
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

# The horizon: enters low on the left, a gentle swell, a drawdown, then the climb.
HORIZON = [((-10, 46), (6, 45), (12, 37), (20, 36)),
           ((20, 36), (26, 35), (27, 41), (33, 39)),
           ((33, 39), (42, 36), (50, 26), (74, 20))]

def mark(aircraft=True, ring=True, mono=None):
    """Inner SVG of the mark in a 64x64 box. mono: a single colour for one-colour use."""
    if mono:
        # one colour: the aircraft reference is knocked out of the sky with a mask
        return f'''
  <defs>
    <clipPath id="mtp-clip"><circle cx="32" cy="32" r="27"/></clipPath>
    <mask id="mtp-ac"><rect width="64" height="64" fill="#fff"/>
      <path d="M17 34 H25 M39 34 H47" stroke="#000" stroke-width="3.2" stroke-linecap="round"/><circle cx="32" cy="34" r="3.2" fill="#000"/></mask>
  </defs>
  <circle cx="32" cy="32" r="28" fill="none" stroke="{mono}" stroke-width="2.4"/>
  <g mask="url(#mtp-ac)"><path d="{seg_path(HORIZON)} L74 -10 L-10 -10 Z" fill="{mono}" clip-path="url(#mtp-clip)"/></g>
  <g clip-path="url(#mtp-clip)"><path d="M39 34 H47" stroke="{mono}" stroke-width="3.2" stroke-linecap="round"/></g>'''
    b = f'''
  <defs><clipPath id="mtp-clip"><circle cx="32" cy="32" r="27"/></clipPath></defs>
  <circle cx="32" cy="32" r="27" fill="{GROUND}"/>
  <path d="{seg_path(HORIZON)} L74 -10 L-10 -10 Z" fill="{ACC}" clip-path="url(#mtp-clip)"/>'''
    if ring:
        b += f'\n  <circle cx="32" cy="32" r="29" fill="none" stroke="{ACC}" stroke-width="2.2" opacity="0.6"/>'
    if aircraft:
        b += f'''
  <path d="M17 34 H25 M39 34 H47" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="32" cy="34" r="3.2" fill="#ffffff"/>'''
    else:
        b += '\n  <circle cx="32" cy="34" r="4" fill="#ffffff"/>'
    return b

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
    extra = f'<circle cx="{nx:.2f}" cy="{ny:.2f}" r="{r*2.1:.2f}" fill="{node_fill}" opacity="0.18"/>' if glow else ""
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
    body += f'\n  <g transform="translate({tx:.2f} {base:.2f})"><path fill="{fill}" d="{d}"/>{extra}</g>'
    return svg(body, vb=f"0 0 {W:.2f} {H:.2f}", w=f"{W:.0f}", h=f"{H:.0f}")

# ---------------------------------------------------------------- files
ensure_serif()
files = {
    "logo-mark.svg": svg(mark()),
    "logo-mark-mono-light.svg": svg(mark(mono=CREAM)),
    "logo-mark-mono-dark.svg": svg(mark(mono=INK)),
    "favicon.svg": svg(mark(aircraft=False)),
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
    "app-icon.svg": svg(f'\n  <rect width="64" height="64" fill="{BG}"/>\n  <g transform="translate(7 7) scale(0.78125)">{mark()}\n  </g>'),
}
os.makedirs(OUT, exist_ok=True)
for name, content in files.items():
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)
print(f"wrote {len(files)} files to {OUT}")
