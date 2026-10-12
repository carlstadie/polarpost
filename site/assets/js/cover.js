/* The cover: marks on the scan, and the detail view that reads them.

   Three things to know before editing:

   1. A mark is `{ kind, key, box, note, note_de, date, people }`, straight out
      of data/letters.json. `kind` picks a describer below; `key` looks the entry
      up in the catalogue. `box` is [x, y, w, h] as fractions of the image.

   2. To support a new kind of mark you add four things and nothing else: a table
      in data/, a line in CATALOGUES in build.py, a [marks.<kind>] block in
      config.toml, and a describer in DESCRIBE below.

   3. All words come from i18n.js: t() for interface text, L() for a data field
      in the reader's language. Nothing in this file is in English on purpose. */

import { t, L, getLang, fmtDate } from "./i18n.js";

const form = (f) => (f ? t(`form.${f}`) : null);

/** A flight's crew as [[role, [[key, name, person], …]], …], roles without
    anyone left out. A hidden person has key null and the name "not shown". */
export function flightCrew(flight, cat) {
  return ["pilots", "science", "mechanics"]
    .map((role) => [role, (flight[role] || []).map((k) => {
      const p = k && cat.persons[k];
      return p ? [k, p.name, p] : [null, t("crew.withheld"), null];
    })])
    .filter(([, people]) => people.length);
}

/** "From" and "To", or one "Round trip from" line when they are the same. */
export function flightAirfields(flight, cat) {
  const name = (k) => L(cat.places[k], "name") || k;
  if (flight.from && flight.from === flight.to) return [[t("fact.round_trip"), name(flight.from)]];
  return [[t("fact.from"), flight.from && name(flight.from)], [t("fact.to"), flight.to && name(flight.to)]];
}

/* Each describer returns the parts of a tag. Drop any field you have nothing
   for — empty values are filtered out before rendering. `threads` are the other
   things this mark belongs to; clicking one shows every letter that shares it. */
const DESCRIBE = {
  cachet(entry, mark, cat) {
    const exp = cat.expeditions[entry.expedition] || {};
    const name = L(exp, "name") || L(entry, "name");
    return {
      title: name,
      facts: [
        [t("fact.form"), form(entry.form)],
        [t("fact.ink"), L(entry, "colour")],
        [t("fact.season"), L(exp, "season")],
        [t("fact.region"), L(exp, "region")],
      ],
      body: L(entry, "shows"),
      more: L(exp, "topic"),
      threads: [
        { label: t("follow.this_cachet"), kind: "cachet", key: mark.key },
        ...(entry.expedition ? [{ label: t("follow.expedition", { name }), kind: "expedition", key: entry.expedition }] : []),
        { label: t("all.cachet"), kind: "gallery", key: "cachet" },
      ],
    };
  },

  /* Handwriting: the words are the content, so they lead, in the hand face,
     with a translation beneath when the reader reads another language. */
  fieldnote(entry, mark, cat) {
    const exp = cat.expeditions[entry.expedition] || {};
    const name = L(exp, "name") || L(entry, "name");
    const foreign = entry.transcript_lang && entry.transcript_lang !== getLang();
    return {
      title: L(entry, "name") || name,
      transcript: entry.transcript,
      translation: foreign ? (getLang() === "en" ? entry.translation : L(entry, "translation")) : null,
      facts: [
        [t("fact.ink"), L(entry, "colour")],
        [t("fact.season"), L(exp, "season")],
        [t("fact.region"), L(exp, "region")],
      ],
      body: entry.transcript ? null : L(entry, "shows"),
      threads: [
        ...(entry.expedition ? [{ label: t("follow.expedition", { name }), kind: "expedition", key: entry.expedition }] : []),
        { label: t("all.fieldnote"), kind: "gallery", key: "fieldnote" },
      ],
    };
  },

  /* The printed flight list. Crew in the order printed; anyone who asked not
     to be shown arrives from the build as null. */
  flight(entry, mark, cat) {
    const crew = flightCrew(entry, cat);
    const known = crew.flatMap(([, people]) => people.filter(([k]) => k));
    return {
      title: [entry.aircraft, fmtDate(entry.date)].filter(Boolean).join(" · "),
      facts: [
        [t("fact.date"), fmtDate(entry.date)],
        [t("fact.aircraft"), entry.aircraft],
        ...flightAirfields(entry, cat),
        ...crew.map(([role, people]) => [t(`crew.${role}`), people.map(([, n]) => n).join(", ")]),
      ],
      body: L(entry, "purpose"),
      unsure: known.some(([, , p]) => p && p.reading === "uncertain") ? t("note.some_readings") : null,
      threads: [{ label: t("follow.flight"), kind: "flight", key: mark.key },
                ...known.map(([k, n]) => ({ label: n, kind: "person", key: k }))],
    };
  },

  stamp(entry, mark) {
    return {
      title: L(entry, "title"),
      facts: [
        [t("fact.issued_by"), L(entry, "country")],
        [t("fact.value"), L(entry, "value")],
        [t("fact.year"), entry.issued],
        [t("fact.series"), L(entry, "series")],
        [t("fact.catalogue"), entry.catalogue],
      ],
      body: L(entry, "commemorates"),
      source: entry.source,
      threads: [{ label: t("follow.stamp"), kind: "stamp", key: mark.key },
                { label: t("all.stamp"), kind: "gallery", key: "stamp" }],
    };
  },

  postmark(entry, mark, cat) {
    const place = cat.places[entry.place] || {};
    return {
      title: entry.office,
      facts: [
        [t("fact.applied"), fmtDate(mark.date)],
        [t("fact.by"), L(entry, "operator")],
        [t("fact.form"), form(entry.form)],
        [t("fact.reads"), entry.reads],
      ],
      body: L(entry, "about"),
      more: L(place, "about"),
      threads: [{ label: t("follow.postmark"), kind: "postmark", key: mark.key },
                ...(entry.place ? [{ label: t("follow.place", { name: L(place, "name") }), kind: "place", key: entry.place }] : [])],
    };
  },

  collector(entry, mark) {
    return {
      title: L(entry, "display"),
      facts: [[t("fact.since"), entry.since]],
      body: L(entry, "about"),
      more: t("note.address"),
      threads: [{ label: t("follow.collector"), kind: "collector", key: mark.key }],
    };
  },

  place(entry, mark) {
    return {
      title: L(entry, "name"),
      facts: [[t("fact.country"), L(entry, "country")]],
      body: L(entry, "about"),
      threads: [{ label: t("follow.place_here"), kind: "place", key: mark.key }],
    };
  },

  person(entry, mark) {
    return {
      title: entry.name,
      facts: [[t("fact.role"), L(entry, "role")]],
      unsure: entry.reading === "uncertain" ? t("note.reading") : null,
      threads: [{ label: t("follow.person"), kind: "person", key: mark.key }],
    };
  },

  /* `signatures` has no catalogue entry of its own: the people come from the
     letter, so a cover can list whoever was in camp that day. */
  signatures(entry, mark, cat) {
    const known = (mark.people || []).map((k) => [k, cat.persons[k]]).filter(([, p]) => p);
    return {
      title: known.length ? known.map(([, p]) => p.name).join(", ") : t("note.signatures_title"),
      facts: [],
      body: t("note.signatures_body"),
      unsure: known.some(([, p]) => p.reading === "uncertain") ? t("note.some_readings") : null,
      threads: known.map(([k, p]) => ({ label: p.name, kind: "person", key: k })),
    };
  },
};

export function describe(mark, cat) {
  const table = cat[mark.kind + "s"] || {};
  const entry = (mark.key && table[mark.key]) || {};
  const build = DESCRIBE[mark.kind];
  const card = build ? build(entry, mark, cat) : { title: mark.kind, facts: [] };
  const kind = cat.marks[mark.kind] || {};

  return {
    eyebrow: L(kind, "label") || mark.kind,
    tint: `var(--${kind.tint || "cachet"})`,
    title: card.title || "—",
    facts: (card.facts || []).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    transcript: card.transcript,
    translation: card.translation,
    body: card.body,
    more: card.more,
    says: L(mark, "note"),                 // what this particular cover adds
    source: card.source,
    unsure: card.unsure || (entry.verify ? t("note.unconfirmed") : null),
    threads: card.threads || [],
    n: mark.n,
  };
}

/* ── marks on a cover ──────────────────────────────────────────────────── */

const pct = (v) => (v * 100).toFixed(3) + "%";

/** Draw one clickable region per mark into `host` (which must be positioned). */
export function renderHotspots(host, letter, cat, onPick) {
  host.textContent = "";
  for (const mark of letter.marks) {
    const card = describe(mark, cat);
    const [x, y, w, h] = mark.box;
    const el = document.createElement("button");
    el.className = "hotspot";
    el.type = "button";
    el.style.cssText = `left:${pct(x)};top:${pct(y)};width:${pct(w)};height:${pct(h)};--spot:${card.tint}`;
    el.setAttribute("aria-pressed", "false");
    el.setAttribute("aria-label", `${card.eyebrow}: ${card.title}`);
    el.dataset.n = mark.n;
    el.innerHTML = `<b>${mark.n}</b>`;
    el.addEventListener("click", (e) => { e.stopPropagation(); onPick(mark.n); });
    host.append(el);
  }
}

/* ── the detail view ───────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Proportions. GUTTER is the width of a column of tags; the cover takes what
   is left, but never more than SCALE times its scan, or it goes soft. */
const GUTTER_MIN = 200, GUTTER_MAX = 268, GAP = 26, PAD = 16, SCALE = 1.3;
const COL_GAP = 7;                         // px between tags in a column

/* iOS presents things on a curve that leaves fast and arrives without
   overshooting; cubic-bezier(.32,.72,0,1) is the usual stand-in on the web. */
const SPRING = "cubic-bezier(.32,.72,0,1)";
const OPEN_MS = 440, CLOSE_MS = 300;
const stillMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => matchMedia("(max-width: 900px)").matches;

const el = {};
let state = { letter: null, cat: null, open: null, source: null, restore: null, opts: {} };

function grab() {
  if (el.root) return;
  const $ = (id) => document.getElementById(id);
  el.root = $("detail");
  el.sheet = el.root.querySelector(".detail-sheet");
  el.bar = el.root.querySelector(".detail-bar");
  el.hint = el.root.querySelector(".detail-hint");
  el.title = $("detailTitle");
  el.meta = $("detailMeta");
  el.stage = $("detailStage");
  el.figure = $("detailCover");
  el.img = $("detailImg");
  el.ring = $("ring");
  el.spots = $("detailHotspots");
  el.left = $("tagsLeft");
  el.right = $("tagsRight");
  el.leaders = $("leaders");
  el.close = $("detailClose");
  el.prev = $("detailPrev");
  el.next = $("detailNext");
}

const allTags = () => [...el.left.children, ...el.right.children];

function tagHTML(card) {
  const facts = card.facts.length
    ? `<dl class="facts">${card.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
    : "";
  const script = card.transcript
    ? `<p class="script">${esc(card.transcript.trim())}</p>`
      + (card.translation ? `<p class="script-tr">${esc(card.translation.trim())}</p>` : "")
    : "";
  const threads = card.threads.length
    ? `<div class="threads">${card.threads.map((th) =>
        `<button class="thread" type="button" data-kind="${esc(th.kind)}" data-key="${esc(th.key)}">${esc(th.label)}</button>`
      ).join("")}</div>` : "";
  return `
    <span class="eyebrow"><i>${card.n}</i>${esc(card.eyebrow)}</span>
    <span class="title">${esc(card.title)}</span>
    <div class="body">
      ${script}
      ${facts}
      ${card.body ? `<p>${esc(card.body)}</p>` : ""}
      ${card.more ? `<p>${esc(card.more)}</p>` : ""}
      ${card.says ? `<p class="says">${esc(t("note.on_cover", { text: card.says }))}</p>` : ""}
      ${card.source ? `<p class="says">${esc(t("note.source", { text: card.source }))}</p>` : ""}
      ${card.unsure ? `<p class="unsure">${esc(card.unsure)}</p>` : ""}
      ${threads}
    </div>`;
}

/** Place a column of tags level with their marks, without overlaps. */
function stack(items, top, bottom) {
  items.sort((a, b) => a.want - b.want);
  let y = top;
  for (const it of items) { it.y = Math.max(y, it.want); y = it.y + it.h + COL_GAP; }
  if (y - COL_GAP > bottom) {                 // ran off the end: pack back up
    let floor = bottom;
    for (let i = items.length - 1; i >= 0; i--) {
      items[i].y = Math.min(items[i].y, floor - items[i].h);
      floor = items[i].y - COL_GAP;
    }
    let ceil = top;
    for (const it of items) { it.y = Math.max(it.y, ceil); ceil = it.y + it.h + COL_GAP; }
  }
}

/** Size the sheet to the cover plus two gutters, then hang the tags. */
function layout() {
  if (!state.letter) return;
  if (narrow()) {
    for (const n of [el.figure, el.left, el.right, el.stage, el.sheet]) n.style.cssText = "";
    for (const n of allTags()) n.style.cssText = n.style.cssText.replace(/top:[^;]+;?|max-height:[^;]+;?/g, "");
    el.leaders.innerHTML = "";
    placeRing();
    return;
  }

  const region = el.root.getBoundingClientRect();
  const chrome = el.bar.offsetHeight + el.hint.offsetHeight;
  const gutter = Math.round(Math.max(GUTTER_MIN, Math.min(GUTTER_MAX, region.width * 0.25)));
  const aspect = el.img.naturalWidth ? el.img.naturalWidth / el.img.naturalHeight : 1.44;

  // The cover gets what the gutters leave, within the window and the scan.
  const roomW = region.width - 2 * (gutter + GAP + PAD);
  const roomH = region.height - chrome - 2 * PAD;
  const coverW = Math.max(220, Math.min(roomW, roomH * aspect, (el.img.naturalWidth || roomW) * SCALE));
  const coverH = coverW / aspect;

  // Tall enough for the tags even when the cover is a short one.
  const stageW = coverW + 2 * (gutter + GAP + PAD);
  const stageH = Math.max(coverH + 2 * PAD, Math.min(region.height - chrome, 580));
  el.stage.style.cssText = `width:${stageW}px;height:${stageH}px`;

  const coverX = PAD + gutter + GAP, coverY = (stageH - coverH) / 2;
  el.figure.style.cssText = `width:${coverW}px;left:${coverX}px;top:${coverY}px`;
  el.left.style.cssText = `left:${PAD}px;width:${gutter}px`;
  el.right.style.cssText = `left:${coverX + coverW + GAP}px;width:${gutter}px`;

  // Each tag wants to sit level with its mark. The open one may take whatever
  // height the others leave, and scrolls inside itself past that.
  const items = { left: [], right: [] };
  for (const node of allTags()) {
    const mark = state.letter.marks[+node.dataset.i];
    const side = node.parentElement === el.left ? "left" : "right";
    node.style.maxHeight = "";
    items[side].push({ node, mark, side });
  }
  for (const side of ["left", "right"]) {
    const col = items[side];
    const open = col.find((it) => it.mark.n === state.open);
    if (open) {
      const others = col.reduce((s, it) => s + (it === open ? 0 : it.node.offsetHeight + COL_GAP), 0);
      open.node.style.maxHeight = Math.max(140, stageH - 2 * PAD - others) + "px";
    }
    for (const it of col) {
      const [, y, , h] = it.mark.box;
      it.h = it.node.offsetHeight;
      it.want = coverY + (y + h / 2) * coverH - it.h / 2;
    }
    stack(col, PAD, stageH - PAD);
    for (const it of col) it.node.style.top = it.y + "px";
  }

  // Leaders: every tag reaches its mark faintly; the open one boldly, drawn in.
  const paths = [];
  for (const side of ["left", "right"]) {
    for (const it of items[side]) {
      const [x, y, w, h] = it.mark.box;
      const tx = coverX + (side === "left" ? x : x + w) * coverW;
      const ty = coverY + (y + h / 2) * coverH;
      const ax = side === "left" ? PAD + gutter : coverX + coverW + GAP;
      const ay = it.y + Math.min(it.h / 2, 22);
      const pull = Math.max(16, Math.abs(tx - ax) * 0.5) * (side === "left" ? 1 : -1);
      const on = it.mark.n === state.open ? ' class="on"' : "";
      paths.push(
        `<path${on} pathLength="1" d="M${ax},${ay} C${ax + pull},${ay} ${tx - pull},${ty} ${tx},${ty}"/>`
        + `<circle${on} cx="${tx}" cy="${ty}" r="${on ? 3 : 2}"/>`);
    }
  }
  el.leaders.innerHTML = paths.join("");
  placeRing();
}

function placeRing() {
  const mark = state.letter && state.letter.marks.find((m) => m.n === state.open);
  el.ring.hidden = !mark;
  if (!mark) return;
  const [x, y, w, h] = mark.box;
  el.ring.style.left = pct(x); el.ring.style.top = pct(y);
  el.ring.style.width = pct(w); el.ring.style.height = pct(h);
}

/** Say what the detail view shows, so app.js can keep the address bar in step:
    { id, open } while it is open (open: the mark number or null), or null. */
function announce() {
  const detail = isDetailOpen() && state.letter ? { id: state.letter.id, open: state.open } : null;
  document.dispatchEvent(new CustomEvent("polarpost:detail", { detail }));
}

function setOpen(n, scroll = true) {
  state.open = state.open === n ? null : n;
  for (const spot of el.spots.querySelectorAll(".hotspot"))
    spot.setAttribute("aria-pressed", String(+spot.dataset.n === state.open));
  for (const node of allTags()) {
    const on = +node.dataset.n === state.open;
    node.setAttribute("aria-pressed", String(on));
    if (on) node.scrollTop = 0;
    if (on && scroll && narrow()) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  layout();
  announce();
}

/** Walk the marks in the order they appear on the cover. */
function step(by) {
  const marks = state.letter.marks;
  const i = marks.findIndex((m) => m.n === state.open);
  const next = marks[((i < 0 ? (by > 0 ? -1 : 0) : i) + by + marks.length) % marks.length];
  if (next) { state.open = null; setOpen(next.n); }
}

/** Which mark to open on arrival: the first kind in config [detail] featured. */
function firstInteresting(letter, cat) {
  const featured = (cat.detail || {}).featured || ["fieldnote", "flight", "cachet", "stamp"];
  for (const kind of featured) {
    const hit = letter.marks.find((m) => m.kind === kind);
    if (hit) return hit.n;
  }
  return letter.marks[0] ? letter.marks[0].n : null;
}

/** Fill the sheet with this letter's cover, tags and words. */
function render() {
  const { letter, cat } = state;
  const exp = cat.expeditions[letter.expedition] || {};
  const posted = cat.places[letter.posted_at] || {};
  el.title.textContent = L(exp, "name") || letter.expedition;
  el.meta.textContent = [L(posted, "name"), fmtDate(letter.posted_on)].filter(Boolean).join(" · ");
  el.img.alt = t("detail.alt", { exp: L(exp, "name") || "", place: L(posted, "name") || "" });

  const featured = (cat.detail || {}).featured || ["cachet", "stamp"];
  el.stage.classList.remove("settled");
  clearTimeout(render.timer);
  render.timer = setTimeout(() => el.stage.classList.add("settled"), 900);
  el.left.textContent = "";
  el.right.textContent = "";
  letter.marks.forEach((mark, i) => {
    const card = describe(mark, cat);
    const left = mark.box[0] + mark.box[2] / 2 < 0.5;
    const node = document.createElement("button");
    node.type = "button";
    node.className = "tag" + (featured.includes(mark.kind) ? "" : " minor");
    node.dataset.i = i;
    node.dataset.n = mark.n;
    node.style.setProperty("--spot", card.tint);
    node.style.setProperty("--i", i);
    node.style.order = mark.n;                                       // reading order on phones
    node.style.setProperty("--grow", left ? "right" : "left");       // opens away from the cover
    node.style.setProperty("--from", left ? "14px" : "-14px");       // arrives from the cover
    node.setAttribute("aria-pressed", String(mark.n === state.open));
    node.innerHTML = tagHTML(card);
    node.addEventListener("click", (e) => { if (!e.target.closest(".thread")) setOpen(mark.n); });
    node.addEventListener("mouseenter", () => hover(mark.n, true));
    node.addEventListener("mouseleave", () => hover(mark.n, false));
    (left ? el.left : el.right).append(node);
  });
  renderHotspots(el.spots, letter, cat, setOpen);
  for (const spot of el.spots.querySelectorAll(".hotspot"))
    spot.setAttribute("aria-pressed", String(+spot.dataset.n === state.open));
}

function hover(n, on) {
  const spot = el.spots.querySelector(`.hotspot[data-n="${n}"]`);
  if (spot) spot.classList.toggle("hover", on);
}

/* ── the opening and closing flight ────────────────────────────────────────
   The detail view grows out of the thumbnail in the catalogue and shrinks back
   into it. The cover is the piece that travels: a fixed clone of it on <body>,
   because nothing between the two places may clip it on the way. */

function onScreen(r) {
  return r && r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight
    && r.right > 0 && r.left < innerWidth;
}

function flight(from, to, src, ms) {
  const clone = document.createElement("img");
  clone.src = src;
  clone.className = "cover-flight";
  clone.alt = "";
  Object.assign(clone.style, { left: from.left + "px", top: from.top + "px",
                               width: from.width + "px", height: from.height + "px" });
  document.body.append(clone);
  const anim = clone.animate([
    { transform: "none" },
    { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) `
               + `scale(${to.width / from.width}, ${to.height / from.height})` },
  ], { duration: ms, easing: SPRING, fill: "forwards" });
  return anim.finished.catch(() => {}).then(() => clone.remove());
}

export function openDetail(letter, cat, opts = {}) {
  grab();
  const reopening = !el.root.hidden;
  state = { letter, cat, open: null, opts,
            source: opts.source || (reopening ? state.source : null),
            restore: reopening ? state.restore : document.activeElement };

  for (const a of [...el.root.getAnimations(), ...el.sheet.getAnimations()]) a.cancel();
  el.img.src = letter.cover;
  render();
  el.root.hidden = false;
  announce();
  el.stage.scrollTop = 0;
  el.prev.disabled = !opts.hasPrev;
  el.next.disabled = !opts.hasNext;

  const from = opts.source ? opts.source.getBoundingClientRect() : null;
  const flying = !reopening && !stillMotion() && onScreen(from);
  if (flying) el.figure.classList.add("in-flight");

  const openFirst = () => {
    if (opts.open === null) return;
    const pick = opts.open ?? firstInteresting(letter, cat);
    if (pick) setOpen(pick, opts.open !== undefined);
  };

  const settle = () => {
    layout();
    if (!flying) { openFirst(); return; }
    el.sheet.animate([{ opacity: 0, transform: "scale(.97)", offset: 0 },
                      { opacity: 0, transform: "scale(.97)", offset: .2 },
                      { opacity: 1, transform: "none", offset: 1 }],
                     { duration: OPEN_MS, easing: SPRING });
    opts.source.style.visibility = "hidden";          // it lifts out, not duplicates
    flight(from, el.figure.getBoundingClientRect(), letter.cover, OPEN_MS).then(() => {
      el.figure.classList.remove("in-flight");
      opts.source.style.visibility = "";
      openFirst();                                    // the tag opens once the cover lands
    });
  };
  if (el.img.complete && el.img.naturalWidth) requestAnimationFrame(settle);
  else el.img.addEventListener("load", () => requestAnimationFrame(settle), { once: true });

  el.close.focus({ preventScroll: true });
}

/** Re-render the open view in place, e.g. after the language changed. */
export function refreshDetail() {
  if (!isDetailOpen() || !state.letter) return;
  render();
  layout();
}

export function closeDetail() {
  if (!el.root || el.root.hidden) return;
  const back = state.source && state.source.isConnected ? state.source.getBoundingClientRect() : null;
  const done = () => {
    el.root.hidden = true;
    for (const a of [...el.root.getAnimations(), ...el.sheet.getAnimations()]) a.cancel();
    el.figure.classList.remove("in-flight");
    if (state.source) state.source.style.visibility = "";
    if (state.restore && state.restore.isConnected) state.restore.focus({ preventScroll: true });
    state.letter = null;
    announce();
  };
  if (stillMotion() || !state.letter || !onScreen(back)) { done(); return; }

  const here = el.figure.getBoundingClientRect();
  el.figure.classList.add("in-flight");
  state.source.style.visibility = "hidden";
  el.sheet.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.97)" }],
                   { duration: CLOSE_MS * .6, easing: "ease-in", fill: "forwards" });
  flight(here, back, state.letter.cover, CLOSE_MS).then(done);
}

export const isDetailOpen = () => !!el.root && !el.root.hidden;

/** Called once from app.js. `nav(-1 | +1)` asks for the previous or next letter;
    `follow(kind, key)` asks to show everything sharing a thread. */
export function wireDetail({ nav, follow }) {
  grab();
  el.close.addEventListener("click", closeDetail);
  el.prev.addEventListener("click", () => nav(-1));
  el.next.addEventListener("click", () => nav(+1));
  el.img.addEventListener("click", () => setOpen(null));
  el.root.addEventListener("click", (e) => {
    const th = e.target.closest(".thread");
    if (th) { e.stopPropagation(); follow(th.dataset.kind, th.dataset.key); }
  });

  addEventListener("keydown", (e) => {
    if (!isDetailOpen()) return;
    if (e.key === "Escape") { e.preventDefault(); closeDetail(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); e.shiftKey ? nav(+1) : step(+1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); e.shiftKey ? nav(-1) : step(-1); }
  });

  addEventListener("resize", () => { if (isDetailOpen()) layout(); });
}
