/* Wiring. Loads what build.py wrote, fills the top bar, the catalogue and the
   timeline, and keeps the globe, the catalogue and the detail view in step.
   Nothing here knows how a mark is described (cover.js), how the sphere is
   drawn (globe.js) or what any word is (i18n.js).

   The page is laid out like a website: the top bar narrows what is on the map
   (search, expedition, collection), the bottom bar turns the globe and picks a
   year, and the catalogue on the right shows one screen at a time, kept on a
   stack like an iOS list:

     overview  what is in view: four tiles and the letters
     index     every expedition, stamp or person, with how many letters each
     letter    one cover: the image, actions, its marks, the journey
     place     every letter posted at, or delivered to, one dot on the globe
     gallery   every expedition cachet, newest first
     send      how a collector sends us covers (data/send.toml)

   push() slides a screen in from the right, back() slides the previous one in
   from the left. Changing a filter, or following a thread from a cover, goes
   back to the overview.

   The address bar follows along, so any letter can be linked to:

     #/letter/2026-09-30-forest-change-fairbanks      the letter
     #/letter/2026-09-30-forest-change-fairbanks/3    … opened on mark 3
     #/cachets  #/send  #/stamps  #/expeditions  #/people

   The name after /letter/ is the letter's file name in data/letters/. */

import { createGlobe } from "./globe.js";
import { describe, renderHotspots, openDetail, closeDetail, refreshDetail,
         wireDetail, isDetailOpen, flightCrew, flightAirfields } from "./cover.js";
import { loadUI, t, tn, L, getLang, setLang, languages, fmtDate, fmtNum, applyStatic } from "./i18n.js";
import { icon } from "./icons.js";

await loadUI();
const [letters, cat] = await Promise.all([
  fetch("data/letters.json").then((r) => r.json()),
  fetch("data/catalogue.json").then((r) => r.json()),
]);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const narrow = () => matchMedia("(max-width: 900px)").matches;

const panel = $("panel"), screens = $("screens");
const navbar = $("navbar"), navBack = $("navBack"), navTitle = $("navTitle");

/* ── names, in the current language ────────────────────────────────────── */
const expName = (k) => L(cat.expeditions[k], "name") || k;
const placeName = (k) => L(cat.places[k], "name") || k;
const collectorName = (k) => L(cat.collectors[k], "display") || k;
const homeOf = (k) => placeName((cat.collectors[k] || {}).home);
const stampName = (k) => L(cat.stamps[k], "title") || k;
const personName = (k) => (cat.persons[k] || {}).name || k;
const cachetName = (k) => L(cat.cachets[k], "name") || expName(k);
const noteName = (k) => L(cat.fieldnotes[k], "name") || expName(k);
const flightName = (k) => { const f = cat.flights[k] || {}; return [f.aircraft, fmtDate(f.date)].filter(Boolean).join(" · ") || k; };
const kindOf = (l) => cat.kinds[l.kind] || {};
const kindIcon = (l) => icon[kindOf(l).icon] || "";
const kindLabel = (l) => L(kindOf(l), "label") || l.kind;
const flightOf = (l) => { const m = l.marks.find((x) => x.kind === "flight"); return m && cat.flights[m.key] ? m.key : null; };
/** Everyone named on a letter: signatures, and the crew of the flight it went on. */
const peopleOf = (l) => {
  const out = new Set();
  for (const m of l.marks) for (const p of m.people || []) out.add(p);
  const f = cat.flights[flightOf(l)];
  if (f) for (const role of ["pilots", "science", "mechanics"]) for (const p of f[role] || []) if (p) out.add(p);
  return [...out];
};
const route = (l) => t("letter.route", { from: placeName(l.posted_at), to: homeOf(l.collector) });

/* ── what is in view ───────────────────────────────────────────────────── */
const state = { col: "", kind: "", year: null, thread: null, query: "" };

/* A thread is any one thing several letters share. One row per kind. */
const THREADS = {
  expedition: (l, key) => l.expedition === key,
  collector:  (l, key) => l.collector === key,
  place:      (l, key) => l.posted_at === key
                || l.marks.some((m) => m.kind === "postmark" && (cat.postmarks[m.key] || {}).place === key),
  stamp:      (l, key) => l.marks.some((m) => m.kind === "stamp" && m.key === key),
  person:     (l, key) => peopleOf(l).includes(key),
  flight:     (l, key) => l.marks.some((m) => m.kind === "flight" && m.key === key),
  cachet:     (l, key) => l.marks.some((m) => m.kind === "cachet" && m.key === key),
  fieldnote:  (l, key) => l.marks.some((m) => m.kind === "fieldnote" && m.key === key),
  postmark:   (l, key) => l.marks.some((m) => m.kind === "postmark" && m.key === key),
};
const threadName = ({ kind, key }) => ({
  expedition: expName, collector: collectorName, place: placeName, stamp: stampName, person: personName,
  flight: flightName, cachet: cachetName, fieldnote: noteName,
  postmark: (k) => (cat.postmarks[k] || {}).office || k,
}[kind] || ((k) => k))(key);

/* Search looks through every name and text a letter carries, in every
   language, with accents folded: "kilpisjarvi" finds Kilpisjärvi. */
const fold = (s) => String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const both = (entry, field) => entry ? Object.entries(entry)
  .filter(([k]) => k === field || k.startsWith(field + "_")).map(([, v]) => v) : [];
const haystack = new Map(letters.map((l) => {
  const words = [l.id, l.year, ...both(cat.expeditions[l.expedition], "name"),
    ...both(cat.places[l.posted_at], "name"), ...both(cat.collectors[l.collector], "display"),
    ...both(l, "note")];
  for (const m of l.marks) {
    const e = (cat[m.kind + "s"] || {})[m.key] || {};
    words.push(...both(e, "title"), ...both(e, "name"), ...both(e, "series"), ...both(e, "country"),
               e.office, e.transcript, ...both(m, "note"));
    if (e.place) words.push(...both(cat.places[e.place], "name"));
    if (m.kind === "flight") words.push(e.aircraft, ...both(e, "purpose"),
      ...both(cat.places[e.from], "name"), ...both(cat.places[e.to], "name"));
  }
  for (const p of peopleOf(l)) words.push(personName(p));
  words.push(...both(kindOf(l), "label"));
  return [l.id, fold(words.filter(Boolean).join(" "))];
}));
const matches = (l) => {
  const terms = fold(state.query).split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.get(l.id).includes(term));
};

const visible = () => letters.filter((l) =>
  (!state.col || l.collector === state.col) &&
  (!state.kind || l.kind === state.kind) &&
  (state.year == null || l.year === state.year) &&
  (!state.thread || (THREADS[state.thread.kind] || (() => true))(l, state.thread.key)) &&
  matches(l));
const byId = (id) => letters.find((l) => l.id === id);
const newest = (list) => list.slice().sort((a, b) => (b.posted_on || "").localeCompare(a.posted_on || ""));

/* ── the globe ─────────────────────────────────────────────────────────── */
/* The bars are measured, not assumed, so a longer German label or a wrapped
   top bar never ends up over the globe. */
function measure() {
  const root = document.documentElement.style;
  const vars = ["--top", "--bottom", "--bar-top", "--bar-bottom"];
  if (narrow()) { vars.forEach((v) => root.removeProperty(v)); return; }
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 14;
  // Each bar takes room from the top or the bottom, depending on which half of
  // the window it sits in ([layout] topbar in config.toml decides which).
  const room = (els) => els.map((el) => el.getBoundingClientRect()).reduce(([top, bottom], r) =>
    r.top + r.height / 2 < innerHeight / 2 ? [Math.max(top, r.bottom + gap), bottom]
                                           : [top, Math.max(bottom, innerHeight - r.top + gap)], [gap, gap]);
  const [barTop, barBottom] = room([$("topbar")]);                  // beside the letter panel
  const [top, bottom] = room([$("topbar"), $("bottombar")]);        // above and below the globe
  for (const [v, px] of [["--top", top], ["--bottom", bottom], ["--bar-top", barTop], ["--bar-bottom", barBottom]])
    root.setProperty(v, `${Math.round(px)}px`);
}
function insets() {
  if (narrow()) return { top: 0, left: 0, right: 0, bottom: 0 };
  const css = getComputedStyle(document.documentElement);
  const p = panel.getBoundingClientRect();
  const onLeft = p.left + p.width / 2 < innerWidth / 2;              // [layout] catalogue
  return { top: parseFloat(css.getPropertyValue("--top")) || 0,
           bottom: parseFloat(css.getPropertyValue("--bottom")) || 0,
           left: onLeft ? p.right : 0, right: onLeft ? 0 : innerWidth - p.left };
}
measure();

const same = (l, dot) => (dot.kind === "o" ? l.from : l.to).join() === dot.pt.join();
const globe = await createGlobe({
  canvas: $("globe"), stage: $("stage"), tip: $("tip"), config: cat.globe, insets,
  onPick(hit) {
    if (hit.route) return push({ name: "letter", id: hit.route.id });
    const here = visible().filter((l) => same(l, hit.dot));
    if (here.length === 1) push({ name: "letter", id: here[0].id });
    else push({ name: "place", kind: hit.dot.kind, ids: here.map((l) => l.id) });
  },
  onHover(hit) {
    if (hit.route) {
      const l = byId(hit.route.id);
      return `<b>${esc(route(l))}</b><div class="sub">${esc(expName(l.expedition))}</div>`;
    }
    const here = visible().filter((l) => same(l, hit.dot));
    const name = hit.dot.kind === "o" ? placeName(here[0]?.posted_at) : homeOf(here[0]?.collector);
    return `<b>${esc(name)}</b><div class="sub">${esc(tn(hit.dot.kind === "o" ? "tip.posted" : "tip.received", here.length))}</div>`;
  },
});
const pushRoutes = () => globe.setRoutes(visible().map((l) => ({ id: l.id, from: l.from, to: l.to })));
addEventListener("resize", () => { measure(); globe.resize(); });

/* ── a little navigation for the journey ───────────────────────────────── */
const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
function greatCircle([lon1, lat1], [lon2, lat2]) {
  const φ1 = rad(lat1), φ2 = rad(lat2), Δλ = rad(lon2 - lon1);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2
          + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2));
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return { km: d * 6371.0088, bearing: (deg(Math.atan2(y, x)) + 360) % 360 };
}
const coord = ([lon, lat]) =>
  `${fmtNum(Math.abs(lat), 2)}° ${lat >= 0 ? "N" : "S"}, ${fmtNum(Math.abs(lon), 2)}° ${lon >= 0 ? "E" : "W"}`;
const compass = (b) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(b / 22.5) % 16];

/* ── the navigation stack ──────────────────────────────────────────────── */
let stack = [{ name: "overview" }];
const current = () => stack[stack.length - 1];

function titleOf(view) {
  if (!view) return "";
  if (view.name === "overview") return t("letter.back");
  if (view.name === "index") return t(`index.${view.kind}`);
  if (view.name === "gallery") return t(GALLERY[view.which || "cachet"].title);
  if (view.name === "expedition") return expName(view.key);
  if (view.name === "entry") return threadName(view);
  if (view.name === "send") return L(cat.send, "title");
  if (view.name === "letter") return route(byId(view.id));
  if (view.name === "place") {
    const l = byId(view.ids[0]);
    return view.kind === "o" ? placeName(l.posted_at) : homeOf(l.collector);
  }
  return "";
}

function push(view) { stack.push(view); show("push"); }
function back() { if (stack.length > 1) { stack.pop(); show("pop"); } }
function replaceTop(view, dir) { stack[stack.length - 1] = view; show(dir); }
function home(dir = "pop") { stack = [{ name: "overview" }]; show(dir); }

let observer = null;
function show(dir) {
  const view = current();
  if (view.name !== "letter") { closeDetail(); globe.select(null); }

  const screen = document.createElement("div");
  screen.className = "screen" + (dir ? ` ${dir}` : "");
  screens.replaceChildren(screen);
  ({ overview: renderOverview, index: renderIndex, letter: renderLetter, place: renderPlace,
     gallery: renderGallery, send: renderSend, expedition: renderExpedition,
     entry: renderEntry })[view.name](screen, view);
  // An expedition's or an entry's page shows only its own covers on the globe;
  // everywhere else, what is in view.
  const own = view.name === "expedition" ? letters.filter((l) => l.expedition === view.key)
            : view.name === "entry" ? letters.filter((l) => THREADS[view.kind](l, view.key)) : null;
  if (own) globe.setRoutes(own.map((l) => ({ id: l.id, from: l.from, to: l.to })));
  else pushRoutes();

  const prev = stack[stack.length - 2];
  navbar.hidden = !prev;
  navBack.innerHTML = prev ? `${icon.chevronLeft}<span>${esc(titleOf(prev))}</span>` : "";
  navTitle.textContent = titleOf(view);
  writeUrl(dir === "push");
  // A new screen starts at its top. On a phone the sheet also settles back to
  // its resting height, so the route it is about shows on the globe above.
  if (dir) narrow() ? panel.scrollIntoView({ behavior: "smooth", block: "start" }) : panel.scrollTo({ top: 0 });

  // The large title shrinks into the nav bar once it scrolls under it.
  if (observer) observer.disconnect();
  const big = screen.querySelector(".largetitle, .headline");
  navbar.classList.toggle("collapsed", !big);
  if (big && prev) {
    observer = new IntersectionObserver(([e]) => navbar.classList.toggle("collapsed", !e.isIntersecting),
      { root: narrow() ? null : panel, rootMargin: "-50px 0px 0px 0px", threshold: 0 });
    observer.observe(big);
  }
}
navBack.addEventListener("click", back);

/* ── the address bar ───────────────────────────────────────────────────── */
const KIND_PATH = { expedition: "expeditions", person: "people" };
/* Everything that has a page of its own, and the word for it in the address:
   #/stamp/us-1999-gray-wolf-33c, #/note/coldspot-2026, #/person/carl-stadie … */
const ENTRY_PATH = { stamp: "stamp", cachet: "cachet", fieldnote: "note", postmark: "postmark",
                     person: "person", flight: "flight" };
let detailNow = null;            // what the detail view shows, from cover.js
let applying = false;            // true while the page is being set from the address

function hashFor() {
  const v = current();
  if (v.name === "letter") {
    const l = byId(v.id);
    let h = `#/letter/${encodeURIComponent(l.slug)}`;
    if (detailNow && detailNow.id === v.id) h += detailNow.open ? `/${detailNow.open}` : "/open";
    return h;
  }
  if (v.name === "index") return `#/${KIND_PATH[v.kind]}`;
  if (v.name === "gallery") return `#/${GALLERY[v.which || "cachet"].hash}`;
  if (v.name === "expedition") return `#/expedition/${encodeURIComponent(v.key)}`;
  if (v.name === "entry") return `#/${ENTRY_PATH[v.kind]}/${encodeURIComponent(v.key)}`;
  if (v.name === "send") return "#/send";
  return "";
}
function writeUrl(push) {
  if (applying) return;
  const h = hashFor();
  if (h === location.hash) return;
  history[push ? "pushState" : "replaceState"](null, "", h || location.pathname + location.search);
}
document.addEventListener("polarpost:detail", (e) => { detailNow = e.detail; writeUrl(false); minimap(e.detail); });

/* ── the minimap ───────────────────────────────────────────────────────────
   While the detail view covers the big globe, a small one in its corner shows
   the letter's route: every letter in view faintly, this one drawn in, with the
   letter travelling along it. Made the first time it is needed. */
let mini = null, miniId = null;
async function minimap(detail) {
  if (!detail || narrow()) { miniId = null; return; }
  if (detail.id === miniId) return;             // a different mark, same letter
  miniId = detail.id;
  if (!mini) mini = createGlobe({
    canvas: $("miniGlobe"), stage: $("minimap"), tip: $("miniTip"), config: cat.globe, small: true,
    insets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
    onPick: () => mini.then((g) => g.play({ id: miniId })),     // tap it to play the route again
    onHover: () => "",
  });
  const g = await mini;
  g.resize();
  g.setRoutes(visible().map((l) => ({ id: l.id, from: l.from, to: l.to })));
  if (!g.routes().some((r) => r.id === miniId)) {               // opened from a link, outside the filter
    const l = byId(miniId);
    g.setRoutes([...g.routes(), { id: l.id, from: l.from, to: l.to }]);
  }
  g.play({ id: miniId });
}

/** Set the page from the address: on arrival, and on the browser's back button. */
function applyHash(dir) {
  const [what, key, extra] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const base = [{ name: "overview" }];
  let letter = null;
  if (what === "letter") {
    letter = letters.find((l) => l.slug === key || l.id === key) || null;
    stack = letter ? [...base, { name: "letter", id: letter.id }] : base;
  } else {
    const kind = Object.keys(KIND_PATH).find((k) => KIND_PATH[k] === what);
    const entry = Object.keys(ENTRY_PATH).find((k) => ENTRY_PATH[k] === what);
    const gallery = Object.keys(GALLERY).find((k) => GALLERY[k].hash === what);
    stack = kind ? [...base, { name: "index", kind }]
          : gallery ? [...base, { name: "gallery", which: gallery }]
          : entry && (cat[entry + "s"] || {})[key] ? [...base, { name: "entry", kind: entry, key }]
          : what === "expedition" && cat.expeditions[key] ? [...base, { name: "expedition", key }]
          : what === "send" && cat.send.title ? [...base, { name: "send" }]
          : base;
  }
  applying = true;
  show(dir);
  applying = false;
  if (letter && extra) open(letter, extra === "open" ? undefined : +extra);
  else if (isDetailOpen()) closeDetail();
}
addEventListener("popstate", () => applyHash("pop"));

/** A short message that floats up and fades, e.g. after copying a link. */
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("on"), 1800);
}

async function share(letter) {
  // Without ?lang=, so whoever opens it reads it in their own language.
  const page = new URL(location.href);
  page.searchParams.delete("lang");
  page.hash = `#/letter/${encodeURIComponent(letter.slug)}`;
  const url = page.href;
  if (navigator.share && narrow()) {
    try { await navigator.share({ title: route(letter), url }); } catch { /* cancelled */ }
    return;
  }
  try { await navigator.clipboard.writeText(url); }
  catch {                                   // older browsers, or a page inside a frame
    const box = Object.assign(document.createElement("textarea"), { value: url });
    document.body.append(box); box.select(); document.execCommand("copy"); box.remove();
  }
  toast(t("share.copied"));
}

/* ── overview ──────────────────────────────────────────────────────────── */
function renderOverview(screen) {
  const list = visible();
  const narrowed = state.thread || state.col || state.kind || state.year != null || state.query;
  const stamps = new Set(), people = new Set();
  for (const l of list) {
    for (const m of l.marks) if (m.kind === "stamp") stamps.add(m.key);
    for (const who of peopleOf(l)) if (cat.persons[who]) people.add(who);
  }
  const tile = (kind, n, label, ic, tone) => `
    <button class="tile${kind ? "" : " static"}" ${kind ? `data-index="${kind}"` : "tabindex=\"-1\""} style="--tone:var(--${tone})">
      <span class="ic">${ic}</span><b>${n}</b><small>${esc(label)}</small>
    </button>`;

  screen.innerHTML = `
    <header class="largetitle"><h2>${esc(state.thread ? threadName(state.thread) : t("overview.title"))}</h2></header>
    <p class="subtitle">${esc(state.thread ? tn("overview.shares", list.length)
                             : narrowed ? t("overview.filtered") : t("overview.intro"))}</p>

    <section class="group">
      <h3>${esc(t("overview.in_view"))}</h3>
      <ul class="rows" style="--inset:4.6rem">${newest(list).map(letterRow).join("")
        || `<li class="empty">${esc(state.query ? t("search.none", { q: state.query }) : t("overview.none"))}</li>`}</ul>
    </section>

    ${markStrip("stamp")}
    ${markStrip("cachet")}
    ${markStrip("fieldnote")}

    <div class="tiles">
      ${tile(null, list.length, t("stats.letters"), icon.envelope, "cachet")}
      ${tile("expedition", new Set(list.map((l) => l.expedition)).size, t("stats.expeditions"), icon.flag, "cachetsoft")}
      ${tile("stamp", stamps.size, t("stats.stamps"), icon.stamp, "postmark")}
      ${tile("person", people.size, t("stats.people"), icon.person, "muted")}
    </div>

    ${cat.send.title ? `<section class="group"><ul class="rows" style="--inset:3.4rem"><li>
      <button class="row" id="sendRow"><span class="badge" style="--spot:var(--postmark)">${icon.send}</span>
        <span class="txt"><span class="t wrap">${esc(t("send.teaser"))}</span></span>
        <span class="chev">${icon.chevronRight}</span></button></li></ul></section>` : ""}

    <p class="footnote">${esc(t("overview.privacy"))}</p>`;

  const sendRow = screen.querySelector("#sendRow");
  if (sendRow) sendRow.onclick = () => push({ name: "send" });
  bindMarks(screen);

  screen.querySelectorAll("[data-index]").forEach((b) => b.onclick = () => b.dataset.index === "stamp"
    ? push({ name: "gallery", which: "stamp" }) : push({ name: "index", kind: b.dataset.index }));
  bindLetterRows(screen);
}

const letterRow = (l) => `
  <li><button class="row" data-id="${l.id}">
    <img class="thumb" src="${esc(l.cover)}" alt="" loading="lazy">
    <span class="txt"><span class="t">${esc(route(l))}</span><span class="s"><span class="ki" title="${esc(kindLabel(l))}">${kindIcon(l)}</span>${esc(expName(l.expedition))}</span></span>
    <span class="end">${esc(l.year)}</span><span class="chev">${icon.chevronRight}</span>
  </button></li>`;
const bindLetterRows = (root) => root.querySelectorAll("[data-id]").forEach((b) =>
  b.onclick = () => push({ name: "letter", id: b.dataset.id }));

/* ── the timeline ──────────────────────────────────────────────────────── */
function drawYears() {
  // The span is the years that actually have letters, gaps included: one year
  // draws one bar, which is honest; a fixed window makes a young archive look broken.
  const years = letters.map((l) => l.year);
  const base = letters.filter((l) => (!state.col || l.collector === state.col)
    && (!state.kind || l.kind === state.kind) && matches(l)
    && (!state.thread || THREADS[state.thread.kind](l, state.thread.key)));
  const counts = new Map();
  for (const l of base) counts.set(l.year, (counts.get(l.year) || 0) + 1);
  const max = Math.max(1, ...counts.values());
  let html = "";
  for (let y = Math.min(...years); y <= Math.max(...years); y++) {
    const n = counts.get(y) || 0;
    html += `<button class="bar${n ? "" : " empty"}" data-y="${y}" aria-pressed="${state.year === y}"
      aria-label="${y}: ${n}" ${n ? "" : "disabled"}><i style="height:${n ? Math.max(5, n / max * 28) : 3}px"></i><span>${y}</span></button>`;
  }
  const host = $("years");
  host.innerHTML = html;
  host.querySelectorAll(".bar").forEach((b) => b.onclick = () => {
    const y = +b.dataset.y;
    state.year = state.year === y ? null : y;
    refresh();
  });
  $("clearYear").hidden = state.year == null;
}
$("clearYear").onclick = () => { state.year = null; refresh(); };

/* ── index: every expedition, stamp or person ──────────────────────────── */
function renderIndex(screen, view) {
  const items = new Map();
  const add = (key, letter, extra) => {
    const it = items.get(key) || { key, ids: new Set(), ...extra };
    it.ids.add(letter.id);
    items.set(key, it);
  };
  for (const l of visible()) {
    if (view.kind === "expedition") {
      // The logo if there is one, otherwise the handwriting.
      const pic = l.marks.find((m) => m.kind === "cachet") || l.marks.find((m) => m.kind === "fieldnote");
      const known = items.get(l.expedition);
      add(l.expedition, l, { image: pic && pic.image });
      if (known && !known.image && pic) known.image = pic.image;
    }
    for (const m of l.marks) if (view.kind === "stamp" && m.kind === "stamp") add(m.key, l, { image: m.image });
    if (view.kind === "person") for (const p of peopleOf(l)) if (cat.persons[p]) add(p, l, {});
  }
  const describeItem = (it) => {
    if (view.kind === "expedition") {
      const e = cat.expeditions[it.key] || {};
      return { t: expName(it.key), s: L(e, "season") || "" };
    }
    if (view.kind === "stamp") {
      const s = cat.stamps[it.key] || {};
      return { t: stampName(it.key), s: [L(s, "country"), L(s, "value")].filter(Boolean).join(" · ") };
    }
    const p = cat.persons[it.key] || {};
    return { t: p.name || it.key, s: L(p, "role") || (p.reading === "uncertain" ? t("note.reading") : "") };
  };
  const lead = (it) => {
    if (view.kind === "person") {
      const initials = (personName(it.key).match(/\b\p{L}/gu) || []).slice(0, 2).join("").toUpperCase();
      return `<span class="avatar">${esc(initials)}</span>`;
    }
    return it.image ? `<img class="thumb square" src="${esc(it.image)}" alt="" loading="lazy">` : "";
  };
  const rows = [...items.values()].map((it) => ({ ...it, ...describeItem(it) }))
    .sort((a, b) => b.ids.size - a.ids.size || a.t.localeCompare(b.t));

  screen.innerHTML = `
    <header class="largetitle"><h2>${esc(t(`index.${view.kind}`))}</h2></header>
    <section class="group">
      <ul class="rows" style="--inset:${view.kind === "person" ? "3.6rem" : "4rem"}">
        ${rows.map((r) => `<li><button class="row" data-key="${esc(r.key)}">
            ${lead(r)}
            <span class="txt"><span class="t">${esc(r.t)}</span>${r.s ? `<span class="s">${esc(r.s)}</span>` : ""}</span>
            <span class="end">${esc(tn("index.letters", r.ids.size))}</span><span class="chev">${icon.chevronRight}</span>
          </button></li>`).join("") || `<li class="empty">${esc(t("overview.none"))}</li>`}
      </ul>
    </section>`;
  // An expedition has a page of its own; a stamp or a person is a thread to follow.
  screen.querySelectorAll("[data-key]").forEach((b) => b.onclick = () => goTo(view.kind, b.dataset.key));
}

/* ── cachets and field notes ───────────────────────────────────────────── */
/* Two galleries built the same way: every cachet (the expedition's logo) or
   every field note (what the team wrote by hand), newest first, each with the
   letter that shows it and how many letters carry it. */
const GALLERY = {
  stamp:     { title: "index.stamp", intro: "gallery.stamps_intro", name: stampName, hash: "stamps",
               sub: (k) => [L(cat.stamps[k], "value"), cat.stamps[k]?.issued].filter(Boolean).join(" · "),
               group: (it) => L(cat.stamps[it.key], "country") || "—" },
  cachet:    { title: "gallery.title", intro: "gallery.intro", name: cachetName, hash: "cachets",
               sub: (k) => { const f = (cat.cachets[k] || {}).form; return f ? t(`form.${f}`) : ""; } },
  fieldnote: { title: "gallery.notes", intro: "gallery.notes_intro", name: noteName, hash: "notes",
               sub: (k) => L(cat.fieldnotes[k], "colour") || "" },
};

function marksOf(kind, list = letters) {
  const items = new Map();
  for (const l of newest(list)) for (const m of l.marks) {
    if (m.kind !== kind) continue;
    const it = items.get(m.key) || { kind, key: m.key, year: l.year, image: m.image, letter: l, n: m.n, count: 0 };
    it.count++;
    items.set(m.key, it);
  }
  return [...items.values()];
}

const markCard = (it) => {
  const g = GALLERY[it.kind];
  return `<button class="cachet-card${it.kind === "fieldnote" ? " note" : ""}" data-mark="${it.kind}:${esc(it.key)}">
    <span class="pic"><img src="${esc(it.image)}" alt="" loading="lazy"></span>
    <span class="t">${esc(g.name(it.key))}</span>
    <span class="s">${esc([g.sub(it.key), it.count > 1 ? tn("index.letters", it.count) : ""].filter(Boolean).join(" · "))}</span>
  </button>`;
};

/** A row of cachets or field notes on the overview, as on an iOS home screen:
    swipe along it, or See all. Shows those of the letters in view. */
function markStrip(kind) {
  const items = marksOf(kind, visible());
  if (!items.length) return "";
  return `<section class="group">
    <div class="group-head"><h3>${esc(t(GALLERY[kind].title))}</h3>
      <button class="link" data-gallery="${kind}">${esc(t("action.see_all"))}</button></div>
    <div class="strip">${items.map(markCard).join("")}</div>
  </section>`;
}

function bindMarks(root) {
  root.querySelectorAll("[data-gallery]").forEach((b) => b.onclick = () => push({ name: "gallery", which: b.dataset.gallery }));
  root.querySelectorAll("[data-mark]").forEach((b) => b.onclick = () => {
    const [kind, key] = b.dataset.mark.split(/:(.*)/s);
    push({ name: "entry", kind, key });
  });
}

function renderGallery(screen, view) {
  const which = view.which || "cachet";
  const g = GALLERY[which];
  // Grouped by year, or by whatever the gallery says (stamps: by country).
  const byYear = new Map();
  const groupOf = g.group || ((it) => it.year);
  for (const it of marksOf(which)) byYear.set(groupOf(it), [...(byYear.get(groupOf(it)) || []), it]);
  // All galleries, one segmented control, as in Photos.
  const tabs = Object.keys(GALLERY).filter((k) => marksOf(k).length);
  screen.innerHTML = `
    <header class="largetitle"><h2>${esc(t(g.title))}</h2></header>
    ${tabs.length > 1 ? `<div class="seg seg-wide" role="group">${tabs.map((k) =>
      `<button type="button" data-tab="${k}" aria-pressed="${k === which}">${esc(t(GALLERY[k].title))}</button>`).join("")}</div>` : ""}
    <p class="subtitle">${esc(t(g.intro))}</p>
    ${[...byYear].sort(([a], [b]) => g.group ? String(a).localeCompare(String(b)) : b - a)
      .map(([year, items]) => `<section class="group">
      <h3 class="num">${esc(year)}</h3>
      <div class="gallery">${items.map(markCard).join("")}</div>
    </section>`).join("")}`;
  screen.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => {
    if (b.dataset.tab !== which) replaceTop({ name: "gallery", which: b.dataset.tab }, null);
  });
  bindMarks(screen);
}

/* ── one expedition: its covers as a set ───────────────────────────────── */
function renderExpedition(screen, view) {
  const e = cat.expeditions[view.key] || {};
  const list = letters.filter((l) => l.expedition === view.key);
  const order = Object.keys(cat.kinds);
  const set = list.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)
                                         || (a.posted_on || "").localeCompare(b.posted_on || ""));
  const flights = [...new Set(list.map(flightOf).filter(Boolean))];
  const people = [...new Set(list.flatMap(peopleOf))].filter((k) => cat.persons[k]);
  const initials = (k) => (personName(k).match(/\b\p{L}/gu) || []).slice(0, 2).join("").toUpperCase();
  const kv = (k, v) => v ? `<li><div class="row static"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div></li>` : "";

  screen.innerHTML = `
    <header class="largetitle"><h2>${esc(expName(view.key))}</h2></header>
    <p class="subtitle">${esc([L(e, "season"), L(e, "region")].filter(Boolean).join(" · "))}</p>
    ${L(e, "topic") ? `<div class="group"><div class="card"><p>${esc(L(e, "topic"))}</p></div></div>` : ""}

    <section class="group">
      <h3>${esc(t("exp.covers"))}</h3>
      <div class="set">${set.map((l) => `
        <button class="set-card" data-id="${l.id}">
          <span class="pic"><img src="${esc(l.cover)}" alt="" loading="lazy"></span>
          <span class="kind">${kindIcon(l)}${esc(kindLabel(l))}</span>
          <span class="s">${esc(fmtDate(l.posted_on))}</span>
        </button>`).join("")}</div>
    </section>

    ${flights.length ? `<section class="group">
      <h3>${esc(t("exp.flights"))}</h3>
      <ul class="rows" style="--inset:3.4rem">${flights.map((k) => {
        const f = cat.flights[k];
        const [[, where]] = flightAirfields(f, cat).slice(0, 1);
        return `<li><button class="row" data-flight="${esc(k)}"><span class="badge">${icon.plane}</span>
          <span class="txt"><span class="t">${esc(flightName(k))}</span><span class="s">${esc(where || "")}</span></span>
          <span class="chev">${icon.chevronRight}</span></button></li>`;
      }).join("")}</ul>
    </section>` : ""}

    ${people.length ? `<section class="group">
      <h3>${esc(t("exp.people"))}</h3>
      <div class="people">${people.map((k) => `<button class="person" data-person="${esc(k)}">
        <span class="avatar">${esc(initials(k))}</span><span>${esc(personName(k))}</span></button>`).join("")}</div>
    </section>` : ""}

    <section class="group"><ul class="rows">
      ${kv(t("kv.run_by"), L(e, "operator"))}
      ${kv(t("kv.season"), L(e, "season"))}
      ${kv(t("kv.region"), L(e, "region"))}
    </ul></section>

    <button class="bigbutton soft" id="expShow">${icon.globe}${esc(t("exp.show"))}</button>`;

  bindLetterRows(screen);
  screen.querySelectorAll("[data-flight]").forEach((b) => b.onclick = () => goTo("flight", b.dataset.flight));
  screen.querySelectorAll("[data-person]").forEach((b) => b.onclick = () => goTo("person", b.dataset.person));
  screen.querySelector("#expShow").onclick = () => follow("expedition", view.key);
}

/* ── sending us covers ─────────────────────────────────────────────────── */
function renderSend(screen) {
  const page = cat.send;
  const email = (page.email || "").trim();
  const mail = email && `mailto:${email}?subject=${encodeURIComponent(L(page, "subject") || "")}`
                      + `&body=${encodeURIComponent(L(page, "body") || "")}`;
  screen.innerHTML = `
    <header class="largetitle"><h2>${esc(L(page, "title"))}</h2></header>
    <p class="subtitle">${esc(L(page, "intro"))}</p>
    ${mail ? `<a class="bigbutton" href="${esc(mail)}">${icon.envelope}${esc(t("send.write"))}</a>` : ""}

    <section class="group">
      <h3>${esc(t("send.steps"))}</h3>
      <ol class="rows steps" style="--inset:3.4rem">${(page.step || []).map((st, i) => `<li>
        <div class="row static"><span class="badge">${i + 1}</span>
          <span class="txt"><span class="t wrap">${esc(L(st, "title"))}</span>
          <span class="p">${esc(L(st, "text"))}</span></span></div></li>`).join("")}
      </ol>
    </section>

    ${page.privacy ? `<section class="group">
      <h3>${esc(L(page.privacy, "title"))}</h3>
      <div class="card"><p>${esc(L(page.privacy, "text"))}</p></div>
    </section>` : ""}
    ${email ? `<p class="footnote">${esc(email)}</p>` : ""}`;
}

/** Where you can go from this cover, without opening anything: every thing on
    it that other covers share, with how many. The counts are what you will
    find on arrival, so they respect the collection and kind filters. */
function moreLikeThis(letter) {
  const others = (test) => letters.filter((l) => l !== letter && test(l)
    && (!state.col || l.collector === state.col)).length;
  const items = [];
  const add = (kind, key, ic, text) => items.push({ kind, key, ic, text });
  const n1 = others((l) => l.expedition === letter.expedition);
  if (n1) add("expedition", letter.expedition, icon.flag, tn("more.expedition", n1, { name: expName(letter.expedition) }));
  const flight = flightOf(letter);
  const nf = flight && others((l) => THREADS.flight(l, flight));
  if (nf) add("flight", flight, icon.plane, tn("more.flight", nf));
  for (const key of new Set(letter.marks.filter((m) => m.kind === "stamp").map((m) => m.key))) {
    const n = others((l) => THREADS.stamp(l, key));
    if (n) add("stamp", key, icon.stamp, tn("more.stamp", n, { name: stampName(key) }));
  }
  const np = others((l) => THREADS.place(l, letter.posted_at));
  if (np) add("place", letter.posted_at, icon.envelope, tn("more.place", np, { name: placeName(letter.posted_at) }));
  for (const key of peopleOf(letter).filter((k) => cat.persons[k])) {
    const n = others((l) => THREADS.person(l, key));
    if (n) add("person", key, icon.person, tn("more.person", n, { name: personName(key) }));
  }
  const nk = others((l) => l.kind === letter.kind);
  if (nk && Object.keys(cat.kinds).length > 1)
    add("kind", letter.kind, kindIcon(letter), tn("more.kind", nk, { kind: L(kindOf(letter), "plural") || letter.kind }));
  if (!items.length) return "";
  return `<section class="group">
    <h3>${esc(t("more.title"))}</h3>
    <ul class="rows" style="--inset:3.1rem">${items.map((it) => `<li>
      <button class="row" data-more="${it.kind}:${esc(it.key)}">
        <span class="badge soft">${it.ic}</span>
        <span class="txt"><span class="t wrap">${esc(it.text)}</span></span>
        <span class="chev">${icon.chevronRight}</span></button></li>`).join("")}
    </ul>
  </section>`;
}

/** The flight a flight cover went on: date, aircraft, airfields, crew by role.
    Names link to everything else that person signed or flew. */
function flightSection(letter) {
  const key = flightOf(letter);
  if (!key) return "";
  const f = cat.flights[key];
  const row = (k, v) => v ? `<li><div class="row static"><span class="k">${esc(k)}</span><span class="v">${v}</span></div></li>` : "";
  const names = (people) => people.map(([k, n]) => k
    ? `<a href="#" data-person="${esc(k)}">${esc(n)}</a>` : `<i>${esc(n)}</i>`).join(", ");
  return `<section class="group">
    <h3>${esc(t("letter.flight"))}</h3>
    <ul class="rows">
      ${row(t("fact.date"), esc(fmtDate(f.date)))}
      ${row(t("fact.aircraft"), `<a href="#" id="flightLink" data-flight="${esc(key)}">${esc(f.aircraft || "")}</a>`)}
      ${flightAirfields(f, cat).map(([k, v]) => row(k, esc(v || ""))).join("")}
      ${flightCrew(f, cat).map(([role, people]) => row(t(`crew.${role}`), names(people))).join("")}
    </ul>
    ${L(f, "purpose") ? `<div class="card" style="margin-top:.6rem"><p>${esc(L(f, "purpose"))}</p></div>` : ""}
  </section>`;
}

/* ── one letter ────────────────────────────────────────────────────────── */
function renderLetter(screen, view) {
  const letter = byId(view.id);
  const list = visible();
  const i = list.indexOf(letter);
  const exp = cat.expeditions[letter.expedition] || {};
  const leg = greatCircle(letter.from, letter.to);
  const kv = (k, v, small) => v ? `<li><div class="row static"><span class="k">${esc(k)}</span>
      <span class="v">${v}${small ? `<small>${esc(small)}</small>` : ""}</span></div></li>` : "";

  screen.innerHTML = `
    <figure class="hero" id="panelCover">
      <img src="${esc(letter.cover)}" alt="${esc(t("detail.alt", { exp: expName(letter.expedition), place: placeName(letter.posted_at) }))}">
      <div class="hotspots" id="panelSpots"></div>
    </figure>

    <header class="headline">
      <div><span class="kindchip">${kindIcon(letter)}${esc(kindLabel(letter))}</span>
      <h2>${esc(route(letter))}</h2>
      <p>${esc(expName(letter.expedition))} · ${esc(fmtDate(letter.posted_on))}</p></div>
      <button class="iconbtn" id="actShare" aria-label="${esc(t("action.share"))}" title="${esc(t("action.share"))}">${icon.share}</button>
    </header>

    <div class="actions">
      <button class="action primary" id="actOpen">${icon.open}${esc(t("action.open"))}</button>
      <button class="action" id="actRoute">${icon.route}${esc(t("action.route"))}</button>
      <button class="action" id="actExp">${icon.flag}${esc(t("action.expedition"))}</button>
    </div>

    ${L(letter, "note") ? `<div class="group"><div class="card"><p>${esc(L(letter, "note"))}</p></div></div>` : ""}

    ${moreLikeThis(letter)}

    <section class="group">
      <h3>${esc(t("letter.on_cover"))}</h3>
      <ul class="rows" style="--inset:3.1rem">${letter.marks.map((m) => {
        const c = describe(m, cat);
        return `<li><button class="row" data-n="${m.n}">
          <span class="badge" style="--spot:${c.tint}">${m.n}</span>
          <span class="txt"><span class="t">${esc(c.title)}</span><span class="s">${esc(c.eyebrow)}</span></span>
          <span class="chev">${icon.chevronRight}</span></button></li>`;
      }).join("")}</ul>
    </section>

    ${flightSection(letter)}

    <section class="group">
      <h3>${esc(t("letter.journey"))}</h3>
      <ul class="rows">
        ${kv(t("journey.posted"), esc(placeName(letter.posted_at)), coord(letter.from))}
        ${kv(t("journey.delivered"), esc(homeOf(letter.collector)), coord(letter.to))}
        ${kv(t("journey.distance"), esc(t("journey.km", { km: fmtNum(Math.round(leg.km / 10) * 10) })))}
        ${kv(t("journey.heading"), `${esc(fmtNum(leg.bearing))}° ${esc(compass(leg.bearing))}`)}
      </ul>
    </section>

    <section class="group">
      <h3>${esc(t("letter.expedition"))}</h3>
      <ul class="rows">
        ${kv(t("kv.name"), `<a href="#" id="expLink">${esc(expName(letter.expedition))}</a>`)}
        ${kv(t("kv.run_by"), esc(L(exp, "operator")))}
        ${kv(t("kv.season"), esc(L(exp, "season")))}
        ${kv(t("kv.region"), esc(L(exp, "region")))}
        ${kv(t("kv.collection"), `<a href="#" id="colLink">${esc(collectorName(letter.collector))}</a>`)}
        ${kv(t("kv.record"), esc(letter.id))}
      </ul>
      ${L(exp, "topic") ? `<div class="card" style="margin-top:.6rem"><p>${esc(L(exp, "topic"))}</p></div>` : ""}
    </section>

    <div class="pager">
      <button id="prev" ${i <= 0 ? "disabled" : ""}>${icon.chevronLeft}${esc(t("nav.prev"))}</button>
      <button id="next" ${i < 0 || i >= list.length - 1 ? "disabled" : ""}>${esc(t("nav.next"))}${icon.chevronRight}</button>
    </div>`;

  const $s = (sel) => screen.querySelector(sel);
  $s("#actOpen").onclick = () => open(letter);
  $s("#actShare").onclick = () => share(letter);
  // Route plays the journey. On a phone the globe is above the catalogue, so
  // bring it into view first.
  $s("#actRoute").onclick = () => {
    if (narrow() && $("stage").getBoundingClientRect().top < 0) {
      $("stage").scrollIntoView({ behavior: "smooth" });
      setTimeout(() => globe.play({ id: letter.id }), 450);
    } else globe.play({ id: letter.id });
  };
  $s("#actExp").onclick = () => push({ name: "expedition", key: letter.expedition });
  $s("#expLink").onclick = (e) => { e.preventDefault(); push({ name: "expedition", key: letter.expedition }); };
  screen.querySelectorAll("[data-person]").forEach((b) => b.onclick = (e) => { e.preventDefault(); goTo("person", b.dataset.person); });
  screen.querySelectorAll("[data-more]").forEach((b) => b.onclick = () => {
    const [kind, key] = b.dataset.more.split(/:(.*)/s);
    if (kind === "kind") { Object.assign(state, { thread: null, kind: key, year: null, query: "" }); closeDetail(); refresh(); }
    else goTo(kind, key);
  });
  const fl = $s("#flightLink");
  if (fl) fl.onclick = (e) => { e.preventDefault(); goTo("flight", fl.dataset.flight); };
  $s("#colLink").onclick = (e) => { e.preventDefault(); follow("collector", letter.collector); };
  $s("#prev").onclick = () => replaceTop({ name: "letter", id: list[i - 1].id }, "pop");
  $s("#next").onclick = () => replaceTop({ name: "letter", id: list[i + 1].id }, "push");
  screen.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => open(letter, +b.dataset.n));
  $s("#panelCover").addEventListener("click", () => open(letter));
  renderHotspots($s("#panelSpots"), letter, cat, (n) => open(letter, n));

  globe.select({ id: letter.id });
  if (isDetailOpen()) open(letter);              // the big view follows the catalogue
}

/* ── one place on the globe ────────────────────────────────────────────── */
function renderPlace(screen, view) {
  const list = view.ids.map(byId);
  screen.innerHTML = `
    <header class="largetitle"><h2>${esc(titleOf(view))}</h2></header>
    <p class="subtitle">${esc(tn(view.kind === "o" ? "place.posted" : "place.received", list.length))}</p>
    <section class="group"><ul class="rows" style="--inset:4.6rem">${newest(list).map(letterRow).join("")}</ul></section>`;
  bindLetterRows(screen);
}

/* ── the detail view ───────────────────────────────────────────────────── */
function open(letter, markNumber) {
  const list = visible();
  const i = list.indexOf(letter);
  openDetail(letter, cat, {
    hasPrev: i > 0, hasNext: i >= 0 && i < list.length - 1,
    open: markNumber,
    source: $("panelCover"),       // the image it grows out of; read fresh every time
  });
}

/** Go to the page of anything: an expedition, a stamp, a person, a gallery.
    Things without a page of their own (a place, a collection) become a filter. */
function goTo(kind, key) {
  if (isDetailOpen()) closeDetail();
  if (kind === "gallery") return push({ name: "gallery", which: key });
  if (kind === "expedition") return push({ name: "expedition", key });
  if (ENTRY_PATH[kind] && (cat[kind + "s"] || {})[key]) return push({ name: "entry", kind, key });
  follow(kind, key);
}

/* ── one entry: a stamp, a cachet, a field note, a postmark, a person, a flight ──
   Its picture, everything known about it, and every cover it is on, with the
   expedition each came from — so "which stamps went on which expeditions" is
   one tap from any stamp. */
function renderEntry(screen, view) {
  const { kind, key } = view;
  const list = newest(letters.filter((l) => THREADS[kind](l, key)));
  const mark = list.flatMap((l) => l.marks).find((m) => m.kind === kind && m.key === key)
            || { kind, key, n: null };
  const card = describe({ ...mark, note: null, note_de: null }, cat);
  const exps = new Set(list.map((l) => l.expedition));
  const initials = (personName(key).match(/\b\p{L}/gu) || []).slice(0, 2).join("").toUpperCase();
  const picture = kind === "person" ? `<div class="entry-pic person"><span class="avatar big">${esc(initials)}</span></div>`
                : kind === "flight" ? `<div class="entry-pic person"><span class="avatar big">${icon.plane}</span></div>`
                : mark.image ? `<div class="entry-pic"><img src="${esc(mark.image)}" alt=""></div>` : "";
  const facts = card.facts.map(([k, v]) => `<li><div class="row static"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div></li>`).join("");
  const gallery = GALLERY[kind];

  screen.innerHTML = `
    ${picture}
    <header class="headline">
      <div><span class="kindchip">${esc(card.eyebrow)}</span><h2>${esc(card.title)}</h2>
      <p>${esc(tn("index.letters", list.length))}${exps.size ? " · " + esc(tn("entry.expeditions", exps.size)) : ""}</p></div>
    </header>

    ${card.transcript ? `<div class="group"><div class="card script-card">
      <p class="script">${esc(card.transcript.trim())}</p>
      ${card.translation ? `<p class="script-tr">${esc(card.translation.trim())}</p>` : ""}</div></div>` : ""}
    ${facts ? `<section class="group"><ul class="rows">${facts}</ul></section>` : ""}
    ${card.body || card.more ? `<div class="group"><div class="card">
      ${card.body ? `<p>${esc(card.body)}</p>` : ""}${card.more ? `<p>${esc(card.more)}</p>` : ""}</div></div>` : ""}
    ${card.source ? `<p class="footnote">${esc(t("note.source", { text: card.source }))}</p>` : ""}
    ${card.unsure ? `<p class="footnote unsure">${esc(card.unsure)}</p>` : ""}

    <section class="group">
      <h3>${esc(t("entry.on_covers"))}</h3>
      <ul class="rows" style="--inset:4.6rem">${list.map(letterRow).join("")}</ul>
    </section>

    <button class="bigbutton soft" id="entryShow">${icon.globe}${esc(t("exp.show"))}</button>
    ${gallery ? `<button class="bigbutton soft" id="entryAll">${esc(t(`all.${kind}`))}</button>` : ""}`;

  bindLetterRows(screen);
  screen.querySelector("#entryShow").onclick = () => follow(kind, key);
  const all = screen.querySelector("#entryAll");
  if (all) all.onclick = () => push({ name: "gallery", which: kind });
}

function follow(kind, key) {
  state.thread = { kind, key };
  state.year = null;
  state.query = "";
  closeDetail();
  refresh();
}

/* Anything that changes what is in view: redraw the routes, the timeline and
   the filters, and go back to the overview, which lists what is left. */
function refresh() {
  pushRoutes();
  drawYears();
  paintFilters();
  paintScope();
  if (stack.length === 1) show(null); else home("pop");
}

/* ── the scope bar: what the globe and the lists are showing ────────────── */
/* Every filter, wherever it was set (search, a menu, the timeline, a thread
   followed from a cover), appears here as one chip you can remove, with the
   count it leaves and a Show all. Hidden when nothing is filtered. */
function paintScope() {
  const chips = [];
  if (state.thread) chips.push(["thread", t(`thread.${state.thread.kind}`, { name: threadName(state.thread) })]);
  if (state.kind) chips.push(["kind", L(cat.kinds[state.kind], "plural") || state.kind]);
  if (state.col) chips.push(["col", collectorName(state.col)]);
  if (state.year != null) chips.push(["year", String(state.year)]);
  if (state.query) chips.push(["query", `“${state.query}”`]);
  const host = $("scope");
  host.hidden = !chips.length;
  if (!chips.length) return;
  host.firstElementChild.innerHTML = `
    <span class="count num">${esc(t("scope.showing", { n: visible().length, total: letters.length }))}</span>
    ${chips.map(([k, label]) => `<button class="chip" data-clear="${k}" aria-label="${esc(t("scope.remove", { name: label }))}">
      <span>${esc(label)}</span>${icon.xmark}</button>`).join("")}
    ${chips.length > 1 ? `<button class="link" data-clear="all">${esc(t("scope.clear"))}</button>` : ""}`;
  host.querySelectorAll("[data-clear]").forEach((b) => b.onclick = () => {
    const k = b.dataset.clear;
    if (k === "thread" || k === "all") state.thread = null;
    if (k === "kind" || k === "all") state.kind = "";
    if (k === "col" || k === "all") state.col = "";
    if (k === "year" || k === "all") state.year = null;
    if (k === "query" || k === "all") state.query = "";
    refresh();
  });
}

/* ── the top bar: search and the two filters ───────────────────────────── */
const q = $("q"), qClear = $("qClear"), fExp = $("fExp"), fCol = $("fCol"), fKind = $("fKind");
// The top-bar link is a page of its own: Back from it always leads to the overview.
$("sendLink").onclick = () => {
  if (current().name === "send") return;
  stack = [{ name: "overview" }];
  push({ name: "send" });
};
q.addEventListener("input", () => { state.query = q.value; qClear.hidden = !q.value; refresh(); });
qClear.addEventListener("click", () => { q.value = ""; q.dispatchEvent(new Event("input")); q.focus(); });
// The expedition menu is a thread like any other, so a cover's "Expedition"
// button and this menu always agree.
fExp.onchange = () => { state.thread = fExp.value ? { kind: "expedition", key: fExp.value } : null; refresh(); };
fCol.onchange = () => { state.col = fCol.value; refresh(); };
fKind.onchange = () => { state.kind = fKind.value; refresh(); };

function paintFilters() {
  if (q.value !== state.query) { q.value = state.query; qClear.hidden = !state.query; }
  const exps = [...new Set(letters.map((l) => l.expedition))].sort((a, b) => expName(a).localeCompare(expName(b)));
  const cols = [...new Set(letters.map((l) => l.collector))];
  const opt = (k, name, on) => `<option value="${esc(k)}" ${on ? "selected" : ""}>${esc(name)}</option>`;
  const exp = state.thread && state.thread.kind === "expedition" ? state.thread.key : "";
  fExp.innerHTML = opt("", t("filters.all_expeditions"), !exp) + exps.map((k) => opt(k, expName(k), k === exp)).join("");
  fCol.innerHTML = opt("", t("filters.all_collections"), !state.col) + cols.map((k) => opt(k, collectorName(k), k === state.col)).join("");
  $("fColWrap").hidden = cols.length < 2;           // one collection: nothing to choose
  // Kinds in config order, only those some letter actually is.
  const kinds = Object.keys(cat.kinds).filter((k) => letters.some((l) => l.kind === k));
  fKind.innerHTML = opt("", t("filters.all_kinds"), !state.kind)
    + kinds.map((k) => opt(k, L(cat.kinds[k], "plural") || k, k === state.kind)).join("");
  $("fKindWrap").hidden = kinds.length < 2;
  fKind.parentElement.classList.toggle("on", !!state.kind);
  fExp.parentElement.classList.toggle("on", !!exp);
  fCol.parentElement.classList.toggle("on", !!state.col);
}

wireDetail({
  nav: (step) => {
    const list = visible();
    const at = list.findIndex((l) => l.id === current().id);
    const next = list[at + step];
    if (next) replaceTop({ name: "letter", id: next.id }, step > 0 ? "push" : "pop");
  },
  follow: goTo,
});

/* ── controls over the globe ───────────────────────────────────────────── */
const VIEWS = { arctic: [-120, 72], alaska: [-155, 64], canada: [-134, 68], europe: [10, 50] };
const viewButtons = document.querySelectorAll("[data-view]");
viewButtons.forEach((b) => b.addEventListener("click", () => {
  viewButtons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  globe.flyTo(VIEWS[b.dataset.view], 900);
}));
// Turning the globe by hand means no preset view is current any more.
$("globe").addEventListener("pointerdown", () => viewButtons.forEach((x) => x.setAttribute("aria-pressed", "false")));

const spinBtn = $("spin");
const paintSpin = () => { spinBtn.innerHTML = globe.isSpinning() ? icon.pause : icon.play; };
spinBtn.addEventListener("click", () => {
  spinBtn.setAttribute("aria-pressed", String(globe.spin(!globe.isSpinning())));
  paintSpin();
});

/* ── language ──────────────────────────────────────────────────────────── */
function paintChrome() {
  document.title = cat.site.title;
  $("siteTitle").textContent = cat.site.title;
  $("brand").title = L(cat.site, "tagline") || "";
  // The logo appears only if build.py found the file; a broken one hides itself.
  const logo = $("logo");
  const src = (matchMedia("(prefers-color-scheme: dark)").matches && cat.site.logo_dark) || cat.site.logo;
  logo.hidden = !src;
  if (src) { logo.src = src; logo.onerror = () => { logo.hidden = true; }; }
  q.placeholder = t("search.placeholder");
  $("sendLink").hidden = !cat.send.title;
  $("sendLink").innerHTML = `${icon.send}<span>${esc(t("send.link"))}</span>`;
  document.querySelector(".search-ic").innerHTML = icon.search;
  qClear.innerHTML = icon.xmark;
  document.querySelectorAll(".menu .chev").forEach((c) => c.innerHTML = icon.chevronDown);
  paintFilters();
  const seg = $("langSeg");
  seg.innerHTML = languages().map((l) =>
    `<button type="button" data-lang="${l}" aria-pressed="${l === getLang()}">${l.toUpperCase()}</button>`).join("");
  seg.querySelectorAll("button").forEach((b) => b.onclick = () => setLang(b.dataset.lang));
  $("detailPrev").innerHTML = icon.chevronLeft;
  $("detailNext").innerHTML = icon.chevronRight;
  $("detailClose").innerHTML = icon.xmark;
  paintSpin();
  applyStatic();
}
document.addEventListener("polarpost:lang", () => {
  paintChrome(); drawYears(); paintScope(); measure(); globe.resize(); show(null); refreshDetail();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintChrome);

/* ── go ────────────────────────────────────────────────────────────────── */
paintChrome();
pushRoutes();
drawYears();
measure();
applyHash(null);                 // the overview, or whatever the link points at
paintScope();
globe.resize();
if (current().name !== "letter") globe.flyTo(cat.globe.initial_rotate, 1600);
