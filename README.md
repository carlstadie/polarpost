# Polarpost

A local, offline site that maps expedition mail: where each cover was posted,
where it went, and what every mark on it is.

Everything runs on your machine. No CDN, no hosted fonts, no API calls. d3 is
vendored into `site/assets/js/vendor/`, the coastlines into `site/assets/`.

```bash
pip install pillow          # the only dependency; Python 3.11+ for tomllib
python3 build.py            # TOML  ->  site/
cd site && python3 -m http.server 8777
# or, all in one, with rebuild-on-save:  npm start   (inside the polarpost folder)
# or with pixi, which brings its own Python and Pillow:  pixi run start
```

Then open <http://localhost:8777>.

`npm start` and `pixi run start` run `scripts/serve.py`, a small preview server:
it builds, serves the site, and whenever you save `config.toml`, anything in
`data/` or `i18n/`, a cover, or a file in `site/assets/`, it rebuilds and the
open page reloads itself. It also tells the browser never to keep old copies, so
what you see is always what is on disk. If the build stops on a mistake, the
terminal says why and the page keeps the last good version. If port 8777 is
taken (an earlier preview still running in another window), it says so; stop
that one, or start with `PORT=8778 npm start`.

---

## Where things live

```
config.toml              colours, fonts, globe physics, languages, privacy limits
i18n/ui.toml             every word of the interface, in every language, side by side
data/
  places.toml            post offices, field sites, collectors' towns
  collectors.toml        who the covers were sent to  (consent lives here)
  expeditions.toml       one entry per campaign
  cachets.toml           the expedition's logo: printed labels and rubber stamps
  fieldnotes.toml        what the team wrote on a cover by hand
  flights.toml           research flights that carried covers
  stamps.toml            marks the post office sells
  postmarks.toml         marks the post office applies
  people.toml            who signed the covers
  send.toml              the "Send us a cover" page: its words, steps and email
  letters/*.toml         one file per cover — the only file you touch often
covers/*.jpg             blurred, web-sized scans
refs/                    optional official pictures you supply yourself
build.py                 validates everything, then writes site/
site/                    the site. assets/ and index.html are hand-written;
                         data/, covers/, refs/auto/ and tokens.css are generated
site/assets/logo*.svg    the logo (scripts/make_logo.py draws it) — see "Logo" below
brand/                   the logo as large PNGs, for anything that is not the site
proofs/                  written by `build.py --boxes`, for checking hotspots
```

The rule that keeps this maintainable: **a fact appears exactly once.** A place
has one set of coordinates, a stamp has one description, an expedition has one
summary. Letters reference them by key. Correct Neumayer's latitude in
`places.toml` and every letter follows.

---

## Adding a letter

1. **Scan the cover**, front and back. Keep the originals somewhere private;
   they never enter this folder.

2. **Blur the address and shrink it.** The recipient's address is a private
   person's postal address, and this folder is meant to be publishable.

   ```bash
   python3 scripts/blur.py raw/IMG_0042.tif covers/2026-thinice-tuk.jpg 430 330 710 470
   #                       in               out                         x0  y0  x1  y1
   ```

3. **Copy the template** and fill it in:

   ```bash
   cp data/letters/_TEMPLATE.toml data/letters/2026-09-01-thinice-tuktoyaktuk.toml
   ```

   The file name becomes the letter's slug, so lead with the date and it sorts
   itself.

   Set its `kind` (signed, description or flight, see "Kinds of cover" below).

4. **Place the hotspots.** Guess the boxes, then:

   ```bash
   python3 build.py --boxes
   ```

   `proofs/` now holds every cover with its boxes drawn and numbered on it.
   Open yours, nudge the numbers, run it again. Two rounds is usually enough.

5. **Build.** Anything genuinely wrong stops the build and is listed. Anything
   merely unconfirmed is printed at the end as a to-do list.

---

## Kinds of cover

An expedition usually sends several covers, and they are not alike. Every
letter says which kind it is, on one line near the top of its file:

```toml
kind = "signed"        # signed | description | flight
```

- **signed** — the expedition's cachet (its logo), signed by the people in camp.
- **description** — the team describes its work on the cover by hand. The
  writing is a *field note* (below).
- **flight** — flown on a research flight. The cover lists the date, the
  aircraft, the crew and the airfields; that list is a mark of its own,
  `ref = "flight:<key>"`, with the flight in `data/flights.toml`.

The kinds, their names in both languages and their icons are `[kinds]` in
`config.toml`; add one there and the site picks it up. The kind shows as a small
icon in every list, as a label above a letter's heading, and as a menu in the
top bar ("All letters / Signed letters / …"), which appears once the collection has
more than one kind.

### An expedition's covers as a set

Every expedition has a page (from the Expeditions tile, or the **Expedition**
button on any of its letters): its summary, all its covers side by side in kind
order, its flights, everyone named on its covers, and a button to show only its
letters on the globe.

### Flights

```toml
[polar6-2026-07-14]               # in data/flights.toml
date       = 2026-07-14
aircraft   = "Polar 6"
from       = "inuvik"             # airfields are places in places.toml;
to         = "inuvik"             # the same one twice reads "Round trip from Inuvik"
pilots     = ["…"]                # people.toml keys, in the order printed
science    = ["carl-stadie"]
mechanics  = ["…"]
purpose    = "Laser scanning of the Mackenzie Delta coast."
purpose_de = "Laserscanning der Küste des Mackenzie-Deltas."
expedition = "permax-ground-alaska-2026"
```

No line is drawn for a flight on the globe: a survey flight usually starts and
ends at the same airfield, and the track between is not on the cover. The cover
still has its postal route home, like every other.

A flight cover's page gets a **The flight** section with all of the above. Every
crew member links to everything else they signed or flew, and the flight itself
is a thread ("Letters on this flight"). The pilots and mechanics count as people
everywhere: in the People list, the search and the expedition page.

Someone in `people.toml` with `show = false` is left out of the published data
altogether; in a crew list they appear as "name not shown", so the crew still
counts right.

---

## What a mark is

Each `[[marks]]` block in a letter is one clickable thing on the cover:

```toml
[[marks]]
ref  = "stamp:ca-inuit-community-17c"   # <kind>:<key> into data/<kind>s.toml
box  = [0.717, 0.020, 0.249, 0.267]     # x, y, w, h as fractions of the image
date = 2026-09-01                       # postmarks only
note = "Posted from one of the communities the stamp depicts."
```

### Handwriting: field notes

Writing by hand on a cover is not a cachet, it is a field note
(`ref = "fieldnote:<key>"`, entries in `data/fieldnotes.toml`), and it is
usually the best thing on the cover. Transcribe it rather than describing it,
and say what language the hand wrote in:

```toml
[forest-change-alaska-2026]
transcript_lang = "de"
transcript      = """
Forest Change Alaska 2026:
Untersuchung der Reaktion
verschiedener Baumarten
"""
translation     = """
Forest Change Alaska 2026: how different tree species respond …
"""
```

The transcript is the writer's words and is never translated in place. A reader
in the same language sees it alone; anyone else sees it with a translation under
it — `translation` for English readers, `translation_de` for German readers of an
English note. Line breaks are kept, so set the lines the way the hand set them.

`ref` carries the kind, and the kind decides three things: which table the key is
looked up in, which colour the hotspot gets (`[marks.<kind>]` in `config.toml`),
and which describer builds the card (`DESCRIBE` in `site/assets/js/cover.js`).

The kinds of mark that exist today are `cachet`, `fieldnote`, `flight`, `stamp`,
`postmark`, `collector` and `place`, plus the bare word `signatures`, which needs
no catalogue entry. When the detail view opens it starts on the first of
`[detail] featured` in `config.toml` the cover has: the field note, the flight
list, the cachet, then a stamp.

### Adding a new kind

Say you want `[[marks]] ref = "vessel:polarstern"`. Three edits, nothing else:

1. `data/vessels.toml` — the entries.
2. `build.py` — add `"vessels": "vessel"` to `CATALOGUES`.
3. `config.toml` — add `[marks.vessel]` with a `label`, a `label_de` and a `tint`.
4. `site/assets/js/cover.js` — add a `vessel(entry, mark, cat)` function to
   `DESCRIBE` returning `{ title, facts, body }`. Fact labels come from `t()`,
   so add them to `i18n/ui.toml`; data comes through `L(entry, "field")`, so it
   follows the reader's language on its own.

The hotspots, the leader lines, the layout and the panel all pick it up on their
own, because none of them know anything about specific kinds.

---

## Pictures in the cards

Every card can show a picture of its mark. There are two sources, in this order:

1. **An official picture you supply.** Drop a file into `refs/` and name it in
   the catalogue entry: `image = "stamp-ca-inuit-community.jpg"`. Use this only
   where you have the right to publish the image — a postal administration's
   stamp artwork is its copyright.

2. **A crop of your own scan**, which `build.py` makes automatically from the
   mark's own box. This is your own photograph of your own cover, it is always
   available, and it is the default.

Marks listed in `privacy.never_crop` (the collector's address block) are never
cropped, because a crop would undo the blur.

---

## Privacy

Three rules the build enforces rather than trusts you to remember:

- A letter whose collector has `consent = false` stops the build.
- An `address` field anywhere in a letter stops the build.
- A cover larger than `privacy.max_scan_kb` stops the build — a 12 MB file means
  an unprocessed original got into `covers/` by mistake.

The addresses themselves exist in exactly one place: blurred pixels on the
scans. They are in no TOML file, no JSON file and no git history.

The signatures are a separate judgement call. The field parties signed those
covers for the collector, not for the web, and a signature is a signature.
If in doubt, blur the signature block the same way as the address and keep the
mark as a count rather than a picture.

---

## The look

The globe fills the window. Everything else floats over it on glass, laid out
like a website: a bar with the name, search, menus and language; the letter
panel; and the globe views with the letters-per-year timeline. The lists,
buttons and fields inside are in the manner of iOS.

### Moving the panels, and the glass

Two small sections in `config.toml`, no code:

```toml
[layout]
topbar    = "top"     # top | bottom — at the bottom, the globe views and timeline move to the top
catalogue = "right"   # right | left — the letter panel
width     = 372       # the letter panel's width, in pixels
gap       = 14        # space between the window edge and the panels
radius    = 22        # corner rounding of the panels

[glass]
opacity      = 0.52   # 0 = completely clear, 1 = solid (light mode)
opacity_dark = 0.50   # the same in dark mode
blur         = 26     # how strongly the globe behind is blurred
```

Rebuild and reload. The globe re-centres itself in whatever space is left. On a
phone everything stacks in reading order instead, whatever is set here. The
glass colours themselves (`glass`, `glassedge`, `glassspec`, `shade`) are in
`[colors.light]` and `[colors.dark]`.

Type is the platform's own face — San Francisco on a Mac or iPhone, Segoe on
Windows — so nothing is downloaded. Numbers are tabular so columns of them line
up. The one exception is transcribed handwriting, set in `fonts.hand`, so the
writer's words are never mistaken for ours.

### The catalogue

The letter panel shows one screen at a time, like a list on an iPhone. It opens
on the overview: the letters in view, then stamps, cachets and field notes as
rows you can swipe along, then four tiles (letters, expeditions, stamps,
people). Tap a letter and its page slides in: the cover, three buttons (open it,
play its route, the expedition), the note, More like this, everything on the
cover, the journey and the expedition. Expeditions, stamps, cachets, field
notes, people and flights each have a page too. The back button at the top
names the screen it returns to.

Anything that changes what is in view — typing in the search, a menu in the top
bar, a year in the timeline, following a thread from a letter — returns the
panel to the overview. Each screen is one function in `app.js` (`renderOverview`,
`renderIndex`, `renderLetter`, `renderEntry`, `renderExpedition`, …); the stack
itself is `push`, `back` and `show`, and `refresh()` is what every filter calls.

The search matches expedition, place, stamp, person and collection names in both
languages, and ignores case, accents and umlauts.

`app.js` measures the bars (`measure()`) so a wrapped bar or a longer German
label never ends up over the globe. Between 900 and 1180 px wide the search
moves to a second line of the top bar; under 900 px everything stacks in reading
order: bar, globe, views and timeline, letters.

The icons are small SVG strings in `assets/js/icons.js`, drawn with a 2 px
stroke to sit with the system font.

## Finding your way: More like this, and the scope bar

The site is built around one move: from a cover, to every other cover that
shares something with it. Two things make that move visible.

**More like this**, on every letter's page under its note, lists what the cover
shares with others and how many: "2 more letters from Expedition Yukon Coast
2026", "3 more letters with the Arctic landscape stamp", "1 more letter with Carl
Stadie", "Signed letters: 3 more". Only things that lead somewhere are listed. A
tap shows them on the globe and in the list (the expedition goes to its page).
`moreLikeThis()` in `app.js` builds it; add a row there for a new kind of thread.

**The scope bar** appears at the top of the globe whenever not everything is
shown: "2 of 8 letters", then one chip for each filter, wherever it was set (the
search, a menu, the timeline, a thread followed from a cover), each with a ✕,
and **Show all**. `paintScope()` in `app.js`.

## Links to a letter

Every screen has its own address, so you can send someone straight to a cover:

```
…/polarpost/#/letter/2026-09-30-forest-change-fairbanks      the letter
…/polarpost/#/letter/2026-09-30-forest-change-fairbanks/3    opened on mark 3
…/polarpost/#/expedition/permax-ground-alaska-2026            an expedition's page
…/polarpost/#/stamp/us-1999-gray-wolf-33c                       a stamp's page
                         (likewise #/cachet/…, #/note/…, #/postmark/…, #/person/…, #/flight/…)
…/polarpost/#/stamps   #/cachets   #/notes   #/expeditions   #/people   #/send
```

The name after `/letter/` is the letter's file name in `data/letters/`, so it
never changes unless you rename the file. The address bar follows as people
click around, and the browser's Back button works. The round share button beside
a letter's heading copies its link (on a phone it opens the share sheet). A
shared link carries no language: whoever opens it reads it in their own.

## The galleries, and a page for every entry

The overview starts with the letters. Below them, the stamps, cachets and field
notes of the letters in view are rows you can swipe along; **See all** opens a
gallery with a switch between the three at the top. Stamps are grouped by issuing
country, cachets and field notes by year. Each card is the crop of the mark from
the cover itself (the same `refs/auto/` crop the detail view uses), or the
official picture if you named one in the catalogue.

Every stamp, cachet, field note, postmark, person and flight has a page of its
own: its picture, everything the catalogue knows about it, and every cover it is
on, each with its expedition. "Which stamps went on which expeditions" is the
stamp's page. The globe shows only those covers while the page is open; **Show
only these on the globe** makes that a filter, and **All stamps** (or cachets, …)
goes back to the gallery.

Everything links to these pages: the gallery cards, the People list, the names
on an expedition's page or in a flight crew, the rows under **More like this**,
and the links at the bottom of a tag in the detail view, which also offer **All
stamps**, **All cachets** or **All field notes**. Nothing to maintain: a new
letter's marks appear in the galleries and get their pages on the next build.

## Send us a cover

The **Send letters** button in the top bar opens a page for collectors. All of
its words are in `data/send.toml`, English and German side by side: the intro,
the steps (add, remove or reorder `[[step]]` tables freely), the note on
addresses and names, and the email it starts.

Put your address in `email = "…"` and the page gets a **Write to us** button
that opens a new email with the subject and a short form already filled in
(`subject` and `body` in the same file). With `email` empty there is no button,
and every build reminds you. The steps are a first draft: check them against how
you actually handle covers before publishing.

## Logo

The logo is a clear glass globe with its grid, seen from above the Arctic with
the North Pole facing you, and a clear glass letter travelling round it on a
tilted orbit: in front of the globe on the near side, hidden behind it on the
far side. Glass, and one colour for every line — change `line` in the palette at
the top of the script to recolour the whole logo.

`scripts/make_logo.py` draws it, in four SVG files in `site/assets/`:

| File | Used for |
|---|---|
| `logo-animated.svg`, `logo-animated-dark.svg` | the top bar (the letter orbits once every 16 seconds) |
| `logo.svg`, `logo-dark.svg` | the still version, and the icon in the browser tab |

The colours, the tilt of the pole, the orbit and its speed are a few lines at
the top of the script; change them and run `python3 scripts/make_logo.py`.
Which file the top bar shows is `logo` and `logo_dark` in `[site]` in
`config.toml` — point them at `logo.svg` / `logo-dark.svg` for the still one, or
at any PNG of your own. Leave the path empty and there is no logo.

`brand/` has the still logo as large transparent PNGs (1100 × 780) for slides,
posters or a profile picture.

## Two languages

Everything is in English and German. The reader picks with the EN/DE switch at
the right of the top bar; their choice is remembered, and a link with `?lang=de` opens in
German. With no choice yet, the browser's language decides.

There are exactly two places words live, and both keep the languages side by side
so a missing one is obvious when you look:

**Interface text** is `i18n/ui.toml`, one table per string:

```toml
["stats.letters"]
en = "letters"
de = "Briefe"
```

A table missing a language stops the build, because the page would otherwise
show a raw key.

**Data** uses a `_de` sibling directly beneath the English field:

```toml
about    = "Logistics hub for the western Canadian Arctic …"
about_de = "Logistikzentrum der westkanadischen Arktis …"
```

A missing one is not an error: the site shows the English and the build lists
it under *Still to translate*. Which fields count is `[i18n] fields` in
`config.toml`. Names are only translated where German differs (`name_de =
"Inuvik, Nordwest-Territorien"`); a stamp's inscription, a postmark's text and a
transcription are never translated, because they are quotations.

**Adding a third language** is: add its code to `[i18n] languages` and its locale
to `locales`, add a line to every table in `ui.toml` (the build names each one
you miss), then add `_fr` siblings at your own pace.

## The detail view

In its top-left corner a small globe, the minimap, shows the letter's route while
the big globe is hidden behind the sheet: every letter in view faintly, this one
drawn in with the letter travelling along it. Stepping to the next letter turns
the minimap to the new route; tapping it plays the route again. It is the same
`createGlobe()` as the big globe, with `small: true` (finer lines, always the
whole globe); `minimap()` in `app.js` drives it. Wide screens only — on a phone
the detail view is a full page and the globe is a scroll away.

It opens over the globe and leaves the catalogue beside it usable; pick another
letter there and the detail view follows. It grows out of the thumbnail in the
catalogue and shrinks back into it, like an icon opening on a phone: the cover is
the piece that travels, as a fixed clone on `<body>`, so nothing between the two
places can clip it on the way.

The cover is never covered. Each mark has a tag in a gutter on its own side of
the cover, level with the mark, with a faint leader reaching in. Click a tag, a
mark, or press ← →, and that tag opens outward, away from the cover, while its
leader draws itself in and a ring lights the mark. Nothing else on the cover
changes.

The proportions are three constants at the top of the detail half of `cover.js`:

```js
const GUTTER_MIN = 200, GUTTER_MAX = 268;   // width of a column of tags
const SCALE = 1.3;                          // never blow a scan up more than this
```

Wider gutters give roomier tags and a smaller cover. The cover is ~700 px on the
long edge in the current scans; scan at 1600 px and it can fill much more.

Under 900 px wide the view goes full-screen, the tags fall into mark order under
the cover, and the leaders are dropped. Under `prefers-reduced-motion` nothing
flies or slides.

## Following a thread

The site is for getting from one cover to everything connected to it. Any note
can offer **threads** — the other things that mark belongs to:

| Click | and you get |
|---|---|
| the expedition on a cachet | every letter from that campaign |
| a stamp | every letter bearing it |
| a name under the signatures | every cover that person signed |
| the office on a postmark | every letter posted there |

A describer returns them as `threads: [{ label, kind, key }]`. The note renders
them as chips; clicking one raises `polarpost:follow` on `document`, and
`app.js` turns it into a filter. The matching rules are one table:

```js
const THREADS = {
  expedition: (l, key) => l.expedition === key,
  stamp:      (l, key) => l.marks.some(m => m.kind === "stamp" && m.key === key),
  person:     (l, key) => l.marks.some(m => (m.people || []).includes(key)),
  ...
};
```

Add a row there and a `threads` entry in the describer, and a new kind of thread
is followable everywhere.

## People

A signature is the one thing on an expedition cover that records who was there.
`data/people.toml` gives each person an entry, and a signatures mark names them:

```toml
[[marks]]
ref    = "signatures"
box    = [0.036, 0.603, 0.420, 0.328]
people = ["m-fritz", "s-owl", "a-irrgang"]
```

Two fields matter more than the rest. `show = false` keeps someone off the site
entirely. `reading = "uncertain"` makes the note say the reading is not
confirmed, so a guess is never presented as fact.

**Confirm the names before you publish.** Every reading in `people.toml` except
Carl's came off the handwriting and none has been checked with the teams.
Attributing a signature to the wrong person is worse than leaving it blank.

---

## Known loose ends in the current data

The eight covers are real; the catalogue entries behind them are not all
confirmed. Every entry still carrying `verify = true` prints at the end of each
build, and shows "Details not confirmed yet" on its card.

What needs checking, roughly in order of how wrong it could be:

- **The Canadian stamps.** Denominations and designs were read off the scans.
  Issue years, series names and catalogue numbers are guesses and should be
  checked against Unitrade or Michel.
- **The Finnish Priority stamp**, same.
- **The expedition summaries.** `topic` for COLDSPOT, DUCCEM, ThinICE, Forest
  Change, Alaska Lakes and Yukon Coast was written from the covers' own
  handwriting. The teams will have better one-liners.
- **The signatures.** Every name in `data/people.toml` except Carl's is a
  reading off the handwriting, flagged `reading = "uncertain"`. Ask the teams
  rather than squinting, and ask whether they want to be named at all.
- **The email on the Send page.** `data/send.toml` has none yet, and the steps
  there are a draft.
- **The Alaskan Frontier Station cancel.** The date on the Forest Change cover
  is hard to read; 30 September 2026 is the best reading.

The two United States stamps are solid: both are from the 1999 Arctic Animals
set, Scott 3288–92.

---

## Deploying, if you ever want to

`site/` is plain files with no server-side anything. `npx serve site`, or copy
it onto any static host, or push it to GitHub Pages the way the Journal of
Scientific Shenanigans is set up. Nothing in the project assumes it.

Sources: [Mystic Stamp, 1999 33¢ Arctic Animals, Scott 3288–92](https://www.mysticstamp.com/3288-92-1999-33c-arctic-animals/)
