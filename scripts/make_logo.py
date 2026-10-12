#!/usr/bin/env python3
"""Draw the Polarpost logo: a clear glass globe with its grid, tipped so the
North Pole faces you, and a clear glass letter travelling round it on a tilted
orbit — in front of the globe on the near side, hidden behind it on the far
side. Glass, and one colour for every line.

    python3 scripts/make_logo.py

writes four SVG files into site/assets/:

    logo.svg                still, for light backgrounds
    logo-dark.svg           still, for dark backgrounds
    logo-animated.svg       the letter orbits once every 16 seconds
    logo-animated-dark.svg

Which one the site shows is `logo` / `logo_dark` in config.toml. Change the
colours or proportions below and run it again.
"""

from math import cos, sin, radians, pi
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "assets"

# ── proportions (drawn on 120 × 120 units, cropped to the orbit's width) ──
C = 60                  # centre
R = 33                  # globe radius
TILT = 55               # how far the pole leans towards you, degrees
ORBIT = (52, 15, -16)   # orbit radius x, radius y, tilt in degrees
SECONDS = 16            # one orbit, animated version

# Minimal glass: a clear glass sphere and a clear glass letter, and one colour
# for every line — the grid, the orbit, the letter's outline and its stamp.
# Change LINE to recolour the whole logo.
PALETTE = {
    "light": dict(line="#1F3F8F", glass="#FFFFFF", glass_a=.55, tint="#DCE7F7", spec_a=.7,
                  pane_top=.95, pane_bottom=.75, shadow="#0F2236", shadow_a=.18),
    "dark":  dict(line="#B9CCF5", glass="#FFFFFF", glass_a=.08, tint="#6F8FC9", spec_a=.22,
                  pane_top=.40, pane_bottom=.22, shadow="#000000", shadow_a=.45),
}


def project(lon, lat):
    """Orthographic view of a globe whose pole is tipped towards the viewer.
    Returns (x, y, visible)."""
    lo, la, t = radians(lon), radians(lat), radians(TILT)
    x, y, z = cos(la) * sin(lo), sin(la), cos(la) * cos(lo)
    y, z = y * cos(t) - z * sin(t), y * sin(t) + z * cos(t)    # tip the pole towards us
    return C + R * x, C - R * y, z >= -1e-9


def polyline(points, back=False):
    """SVG path through the visible points (or, with back=True, the hidden ones —
    the far side of the grid, seen through the glass)."""
    d, pen = [], False
    for x, y, vis in points:
        if vis != back:
            d.append(f"{'L' if pen else 'M'}{x:.2f} {y:.2f}")
            pen = True
        else:
            pen = False
    return " ".join(d)


def grid(back=False):
    lines = []
    for lon in range(0, 360, 30):                                   # meridians
        lines.append(polyline([project(lon, lat) for lat in range(-90, 91, 3)], back))
    for lat in (-60, -30, 0, 30, 60):                               # parallels
        lines.append(polyline([project(lon, lat) for lon in range(0, 361, 3)], back))
    return [d for d in lines if d]


def envelope(p, theme):
    """A clear glass letter 23 × 15: outline, flap and stamp in the line colour."""
    w, h = 23, 15
    return f"""
      <g filter="url(#lift-{theme})">
        <rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="3" fill="url(#pane-{theme})"
              stroke="{p['line']}" stroke-width="1.4"/>
        <path d="M{-w/2 + 2.4} {-h/2 + 2.6} L0 {1.4} L{w/2 - 2.4} {-h/2 + 2.6}" fill="none"
              stroke="{p['line']}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </g>"""


def frame(pad=3.5):
    """The drawing's viewBox: everything the letter can touch on its way round,
    plus the globe and a little air for the shadows — so the letter never
    leaves the frame at either end of the orbit."""
    rx, ry, tilt = ORBIT
    w, h = 23 / 2 + 1.5, 15 / 2 + 2.5                  # half the letter, plus its shadow
    t = radians(tilt)
    xs, ys = [C - R, C + R], [C - R, C + R + 3]
    for i in range(360):
        a = radians(i)
        x, y = rx * cos(a), ry * sin(a)
        X, Y = C + x * cos(t) - y * sin(t), C + x * sin(t) + y * cos(t)
        xs += [X - w, X + w]
        ys += [Y - h, Y + h]
    x0, y0 = min(xs) - pad, min(ys) - pad
    return f"{x0:.1f} {y0:.1f} {max(xs) - x0 + pad:.1f} {max(ys) - y0 + pad:.1f}"


def svg(theme, animated):
    p = PALETTE[theme]
    rx, ry, tilt = ORBIT
    orbit = f"M{-rx} 0 A{rx} {ry} 0 1 0 {rx} 0 A{rx} {ry} 0 1 0 {-rx} 0"   # starts left, runs along the front
    # The far half of the globe in the orbit's own (tilted) frame: where the
    # letter is hidden behind the globe.
    behind = f"M-200 -200 H200 V200 H-200 Z M{-R} 0 A{R} {R} 0 0 1 {R} 0 Z"
    front_t = 0.38                                        # where the still letter sits
    a = pi * (1 - front_t * 2)                            # angle along the near half
    still = (rx * cos(a), ry * sin(a))
    letter = f'<g transform="rotate({-tilt})">{envelope(p, theme)}</g>'   # the letter stays upright
    if animated:
        mover = f"""<g>
        {letter}
        <animateMotion dur="{SECONDS}s" repeatCount="indefinite" path="{orbit}" calcMode="linear"/>
      </g>"""
    else:
        mover = f'<g transform="translate({still[0]:.2f} {still[1]:.2f})">{letter}</g>'
    px, py, _ = project(0, 90)
    t, line = theme, p["line"]

    vb = frame()
    _, _, vw, vh = vb.split()
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{vw}" height="{vh}">
  <title>Polarpost</title>
  <defs>
    <!-- clear glass: almost no colour, a touch deeper towards the edge -->
    <radialGradient id="body-{t}" cx=".45" cy=".4" r=".65">
      <stop offset="0" stop-color="{p['glass']}" stop-opacity="{p['glass_a']}"/>
      <stop offset=".8" stop-color="{p['tint']}" stop-opacity="{p['glass_a'] * .9:.2f}"/>
      <stop offset="1" stop-color="{p['tint']}" stop-opacity="{min(1, p['glass_a'] * 1.5):.2f}"/>
    </radialGradient>
    <linearGradient id="spec-{t}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".9"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="pane-{t}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="{p['pane_top']}"/>
      <stop offset="1" stop-color="{p['tint']}" stop-opacity="{p['pane_bottom']}"/>
    </linearGradient>
    <filter id="shadow-{t}" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.6" flood-color="{p['shadow']}" flood-opacity="{p['shadow_a']}"/>
    </filter>
    <filter id="lift-{t}" x="-40%" y="-40%" width="180%" height="200%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="{p['shadow']}" flood-opacity="{p['shadow_a']}"/>
    </filter>
    <clipPath id="near-{t}"><path clip-rule="evenodd" d="{behind}"/></clipPath>
    <clipPath id="ball-{t}"><circle cx="{C}" cy="{C}" r="{R}"/></clipPath>
  </defs>

  <!-- the far side of the orbit, seen through the glass -->
  <g transform="translate({C} {C}) rotate({tilt})">
    <path d="M{-rx} 0 A{rx} {ry} 0 0 1 {rx} 0" fill="none" stroke="{line}" stroke-width="1.2" stroke-opacity=".3"/>
  </g>

  <!-- the glass globe: its far grid faint, its near grid clear -->
  <circle cx="{C}" cy="{C}" r="{R}" fill="url(#body-{t})" filter="url(#shadow-{t})"/>
  <g clip-path="url(#ball-{t})" fill="none" stroke="{line}" stroke-linecap="round">
    <g stroke-width=".7" stroke-opacity=".18">{''.join(f'<path d="{d}"/>' for d in grid(back=True))}</g>
    <g stroke-width=".95" stroke-opacity=".8">{''.join(f'<path d="{d}"/>' for d in grid())}</g>
    <ellipse cx="{C - 2}" cy="{C - R * .6:.2f}" rx="{R * .7:.2f}" ry="{R * .3:.2f}" fill="url(#spec-{t})" stroke="none" opacity="{p['spec_a']}"/>
  </g>
  <circle cx="{C}" cy="{C}" r="{R}" fill="none" stroke="{line}" stroke-width="1.4"/>
  <circle cx="{px:.2f}" cy="{py:.2f}" r="1.8" fill="{line}"/>

  <!-- the near side of the orbit, and the letter on it -->
  <g transform="translate({C} {C}) rotate({tilt})" clip-path="url(#near-{t})">
    <path d="M{-rx} 0 A{rx} {ry} 0 0 0 {rx} 0" fill="none" stroke="{line}" stroke-width="1.4" stroke-linecap="round"/>
    {mover}
  </g>
</svg>
"""


if __name__ == "__main__":
    for theme in ("light", "dark"):
        for animated in (False, True):
            name = "logo" + ("-animated" if animated else "") + ("-dark" if theme == "dark" else "") + ".svg"
            (OUT / name).write_text(svg(theme, animated), encoding="utf8")
            print("wrote", OUT / name)
