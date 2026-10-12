/* Languages. Everything the page says goes through here.

   t("stats.letters")        interface text, from i18n/ui.toml
   tn("tip.posted", 3)       the same, picking _one or _many by count
   L(entry, "about")         a data field in the current language: about_de when
                             reading German and it exists, otherwise about

   The current language is chosen from, in order: ?lang= in the address, the
   visitor's last choice, the browser's language, and [i18n] default. */

let UI = { languages: ["en"], default: "en", locales: {}, strings: {} };
let lang = "en";
const KEY = "polarpost.lang";

export async function loadUI() {
  UI = await fetch("data/ui.json").then((r) => r.json());
  lang = pick();
  document.documentElement.lang = lang;
}

function pick() {
  const ok = (l) => l && UI.languages.includes(l);
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (ok(fromUrl)) return fromUrl;
  try { const saved = localStorage.getItem(KEY); if (ok(saved)) return saved; } catch {}
  for (const l of navigator.languages || [navigator.language || ""]) {
    if (ok(l.slice(0, 2))) return l.slice(0, 2);
  }
  return UI.default;
}

export const getLang = () => lang;
export const languages = () => UI.languages;

/** Switch language. Everything listening for polarpost:lang re-renders. */
export function setLang(next) {
  if (next === lang || !UI.languages.includes(next)) return;
  lang = next;
  document.documentElement.lang = next;
  try { localStorage.setItem(KEY, next); } catch {}
  document.dispatchEvent(new CustomEvent("polarpost:lang", { detail: next }));
}

export function t(key, vars = {}) {
  const entry = UI.strings[key];
  let text = entry ? (entry[lang] ?? entry[UI.default]) : key;
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

export const tn = (key, n, vars = {}) => t(`${key}_${n === 1 ? "one" : "many"}`, { n, ...vars });

/** A data field in the current language, falling back to the plain field. */
export function L(entry, field) {
  if (!entry) return undefined;
  return entry[`${field}_${lang}`] ?? entry[field];
}

const locale = () => UI.locales[lang] || lang;

export const fmtDate = (iso) => iso
  ? new Date(iso + "T00:00:00Z").toLocaleDateString(locale(),
      { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  : "";

export const fmtNum = (n, digits = 0) => Number(n).toLocaleString(locale(),
  { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Fill every element marked data-i18n / data-i18n-label in the static HTML. */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-label]"))
    el.setAttribute("aria-label", t(el.dataset.i18nLabel));
  for (const el of root.querySelectorAll("[data-i18n-title]"))
    el.title = t(el.dataset.i18nTitle);
}
