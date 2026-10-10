"""Generate the MyTradePilot logo set.

Mark: a cyan diamond (the site's existing accent ◆) with an equity curve
running through it, ending in the "current equity" dot from the chart.
Wordmark: "MyTradePilot" outlined from Inter SemiBold so the SVG needs no font.
"""
import os, sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = sys.argv[1]
FONT = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"

CYAN_HI = "#8ae8ff"
CYAN = "#5cc8ef"
CYAN_LO = "#2e9fd1"
NAVY = "#07131c"     # ink on the tile
INK_LIGHT = "#0f1a24"  # wordmark on light backgrounds

# ---------- mark ----------
# 64x64 viewBox. Diamond = rounded square rotated 45°, vertices ~ 4px from edge.
# Rises across the diamond with one drawdown; the dot (current equity) sits on the NE edge.
RIVER = "M14 41 L23.5 31.5 L29.5 37.5 L45.75 18.25"
DOT = (45.75, 18.25)

def mark_body(variant="solid", scale_stroke=1.0):
    """Inner elements of the mark (no <svg> wrapper). variant: solid | mono | tile"""
    sw = 4.2 * scale_stroke
    if variant == "solid":
        return f"""
  <defs>
    <linearGradient id="mtp-g" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{CYAN_HI}"/>
      <stop offset="1" stop-color="{CYAN_LO}"/>
    </linearGradient>
  </defs>
  <rect x="12.5" y="12.5" width="39" height="39" rx="4" transform="rotate(45 32 32)" fill="url(#mtp-g)"/>
  <path d="{RIVER}" fill="none" stroke="{NAVY}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="{DOT[0]}" cy="{DOT[1]}" r="{3.6*scale_stroke}" fill="#ffffff" stroke="{NAVY}" stroke-width="{2.2*scale_stroke}"/>"""
    if variant == "mono":
        # single colour (currentColor): outlined diamond, line, dot
        return f"""
  <rect x="12.5" y="12.5" width="39" height="39" rx="4" transform="rotate(45 32 32)" fill="none" stroke="currentColor" stroke-width="{3.2*scale_stroke}"/>
  <path d="{RIVER}" fill="none" stroke="currentColor" stroke-width="{3.6*scale_stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="{DOT[0]}" cy="{DOT[1]}" r="{3.8*scale_stroke}" fill="currentColor"/>"""
    raise ValueError(variant)

def svg(w, h, body, viewbox="0 0 64 64", extra_attrs="", title="MyTradePilot"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="{w}" height="{h}" '
            f'role="img" aria-label="{title}"{extra_attrs}>{body}\n</svg>\n')

# ---------- wordmark ----------
def outline_text(text, font_path, size, tracking_em=-0.02):
    """Return (path_d, advance_width, ascender, cap_height, descender) at given px size."""
    blob = hb.Blob.from_file_path(font_path)
    face = hb.Face(blob)
    font = hb.Font(face)
    upem = face.upem
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True, "calt": True})
    tt = TTFont(font_path)
    gs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    k = size / upem
    tracking = tracking_em * size
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}")
    x = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        tp = TransformPen(pen, (k, 0, 0, -k, x + pos.x_offset * k, -pos.y_offset * k))
        gs[name].draw(tp)
        x += pos.x_advance * k + tracking
    x -= tracking
    os2 = tt["OS/2"]
    return pen.getCommands(), x, os2.sTypoAscender * k, os2.sCapHeight * k, os2.sTypoDescender * k

CAP = 22.0  # cap height of wordmark in lockup units
d, adv, asc, cap, desc = outline_text("MyTradePilot", FONT, size=1.0)
k = CAP / cap
d, adv, asc, cap, desc = outline_text("MyTradePilot", FONT, size=k)

MARK_H = 32.0          # mark size in lockup
GAP = 9.0
PAD = 2.0
# baseline so caps are vertically centred on the mark
baseline = PAD + MARK_H / 2 + cap / 2
text_x = PAD + MARK_H + GAP
W = text_x + adv + PAD
H = MARK_H + 2 * PAD
# descender of "y" and "p" hangs below; keep height = mark height, it fits visually.

def lockup(text_fill, mark_variant="solid", mark_color=None):
    mark = mark_body(mark_variant)
    g_attrs = f' color="{mark_color}"' if mark_color else ""
    body = f"""
  <g transform="translate({PAD} {PAD}) scale({MARK_H/64:.5f})"{g_attrs}>{mark}
  </g>
  <path transform="translate({text_x:.2f} {baseline:.2f})" fill="{text_fill}" d="{d}"/>"""
    return svg(f"{W:.0f}", f"{H:.0f}", body, viewbox=f"0 0 {W:.2f} {H:.2f}")

files = {}
# 1. mark only, full colour (any background)
files["logo-mark.svg"] = svg(64, 64, mark_body("solid"))
# 2. mark, single colour via currentColor (default cyan)
files["logo-mark-mono.svg"] = svg(64, 64, mark_body("mono"), extra_attrs=f' color="{CYAN}"')
# 3. favicon: same mark, slightly heavier strokes so it survives 16px
files["favicon.svg"] = svg(64, 64, mark_body("solid", scale_stroke=1.25))
# 4. lockups
files["logo.svg"] = lockup("#ffffff")                  # on dark
files["logo-light.svg"] = lockup(INK_LIGHT)            # on light
files["logo-mono-dark.svg"] = lockup("#ffffff", "mono", "#ffffff")   # one colour, white
files["logo-mono-light.svg"] = lockup(INK_LIGHT, "mono", INK_LIGHT)  # one colour, ink
# 5. app icon: full-bleed dark tile with the mark (iOS/Android round the corners themselves)
app_body = f"""
  <rect width="64" height="64" fill="#0b1218"/>
  <g transform="translate(6 6) scale(0.8125)">{mark_body("solid")}
  </g>"""
files["app-icon.svg"] = svg(64, 64, app_body)

os.makedirs(OUT, exist_ok=True)
for name, content in files.items():
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)
    print(name, len(content), "bytes")
print(f"lockup {W:.1f}x{H:.1f}, text_x={text_x:.1f}, baseline={baseline:.1f}, cap={cap:.1f}")
