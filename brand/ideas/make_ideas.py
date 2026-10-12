"""Six alternative Polarpost logo ideas, same language as the chosen one:
clear glass and one line colour. Writes SVGs to brand/ideas/."""
from math import cos, sin, radians, pi
from pathlib import Path

OUT = Path("/home/claude/polarpost/brand/ideas"); OUT.mkdir(parents=True, exist_ok=True)
LINE = "#1F3F8F"

DEFS = f"""<defs>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#DCE7F7" stop-opacity=".9"/>
  </linearGradient>
  <radialGradient id="ball" cx=".45" cy=".4" r=".65">
    <stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".8" stop-color="#DCE7F7" stop-opacity=".5"/>
    <stop offset="1" stop-color="#DCE7F7" stop-opacity=".85"/>
  </radialGradient>
  <linearGradient id="spec" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <filter id="sh" x="-30%" y="-30%" width="160%" height="170%">
    <feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#0F2236" flood-opacity=".18"/>
  </filter>
</defs>"""


def wrap(body, vb="0 0 120 120"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="240" height="240">{DEFS}{body}</svg>'


def polar_grid(cx, cy, r, rings=(1/3, 2/3), spokes=12, width=1):
    """The Arctic seen from straight above: rings of latitude, spokes of longitude."""
    out = [f'<circle cx="{cx}" cy="{cy}" r="{r * k:.2f}" fill="none" stroke="{LINE}" stroke-width="{width}" stroke-opacity=".8"/>' for k in rings]
    for i in range(spokes):
        a = 2 * pi * i / spokes
        out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx + r * cos(a):.2f}" y2="{cy + r * sin(a):.2f}" stroke="{LINE}" stroke-width="{width}" stroke-opacity=".8"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{max(1.6, r * .06):.2f}" fill="{LINE}"/>')
    return "".join(out)


def envelope(x, y, w, h, sw=2.2, rx=3):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="url(#glass)" stroke="{LINE}" stroke-width="{sw}"/>'
            f'<path d="M{x + 3} {y + 3.5} L{x + w / 2} {y + h * .55} L{x + w - 3} {y + 3.5}" fill="none" stroke="{LINE}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>')


# 1 · A postage stamp with the Arctic in it: perforated edge, polar grid, one route
def stamp():
    x0, y0, w, h, r = 22, 16, 76, 88, 3.6
    holes = []
    for i in range(1, 11):
        holes.append(f'<circle cx="{x0 + w * i / 11:.2f}" cy="{y0}" r="{r}"/><circle cx="{x0 + w * i / 11:.2f}" cy="{y0 + h}" r="{r}"/>')
    for i in range(1, 12):
        holes.append(f'<circle cx="{x0}" cy="{y0 + h * i / 12:.2f}" r="{r}"/><circle cx="{x0 + w}" cy="{y0 + h * i / 12:.2f}" r="{r}"/>')
    return wrap(f"""
  <mask id="perf"><rect width="120" height="120" fill="#fff"/><g fill="#000">{''.join(holes)}</g></mask>
  <g filter="url(#sh)"><rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="url(#glass)" mask="url(#perf)"/></g>
  <rect x="{x0 + 8}" y="{y0 + 8}" width="{w - 16}" height="{h - 16}" rx="2" fill="none" stroke="{LINE}" stroke-width="1.8"/>
  <clipPath id="win"><rect x="{x0 + 8}" y="{y0 + 8}" width="{w - 16}" height="{h - 16}" rx="2"/></clipPath>
  <g clip-path="url(#win)">{polar_grid(60, 58, 34, rings=(.33, .66, 1), width=1.1)}
    <path d="M38 84 Q52 46 76 42" fill="none" stroke="{LINE}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="38" cy="84" r="3.4" fill="#fff" stroke="{LINE}" stroke-width="2"/><circle cx="76" cy="42" r="3" fill="{LINE}"/>
  </g>""")


# 2 · A postmark: a ring with the name round it, the pole in the middle, cancel waves
def postmark():
    waves = "".join(f'<path d="M90 {46 + 9 * i} q5 -4 10 0 t10 0 t10 0" fill="none" stroke="{LINE}" stroke-width="2" stroke-linecap="round"/>' for i in range(4))
    return wrap(f"""
  <g filter="url(#sh)"><circle cx="48" cy="60" r="38" fill="url(#ball)"/></g>
  <circle cx="48" cy="60" r="38" fill="none" stroke="{LINE}" stroke-width="2.2"/>
  <circle cx="48" cy="60" r="26" fill="none" stroke="{LINE}" stroke-width="1.6"/>
  <path id="arc" d="M18 60 A30 30 0 0 1 78 60" fill="none"/>
  <text font-family="-apple-system,Segoe UI,Helvetica,sans-serif" font-size="8.6" font-weight="700" letter-spacing="2.4" fill="{LINE}">
    <textPath href="#arc" startOffset="50%" text-anchor="middle">POLARPOST</textPath></text>
  <path id="arc2" d="M20.5 64 A27.5 27.5 0 0 0 75.5 64" fill="none"/>
  <text font-family="-apple-system,Segoe UI,Helvetica,sans-serif" font-size="6.4" font-weight="600" letter-spacing="1.6" fill="{LINE}">
    <textPath href="#arc2" startOffset="50%" text-anchor="middle">· 90° N ·</textPath></text>
  {polar_grid(48, 60, 17, rings=(.5, 1), spokes=8, width=1)}
  {waves}""", vb="4 10 124 100")


# 3 · An envelope whose flap points north: the flap's tip becomes a compass star
def compass():
    star = "M60 14 L64 28 L78 32 L64 36 L60 50 L56 36 L42 32 L56 28 Z"
    return wrap(f"""
  <g filter="url(#sh)">{envelope(18, 38, 84, 58, sw=2.6, rx=6)}</g>
  <path d="{star}" fill="url(#glass)" stroke="{LINE}" stroke-width="2.2" stroke-linejoin="round"/>
  <circle cx="60" cy="32" r="2.2" fill="{LINE}"/>
  <text x="60" y="11" font-family="-apple-system,Segoe UI,Helvetica,sans-serif" font-size="9" font-weight="700" fill="{LINE}" text-anchor="middle">N</text>""",
                vb="10 0 100 104")


# 4 · The Arctic seen from above, inside an envelope's window
def window():
    return wrap(f"""
  <g filter="url(#sh)"><rect x="12" y="26" width="96" height="68" rx="7" fill="url(#glass)" stroke="{LINE}" stroke-width="2.6"/></g>
  <clipPath id="w4"><circle cx="60" cy="60" r="26"/></clipPath>
  <circle cx="60" cy="60" r="26" fill="url(#ball)" stroke="{LINE}" stroke-width="2"/>
  <g clip-path="url(#w4)">{polar_grid(60, 60, 26, rings=(.33, .66), width=1.1)}</g>
  <path d="M15 30 L46 52 M105 30 L74 52" fill="none" stroke="{LINE}" stroke-width="2.4" stroke-linecap="round"/>""",
                vb="6 18 108 84")


# 5 · A route as a monogram: the P drawn as one journey, ring at the start, dot at the end
def route_p():
    return wrap(f"""
  <path d="M42 96 V28 H64 a19 19 0 0 1 0 38 H50" fill="none" stroke="{LINE}" stroke-width="7"
        stroke-linecap="round" stroke-linejoin="round" filter="url(#sh)"/>
  <path d="M42 96 V28 H64 a19 19 0 0 1 0 38 H50" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" transform="translate(-1 -1)"/>
  <circle cx="42" cy="96" r="7" fill="#fff" stroke="{LINE}" stroke-width="3.4"/>
  <circle cx="50" cy="66" r="5" fill="{LINE}"/>""", vb="22 16 76 92")


# 6 · An app icon: a glass tile, the polar grid, one great-circle route and a letter on it
def app_icon():
    return wrap(f"""
  <g filter="url(#sh)"><rect x="14" y="14" width="92" height="92" rx="24" fill="url(#glass)"/></g>
  <rect x="14.8" y="14.8" width="90.4" height="90.4" rx="23.3" fill="none" stroke="#fff" stroke-width="1.6"/>
  <rect x="14" y="14" width="92" height="92" rx="24" fill="none" stroke="{LINE}" stroke-opacity=".25" stroke-width="1"/>
  {polar_grid(60, 60, 34, rings=(.33, .66, 1), width=1.1)}
  <path d="M32 80 Q46 38 86 46" fill="none" stroke="{LINE}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 5.2"/>
  <g transform="translate(78 38) rotate(-14)">{envelope(-11, -7.5, 22, 15, sw=2, rx=3)}</g>
  <circle cx="32" cy="80" r="3.6" fill="#fff" stroke="{LINE}" stroke-width="2"/>""")


IDEAS = [("1-stamp", "A stamp with the Arctic in it", stamp),
         ("2-postmark", "A postmark from the North Pole", postmark),
         ("3-compass", "An envelope that points north", compass),
         ("4-window", "The pole through an envelope window", window),
         ("5-route-p", "A route that writes P", route_p),
         ("6-app-icon", "An app icon", app_icon)]

for name, _, fn in IDEAS:
    (OUT / f"{name}.svg").write_text(fn())
print("ok")
