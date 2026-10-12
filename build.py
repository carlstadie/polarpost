#!/usr/bin/env python3
"""Compile the TOML sources into the JSON and images the site loads.

    python3 build.py            build into site/
    python3 build.py --boxes    also write proofs/ — every cover with its mark
                                boxes drawn on it, so you can check the numbers

The build refuses to finish if anything is wrong (a ref that points nowhere, a
box off the edge of the image, a collector who has not consented, a scan larger
than the privacy limit). Everything it is merely unsure about — the `verify`
flags — is printed as a list at the end but does not stop the build.

Only the standard library plus Pillow is needed:

    pip install pillow
"""

from __future__ import annotations

import json
import shutil
import sys
import tomllib
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
DATA = ROOT / "data"
COVERS = ROOT / "covers"
REFS = ROOT / "refs"          # optional official images you drop in yourself
SITE = ROOT / "site"
PROOFS = ROOT / "proofs"

# Catalogue file -> the ref kind that points into it.
CATALOGUES = {
    "expeditions": "expedition",
    "cachets": "cachet",
    "fieldnotes": "fieldnote",
    "flights": "flight",
    "stamps": "stamp",
    "postmarks": "postmark",
    "places": "place",
    "collectors": "collector",
    "people": "person",
}

# Marks whose ref is a bare word rather than "kind:key".
STANDALONE = {"signatures"}

problems: list[str] = []
unchecked: list[str] = []


def load(path: Path) -> dict:
    with path.open("rb") as fh:
        return tomllib.load(fh)


def jsonable(value):
    """TOML gives us real date objects; JSON wants strings."""
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    return value


def note_unchecked(kind: str, key: str, entry: dict) -> None:
    if entry.get("verify"):
        unchecked.append(f"{kind}:{key}")


# ─── load everything ────────────────────────────────────────────────────────

config = load(ROOT / "config.toml")
catalogue = {kind: load(DATA / f"{name}.toml") for name, kind in CATALOGUES.items()}

LANGS = config["i18n"]["languages"]
DEFAULT = config["i18n"]["default"]
OTHER_LANGS = [l for l in LANGS if l != DEFAULT]

# Interface text: every string must exist in every language, or the page would
# show a raw key. That is a hard stop, unlike a missing data translation.
ui = load(ROOT / "i18n" / "ui.toml")
for key, langs in ui.items():
    for lang in LANGS:
        if not langs.get(lang):
            problems.append(f"i18n/ui.toml: [\"{key}\"] has no {lang} line")

untranslated: list[str] = []

def check_translations(where: str, entry: dict) -> None:
    """List text fields that have an English value but no sibling in another
    language. These fall back to English on the site, so they never block."""
    for field in config["i18n"]["fields"]:
        value = entry.get(field)
        if not isinstance(value, str) or not value.strip():
            continue
        for lang in OTHER_LANGS:
            if not entry.get(f"{field}_{lang}"):
                untranslated.append(f"{where} {field}_{lang}")

for kind, entries in catalogue.items():
    for key, entry in entries.items():
        note_unchecked(kind, key, entry)
        check_translations(f"{kind}:{key}", entry)

# Flights: every airfield and crew member must exist; a crew member who asked
# not to be shown stays in the list as a gap, so the crew still counts right.
CREW = ("pilots", "science", "mechanics")
for key, flight in catalogue["flight"].items():
    where = f"data/flights.toml [{key}]"
    for field in ("date", "aircraft", "from", "to"):
        if field not in flight:
            problems.append(f"{where}: missing {field}")
    for field in ("from", "to"):
        if flight.get(field) and flight[field] not in catalogue["place"]:
            problems.append(f"{where}: {field} {flight[field]!r} is not in data/places.toml")
    if flight.get("expedition") and flight["expedition"] not in catalogue["expedition"]:
        problems.append(f"{where}: expedition {flight['expedition']!r} is not in data/expeditions.toml")
    for role in CREW:
        for who in flight.get(role, []):
            if who not in catalogue["person"]:
                problems.append(f"{where}: {role} {who!r} is not in data/people.toml")

letters = []
for path in sorted((DATA / "letters").glob("*.toml")):
    if path.name.startswith("_"):      # _TEMPLATE.toml and friends
        continue
    letter = load(path)
    letter["slug"] = path.stem
    letter["source_file"] = str(path.relative_to(ROOT))
    letters.append(letter)

if not letters:
    sys.exit("No letters found in data/letters/.")


# ─── check each letter ──────────────────────────────────────────────────────

def resolve(ref: str, where: str) -> tuple[str, str | None]:
    """Split "kind:key", check the key exists, return (kind, key)."""
    if ref in STANDALONE:
        return ref, None
    if ":" not in ref:
        problems.append(f"{where}: ref {ref!r} is not <kind>:<key>")
        return ref, None
    kind, key = ref.split(":", 1)
    if kind not in catalogue:
        problems.append(f"{where}: unknown mark kind {kind!r} in {ref!r}")
    elif key not in catalogue[kind]:
        problems.append(f"{where}: {ref!r} is not in data/{kind}s.toml")
    return kind, key


covers_used: set[str] = set()

for letter in letters:
    where = letter["source_file"]

    for field in ("id", "expedition", "collector", "posted_at", "cover"):
        if field not in letter:
            problems.append(f"{where}: missing {field}")

    kind = letter.get("kind")
    if kind not in config["kinds"]:
        problems.append(f"{where}: kind = {kind!r} — use one of {', '.join(config['kinds'])}")
    elif kind == "flight" and not any(m.get("ref", "").startswith("flight:") for m in letter.get("marks", [])):
        problems.append(f"{where}: a flight cover needs a mark ref = \"flight:<key>\" for its flight list")

    exp = letter.get("expedition")
    if exp and exp not in catalogue["expedition"]:
        problems.append(f"{where}: expedition {exp!r} is not in data/expeditions.toml")

    place = letter.get("posted_at")
    if place and place not in catalogue["place"]:
        problems.append(f"{where}: posted_at {place!r} is not in data/places.toml")

    collector = catalogue["collector"].get(letter.get("collector", ""))
    if collector is None:
        problems.append(f"{where}: collector {letter.get('collector')!r} is not in data/collectors.toml")
    elif config["privacy"]["require_consent"] and not collector.get("consent"):
        problems.append(f"{where}: collector has not consented — remove the letter or set consent")

    check_translations(where, letter)
    for i, mark in enumerate(letter.get("marks", []), 1):
        check_translations(f"{where} mark {i}", mark)

    if "address" in letter:
        problems.append(f"{where}: has an address field. Addresses never go in this repository.")

    cover = COVERS / letter.get("cover", "")
    if not letter.get("cover"):
        pass
    elif not cover.exists():
        problems.append(f"{where}: cover {letter['cover']} not found in covers/")
    else:
        covers_used.add(letter["cover"])
        kb = cover.stat().st_size / 1024
        if kb > config["privacy"]["max_scan_kb"]:
            problems.append(
                f"{where}: {letter['cover']} is {kb:.0f} kB, over the "
                f"{config['privacy']['max_scan_kb']} kB limit — is it the unprocessed original?"
            )

    for i, mark in enumerate(letter.get("marks", []), 1):
        spot = f"{where} mark {i}"
        kind, key = resolve(mark.get("ref", ""), spot)
        mark["kind"] = kind
        mark["key"] = key
        mark["n"] = i

        for who in mark.get("people", []):
            if who not in catalogue["person"]:
                problems.append(f"{spot}: {who!r} is not in data/people.toml")
            elif not catalogue["person"][who].get("show", True):
                problems.append(f"{spot}: {who!r} has show = false — remove the name or the mark")

        box = mark.get("box")
        if not (isinstance(box, list) and len(box) == 4):
            problems.append(f"{spot}: box must be [x, y, width, height]")
            continue
        x, y, w, h = box
        if w <= 0 or h <= 0:
            problems.append(f"{spot}: box width and height must be positive")
        if x < 0 or y < 0 or x + w > 1.001 or y + h > 1.001:
            problems.append(f"{spot}: box runs off the edge — values are fractions of the image")

for name in sorted(p.name for p in COVERS.glob("*.jpg")):
    if name not in covers_used:
        unchecked.append(f"covers/{name} is not used by any letter")

if problems:
    print("\n".join(f"  {p}" for p in problems), file=sys.stderr)
    sys.exit(f"\n{len(problems)} problem(s). Nothing was written.")


# ─── crop a thumbnail for every mark that has no official picture ───────────

def thumbnail_for(letter: dict, mark: dict) -> str | None:
    """Return the URL of a picture for this mark, cropping one if needed.

    An `image` in the catalogue entry always wins: drop an official picture into
    refs/ and name it there. Otherwise the mark's own box is cropped out of the
    scan, which is your own photograph of your own cover and always available.
    """
    entry = catalogue.get(mark["kind"], {}).get(mark["key"] or "", {})
    if entry.get("image"):
        src = REFS / entry["image"]
        if not src.exists():
            unchecked.append(f"refs/{entry['image']} is named in the catalogue but missing")
            return None
        shutil.copy2(src, SITE / "refs" / src.name)
        return f"refs/{src.name}"

    if mark["kind"] in config["privacy"]["never_crop"]:
        return None

    cover = Image.open(COVERS / letter["cover"])
    W, H = cover.size
    x, y, w, h = mark["box"]
    pad = 0.012                                   # a little air around the mark
    box = (
        max(0, int((x - pad) * W)), max(0, int((y - pad) * H)),
        min(W, int((x + w + pad) * W)), min(H, int((y + h + pad) * H)),
    )
    crop = cover.crop(box)
    crop.thumbnail((420, 420))
    name = f"{letter['slug']}-{mark['n']:02d}.jpg"
    crop.save(SITE / "refs" / "auto" / name, quality=84, optimize=True)
    return f"refs/auto/{name}"


# ─── write the site ─────────────────────────────────────────────────────────

for folder in ("data", "covers", "refs/auto"):
    (SITE / folder).mkdir(parents=True, exist_ok=True)

for name in sorted(covers_used):
    shutil.copy2(COVERS / name, SITE / "covers" / name)

out_letters = []
for letter in letters:
    marks = []
    for mark in letter.get("marks", []):
        marks.append(jsonable({
            "n": mark["n"],
            "kind": mark["kind"],
            "key": mark["key"],
            "box": mark["box"],
            **{k: v for k, v in mark.items() if k == "note" or k.startswith("note_")},
            "date": mark.get("date"),
            "people": mark.get("people"),
            "image": thumbnail_for(letter, mark),
        }))

    place = catalogue["place"][letter["posted_at"]]
    home = catalogue["place"][catalogue["collector"][letter["collector"]]["home"]]
    out_letters.append(jsonable({
        "id": letter["id"],
        "slug": letter["slug"],
        "expedition": letter["expedition"],
        "kind": letter["kind"],
        "collector": letter["collector"],
        "posted_at": letter["posted_at"],
        "posted_on": letter.get("posted_on"),
        "year": letter.get("year") or (letter["posted_on"].year if letter.get("posted_on") else None),
        "cover": f"covers/{letter['cover']}",
        **{k: (v or "").strip() or None for k, v in letter.items()
           if k == "note" or k.startswith("note_")},
        "from": [place["lon"], place["lat"]],
        "to": [home["lon"], home["lat"]],
        "marks": marks,
    }))

out_letters.sort(key=lambda l: (l["posted_on"] or "", l["id"]))

(SITE / "data" / "letters.json").write_text(
    json.dumps(out_letters, indent=1, ensure_ascii=False), encoding="utf8")

# A logo is shown only when its file is actually there. Drop a PNG at the path
# in config.toml and rebuild; delete it and the masthead simply has no logo.
site_info = dict(config["site"])
for field in ("logo", "logo_dark"):
    path = site_info.get(field)
    if path and not (SITE / path).exists():
        site_info[field] = None

# The "Send us a cover" page. Its texts follow the same two-language rule as
# everything else; an empty email just means no button yet.
send = load(DATA / "send.toml") if (DATA / "send.toml").exists() else {}
if send:
    for field in ("title", "intro", "subject", "body"):
        for lang in OTHER_LANGS:
            if send.get(field) and not send.get(f"{field}_{lang}"):
                untranslated.append(f"send.toml {field}_{lang}")
    for i, part in enumerate([*send.get("step", []), send.get("privacy", {})]):
        for field in ("title", "text"):
            for lang in OTHER_LANGS:
                if part.get(field) and not part.get(f"{field}_{lang}"):
                    untranslated.append(f"send.toml part {i + 1} {field}_{lang}")
    email = (send.get("email") or "").strip()
    if not email:
        unchecked.append("data/send.toml has no email yet, so the page shows no Write button")
    elif "@" not in email or " " in email:
        problems.append(f"data/send.toml: email {email!r} does not look like an address")
        print("\n".join(f"  {p}" for p in problems), file=sys.stderr); sys.exit(1)
    for k, v in list(send.items()):
        if isinstance(v, str):
            send[k] = v.strip()

(SITE / "data" / "ui.json").write_text(
    json.dumps({"languages": LANGS, "default": DEFAULT,
                "locales": config["i18n"].get("locales", {}), "strings": ui},
               indent=1, ensure_ascii=False), encoding="utf8")

# What gets published. People with show = false are left out entirely, and
# their places in a flight crew become null ("name not shown").
public = {kind: dict(entries) for kind, entries in catalogue.items()}
hidden = {k for k, p in catalogue["person"].items() if not p.get("show", True)}
public["person"] = {k: p for k, p in catalogue["person"].items() if k not in hidden}
public["flight"] = {
    key: {**flight, **{role: [None if who in hidden else who for who in flight.get(role, [])]
                       for role in CREW}}
    for key, flight in catalogue["flight"].items()
}

(SITE / "data" / "catalogue.json").write_text(
    json.dumps({
        "site": site_info,
        "globe": config["globe"],
        "marks": config["marks"],
        "detail": config["detail"],
        "send": send,
        "kinds": config["kinds"],
        **{k + "s": jsonable(v) for k, v in public.items()},
    }, indent=1, ensure_ascii=False), encoding="utf8")


# ─── the stylesheet the config owns ────────────────────────────────────────

def css_vars(colors: dict) -> str:
    return "\n".join(f"  --{k}: {v};" for k, v in colors.items())

import re

def with_alpha(colour: str, alpha) -> str:
    """rgba(r, g, b, a) with a new a. Anything else is returned as it was."""
    m = re.match(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)", colour)
    return f"rgba({m[1]}, {m[2]}, {m[3]}, {float(alpha):g})" if m and alpha is not None else colour

layout = {"topbar": "top", "catalogue": "right", "width": 372, "gap": 14, "radius": 22,
          **config.get("layout", {})}
glass = {"opacity": None, "opacity_dark": None, "blur": 26, **config.get("glass", {})}
for field, allowed in (("topbar", ("top", "bottom")), ("catalogue", ("right", "left"))):
    if layout[field] not in allowed:
        sys.exit(f"config.toml [layout] {field} = {layout[field]!r}: use one of {', '.join(allowed)}")
for field in ("opacity", "opacity_dark"):
    if glass[field] is not None and not 0 <= float(glass[field]) <= 1:
        sys.exit(f"config.toml [glass] {field} = {glass[field]}: use a number from 0 to 1")

light = {**config["colors"]["light"], "glass": with_alpha(config["colors"]["light"]["glass"], glass["opacity"])}
dark = {**config["colors"]["dark"], "glass": with_alpha(config["colors"]["dark"]["glass"], glass["opacity_dark"])}

# Moving a panel is a handful of overrides, wide screens only. `html` in front
# makes them win over site.css whatever the order the files load in.
moves = []
if layout["catalogue"] == "left":
    moves.append("""  html .panel { right: auto; left: var(--gap) }
  html .bottombar, html .scope, html .detail { left: calc(var(--side-w) + 2 * var(--gap)); right: var(--gap) }""")
if layout["topbar"] == "bottom":
    moves.append("""  html .topbar { top: auto; bottom: var(--gap) }
  html .bottombar { bottom: auto; top: var(--gap); align-items: flex-start }
  html .toast { bottom: calc(var(--bar-bottom) + 10px) }""")
layout_css = ("@media (min-width: 901px) {\n" + "\n".join(moves) + "\n}\n") if moves else ""

(SITE / "assets" / "css").mkdir(parents=True, exist_ok=True)
(SITE / "assets" / "css" / "tokens.css").write_text(f"""/* Generated by build.py from config.toml. Do not edit by hand. */
:root {{
{css_vars(light)}
  --gap: {int(layout['gap'])}px;
  --side-w: {int(layout['width'])}px;
  --side-w-set: {int(layout['width'])}px;
  --radius: {int(layout['radius'])}px;
  --glass-blur: {int(glass['blur'])}px;
  --ui: {config['fonts']['ui']};
  --hand: {config['fonts']['hand']};
  --title-size: {config['type']['title_size']};
  --base-size: {config['type']['base_size']};
  --line-height: {config['type']['line_height']};
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
{css_vars(dark)}
  }}
}}
:root[data-theme="dark"] {{
{css_vars(dark)}
}}
{layout_css}""", encoding="utf8")


# ─── proof sheet ────────────────────────────────────────────────────────────

if "--boxes" in sys.argv:
    PROOFS.mkdir(exist_ok=True)
    for letter in letters:
        im = Image.open(COVERS / letter["cover"]).convert("RGB")
        W, H = im.size
        draw = ImageDraw.Draw(im)
        for mark in letter.get("marks", []):
            x, y, w, h = mark["box"]
            rect = (x * W, y * H, (x + w) * W, (y + h) * H)
            draw.rectangle(rect, outline=(200, 30, 30), width=3)
            draw.text((rect[0] + 6, rect[1] + 4), f"{mark['n']} {mark['ref']}",
                      fill=(200, 30, 30))
        im.save(PROOFS / f"{letter['slug']}.jpg", quality=80)
    print(f"proofs/      {len(letters)} sheets — open them and nudge the boxes")


# ─── report ─────────────────────────────────────────────────────────────────

print(f"site/        {len(out_letters)} letters, "
      f"{sum(len(l['marks']) for l in out_letters)} marks, "
      f"{len(covers_used)} covers")

if untranslated:
    by_lang = {}
    for item in untranslated:
        by_lang.setdefault(item.rsplit("_", 1)[-1], []).append(item)
    for lang, items in by_lang.items():
        print(f"\nStill to translate into {lang} ({len(items)}; English is shown meanwhile):")
        for item in items:
            print(f"  {item}")

if unchecked:
    print("\nStill to check (verify = true, or a loose end):")
    for item in sorted(set(unchecked)):
        print(f"  {item}")
    print("\nThese do not stop the build. Clear a flag by deleting the line once\n"
          "you have confirmed the entry against a catalogue or the cover itself.")
