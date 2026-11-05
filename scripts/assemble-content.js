#!/usr/bin/env node
/**
 * scripts/assemble-content.js  —  DEV-31
 *
 * The one script that reads the English source. It finds every string that is
 * translated, reads the two data files, hashes everything ONCE with
 * scripts/i18n-hash.js, and writes the result to i18n/content.en.json.
 * Every other script in the pipeline reads content.en.json, never the source.
 *
 *   node scripts/assemble-content.js           # write i18n/content.en.json (silent)
 *   node scripts/assemble-content.js --check   # is content.en.json current? writes nothing
 *
 * content.en.json is the approval unit (CP-4): "this exact content, identified
 * by contentHash, is approved". It has three parts:
 *
 *   text         every translatable string, with its translation key
 *   values       products.js and sources.js, parsed, each with its own
 *                sha256. Never sent to a translation engine.
 *   contentHash  one digest over text + values
 *
 * Four buckets of text, because they are found and substituted differently:
 *
 *   data    the strings the page renders out of data/*.js, at an explicit
 *           allow-list of field paths.
 *   markup  visible text nodes and rendering attributes in the static HTML
 *           above the <script src="data/..."> block.
 *   js      string literals inside the page's own JavaScript that reach the
 *           screen. Found by pattern; over-collection is harmless because the
 *           builder only substitutes strings that have a translation.
 *   reviewed  exact snippets listed in i18n/reviewed-strings.json, for what the
 *           js patterns cannot find safely, and for the shared widgets
 *           (assets/report-issue.js, assets/site-nav.js) the page loads.
 *   ui      the interface text of the React version, i18n/ui.en.json (since
 *           28 Oct 2026): translated like the rest, never substituted into
 *           the page. scripts/build-rbm-messages.js makes RBM's message files
 *           from it. Most of it is also on the page, under the same key.
 *
 * --check re-hashes the source and fails (exit 1) if content.en.json is stale,
 * was edited by hand, or if any key in i18n/translations.json no longer matches
 * scripts/i18n-hash.js. translate-strings.js and build-locale-pages.js run the
 * same check before they do anything.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const { key, digest } = require("./i18n-hash");

const ROOT = path.resolve(__dirname, "..");
const PAGE = "index.html";
const GLOBALS = {
  "data/products.js": "window.LAUNCH_DATA",
  "data/sources.js": "window.LAUNCH_SOURCES",
};

function readDataFile(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const m = GLOBALS[rel];
  const at = src.indexOf(m + " =");
  if (at === -1) throw new Error(`${rel}: marker "${m} =" not found`);
  return JSON.parse(src.slice(at + m.length + 2).trim().replace(/;\s*$/, ""));
}

// Walks the page and the data files. Returns { data, markup, js }, each a list
// of { text, where, quote? }. Reads only; the rules below are unchanged from the
// original extract-strings.js.
function collect() {
  const out = { data: [], markup: [], js: [], reviewed: [], ui: [] };
  const seen = new Set();
  const add = (bucket, text, where, quote) => {
    const t = String(text == null ? "" : text).trim();
    if (!t || !/[A-Za-z]{2}/.test(t)) return;
    const k = bucket + "\u0000" + t;
    if (seen.has(k)) return;
    seen.add(k);
    out[bucket].push(quote ? { text: t, where, quote } : { text: t, where });
  };

  // ---------------------------------------------------------------------------
  // 1. data — only what the page actually renders
  // ---------------------------------------------------------------------------

  // products.js: the allow-listed content fields (deny-list stays English —
  // provenance must match the source it cites)
  const P = readDataFile("data/products.js");
  (P.stages || []).forEach((s, i) => add("data", s, `products.stages[${i}]`));
  // the step explainers (one per stage). Their `source` is a label for the kind
  // of source ("National medicines registers"), not a citation, so it is
  // translated too (owner's decision, 2 Oct 2026); citations are the products'
  // own `source` fields below, which stay English.
  (P.stageInfo || []).forEach((x, i) => {
    ["what", "who", "stall", "source"].forEach((k) => add("data", x[k], `products.stageInfo[${i}].${k}`));
  });
  Object.entries(P.glossary || {}).forEach(([k, v]) => add("data", v, `products.glossary.${k}`));
  (P.changelog || []).forEach((c, i) => {
    add("data", c.plain, `products.changelog[${i}].plain`);
    add("data", c.summary, `products.changelog[${i}].summary`);
  });
  (P.products || []).forEach((p, i) => {
    const b = `products.products[${i}]`;
    add("data", p.note, `${b}.note`);
    add("data", p.next, `${b}.next`);
    add("data", p.flag, `${b}.flag`);
    add("data", p.classLabel, `${b}.classLabel`);
    add("data", p.barrier, `${b}.barrier`);
    // a partner's acknowledgement, shown in its own card (20 Oct 2026)
    add("data", p.acknowledgement, `${b}.acknowledgement`);
    const d = p.detail || {};
    add("data", d.volumeNote, `${b}.detail.volumeNote`);
    // the presentations bought, listed while the figures are parked (5 Nov 2026)
    ((d.procurement || {}).presentations || []).forEach((x, j) => add("data", x, `${b}.detail.procurement.presentations[${j}]`));
    add("data", d.useCase, `${b}.detail.useCase`);
    (d.access || []).forEach((x, j) => add("data", x, `${b}.detail.access[${j}]`));
    (d.adoption || []).forEach((x, j) => add("data", x, `${b}.detail.adoption[${j}]`));
    if (d.research) {
      ["question", "lead", "geographies", "timeline"].forEach((k) => add("data", d.research[k], `${b}.detail.research.${k}`));
    }
    // procurement: the total and period are prose ("68 transactions · US$14.5m
    // (2018–2025)"); `source` is the citation and stays English
    if (d.volume) {
      add("data", d.volume.total, `${b}.detail.volume.total`);
      add("data", d.volume.period, `${b}.detail.volume.period`);
      (d.volume.split || []).forEach((s, j) => add("data", s.channel, `${b}.detail.volume.split[${j}].channel`));
      // packs by presentation (15 Oct 2026): each label, and how courses were counted
      (d.volume.byPresentation || []).forEach((r, j) => add("data", r.label, `${b}.detail.volume.byPresentation[${j}].label`));
      add("data", d.volume.coursesRule, `${b}.detail.volume.coursesRule`);
    }
    // price notes are excluded unless confirmed in writing — the guard, kept here
    if (d.price && d.price.confirmedInWriting === true) add("data", d.price.note, `${b}.detail.price.note`);
    (d.milestones || []).forEach((m, j) => {
      add("data", m.milestone, `${b}.detail.milestones[${j}].milestone`);
      add("data", m.label, `${b}.detail.milestones[${j}].label`);
      add("data", m.next, `${b}.detail.milestones[${j}].next`);
      add("data", m.date, `${b}.detail.milestones[${j}].date`);
      add("data", m.anticipated, `${b}.detail.milestones[${j}].anticipated`);
    });
    // Stage dates are prose for a reader ("2012 (label update 2025)", "Rolling").
    // The page reads the first four-digit year out of `date`, which a
    // translation keeps. "TBC" stays as it is: the page drops an expected date
    // that reads exactly TBC (peekLine), and a translated one would show.
    const notTbc = (v) => (/^tbc$/i.test(String(v || "").trim()) ? undefined : v);
    (p.stages || []).forEach((st, j) => {
      add("data", st.note, `${b}.stages[${j}].note`);
      add("data", st.next, `${b}.stages[${j}].next`);
      add("data", notTbc(st.date), `${b}.stages[${j}].date`);
      add("data", notTbc(st.nextDate), `${b}.stages[${j}].nextDate`);
    });
    // journey and volumeNote live under detail; until 2 Oct 2026 both were read
    // from the product's top level, where the data has neither, so they were
    // never collected
    (d.journey || []).forEach((j2, j) => add("data", j2.label, `${b}.detail.journey[${j}].label`));
  });

  // sources.js: the Sources footer, rendered from the registry since 9c6be45.
  // Exactly what renderSources() puts on the page, for public entries only —
  // the name (label, or title where there is no label), the plain line, and
  // the labels of the alsoSee links. "findings" and "relevance" are internal
  // and are never collected; urls, ids and dates are provenance.
  const S = readDataFile("data/sources.js");
  (S.sources || []).forEach((src, i) => {
    if (!src.public) return;
    const b = `sources.sources[${i}]`;
    if (src.label) add("data", src.label, `${b}.label`);
    else add("data", src.title, `${b}.title`);
    add("data", src.plain, `${b}.plain`);
    (src.alsoSee || []).forEach((a, j) => add("data", a.label, `${b}.alsoSee[${j}].label`));
  });

  // ---------------------------------------------------------------------------
  // 2 & 3. the page itself
  // ---------------------------------------------------------------------------
  const html = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const lines = html.split("\n");
  const cut = lines.findIndex((l) => l.includes('src="data/products.js"'));
  if (cut === -1) throw new Error("could not find the data script block");
  const staticPart = lines.slice(0, cut).join("\n");
  const jsPart = lines.slice(cut).join("\n");

  // markup: text nodes, minus <style>/<script>/comments
  let st = staticPart
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  st.split(/<[^>]+>/).forEach((t) => {
    const v = t.replace(/\s+/g, " ").trim();
    if (v.length > 1 && /[A-Za-z]{3}/.test(v)) add("markup", v, "static text");
  });
  // rendering attributes
  for (const m of staticPart.matchAll(/(title|aria-label|placeholder|alt)="([^"]{3,})"/g)) {
    add("markup", m[2], `static @${m[1]}`);
  }

  // js: candidate UI literals.
  //
  // Comments are stripped first — an earlier version of this pulled
  // "is stage i-1 done" out of a code comment and offered it for translation.
  //
  // The filter is deliberately strict, because the substitution step replaces
  // text in a working page: a false positive here can corrupt SVG markup or a
  // CSS custom property. Anything rejected that IS user-facing gets added to
  // the reviewed list by hand; anything accepted still gets read before use.
  const jsNoComments = jsPart
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))   // keep line numbers
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(Math.max(m.length - p1.length, 0)));

  const lineOf = (idx) => jsPart.slice(0, idx).split("\n").length + cut;
  const LIT = /"([^"\\\n]{3,})"|'([^'\\\n]{3,})'|`([^`\\\n]{3,})`/g;

  const isMarkup   = (t) => /[<>]/.test(t);                       // SVG/HTML fragments
  const isCssVar   = (t) => /var\(--/.test(t);
  const isUrlish   = (t) => /^(https?:|\/\/|sha\d|data:)/.test(t) || /^[A-Za-z0-9+/=]{40,}$/.test(t);
  const isFragment = (t) => /^[\s),.:;+\]}=]/.test(t) || /[({[]$/.test(t);   // cut mid-expression
  const isCodeish  = (t) => /\.(replace|split|join|match|test)\(/.test(t) || /\/[gimsuy]*,/.test(t);
  const isAttrName = (t) => /^[a-z-]+=$/.test(t);
  const isToken    = (t) => /^[\w.#/\[\]@$-]+$/.test(t);          // selectors, paths, keys, @context
  const isUnit     = (t) => /^(px|em|rem|true|false|null|undefined|middle|none|round|butt)$/i.test(t);
  // with the ${...} holes removed, is what remains only CSS-identifier material?
  // catches `dot ${st.status}`, `pathnode${stacked ?`, `peek-txt peek-closed`
  const bare       = (t) => t.replace(/\$\{[^}]*\}?/g, " ").replace(/\s+/g, " ").trim();
  const isCssish   = (t) => /^[a-z0-9 _.#-]*$/.test(bare(t));
  const isCssDecl  = (t) => /^[a-z-]+\s*:\s*[\w.%-]+$/.test(t);      // height:14px
  const isSvgPath  = (t) => /^[MLQACVHZmlqacvhz]\s/.test(t);         // path data
  const isMime     = (t) => /^[a-z]+\/[a-z+.-]+$/.test(t);
  const isEntity   = (t) => /^&[a-z]+;$/.test(t);
  // Code that reads like prose because it has spaces and punctuation, and that
  // breaks when translated (all four were, before 2 Oct 2026): a media query
  // ("(min-width: 721px)" became "(largeur minimale : 721 px)", so the Sources
  // list never opened on a French laptop), a CSS selector list ("button, a,
  // .gloss" became "botão, um, . brilho", which throws, and "bouton, a, .gloss",
  // which silently matched nothing, so a row's own click closed it again), an
  // attribute selector, and a style declaration ("grid-column: 4 / -1").
  // Media queries on the input device count too (7 Oct 2026): the forms ask
  // matchMedia("(pointer: coarse)") whether to move focus into a field, and a
  // translated query would quietly answer no on /fr and /pt.
  const isMediaQuery = (t) => /^\(\s*((min-|max-|prefers-)[a-z-]+|(any-)?(pointer|hover)|orientation)\s*:/.test(t);
  const isSelectorList = (t) => /^[\w.#\[\]="'*:-]+(\s*,\s*[\w.#\[\]="'*:-]+)+$/.test(t) && /(^|,)\s*[.#\[*]/.test(t);
  const isAttrSelector = (t) => /^\[[a-z-]+/.test(t);
  const isStyleDecl  = (t) => /^[a-z-]+\s*:\s*[-\d.]+(px|%|em|rem)?(\s*\/\s*-?\d+)?\s*;?$/.test(t);
  const isCode2 = (t) => isMediaQuery(t) || isSelectorList(t) || isAttrSelector(t) || isStyleDecl(t);

  // a UI string is prose: at least two letters, and either a space or sentence
  // punctuation. "today" and ", ongoing" are real; "esc" and "ltr" are not.
  const looksLikeProse = (t) => /[A-Za-z]{2}/.test(t) && (/\s/.test(t) || /[.,!?;:\u2014\u00b7]/.test(t) || t.length >= 5);

  for (const m of jsNoComments.matchAll(LIT)) {
    const t = (m[1] || m[2] || m[3] || "").trim();
    const quote = m[1] != null ? '"' : m[2] != null ? "'" : "`";
    if (!t) continue;
    if (isMarkup(t) || isCssVar(t) || isUrlish(t) || isFragment(t) ||
        isCodeish(t) || isAttrName(t) || isToken(t) || isUnit(t) ||
        isCssish(t) || isCssDecl(t) || isSvgPath(t) || isMime(t) || isEntity(t) || isCode2(t)) continue;
    if (!looksLikeProse(t)) continue;
    add("js", t, `line ${lineOf(m.index)}`, quote);
  }

  // Second pass: many user-facing strings are wrapped in markup INSIDE a JS
  // literal — `<span class="bl">\u26a0 Draft figures \u2014 not yet verified.</span>`.
  // The loop above rejects those wholesale because replacing a literal that
  // carries markup is unsafe. Their TEXT NODES are safe to translate on their
  // own, so they are collected separately.
  //
  // Over-collection here is harmless: the builder only substitutes strings that
  // are present in the translation memory, so a fragment that is really code
  // simply never matches anything and is left alone.
  // An arrow function followed by a comparison looks exactly like a text node:
  //   some(iv => !(end < iv[0] - 6 || ...))
  // matches "> !(end <" and captures "!(end". That shipped once and broke the
  // page with "fin is not defined". Prose does not contain JS operators.
  const isCodeChars = (t) => /[!=&|{}\\]/.test(t) || /=>/.test(t) ||
    /\b(return|const|let|var|function|typeof|null|undefined)\b/.test(t);

  for (const m of jsNoComments.matchAll(/>([^<>{}`$]{3,})</g)) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{3}/.test(t)) continue;
    if (!/^[\p{L}\d\u2022\u00b7\u26a0"'(]/u.test(t)) continue;   // must start like prose
    if (isCodeChars(t)) continue;
    if (isCssish(t) || isCssDecl(t) || isToken(t) || isUnit(t) || isUrlish(t)) continue;
    if (!looksLikeProse(t)) continue;
    add("js", t, `line ${lineOf(m.index)} (in markup)`);
  }

  // ---------------------------------------------------------------------------
  // 4. reviewed — i18n/reviewed-strings.json
  // ---------------------------------------------------------------------------
  // What the filters above reject on purpose, because a pattern cannot tell it
  // from code: single words ("Overview", "Close"), lower-case phrases
  // ("in progress"), text around ${...} holes ("Step ${n} of ${m}"), and the
  // shared widgets in assets/ that the page loads (feedback form, site menu).
  // Each entry names its exact snippet, so the builder replaces only that.
  for (const r of reviewed()) add("reviewed", r.en, r.file);

  // ---------------------------------------------------------------------------
  // 5. ui — i18n/ui.en.json, the React version's interface text
  // ---------------------------------------------------------------------------
  // Every message, by its key path; keys starting with "_" are notes. A text
  // that is also on the page gets the same key (key(English)), so the bot
  // translates it once for both.
  if (fs.existsSync(UI)) {
    const walk = (o, at) => {
      for (const [k, v] of Object.entries(o)) {
        if (k.startsWith("_")) continue;
        if (v && typeof v === "object") walk(v, at ? `${at}.${k}` : k);
        else add("ui", v, `${rel(UI)}:${at ? `${at}.${k}` : k}`);
      }
    };
    walk(JSON.parse(fs.readFileSync(UI, "utf8")), "");
  }

  return out;
}

// The reviewed list, checked against the files it names: a snippet that is no
// longer in its file means the code changed under it, and the build stops
// rather than leave that text in English without saying so.
const REVIEWED = path.join(ROOT, "i18n", "reviewed-strings.json");
const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Where in its snippet an entry's English sits: as a whole word, not touching a
// letter, digit, _ or . on either side — so "yr" in `${el2.yrs} yr${` is the
// label, not the code. -1 unless there is exactly one such place.
function placeIn(src, inner) {
  const at = [];
  for (let i = src.indexOf(inner); i !== -1; i = src.indexOf(inner, i + 1)) {
    const before = src[i - 1] || "", after = src[i + inner.length] || "";
    if (!/[\p{L}\d_.]/u.test(before) && !/[\p{L}\d_]/u.test(after)) at.push(i);
  }
  return at.length === 1 ? at[0] : -1;
}
function reviewed() {
  if (!fs.existsSync(REVIEWED)) return [];
  const list = JSON.parse(fs.readFileSync(REVIEWED, "utf8")).entries || [];
  const files = {};
  const bad = [];
  for (const r of list) {
    const text = (files[r.file] ||= fs.readFileSync(path.join(ROOT, r.file), "utf8"));
    const inner = r.html ? escHtml(r.en) : r.en;
    if (!text.includes(r.src)) bad.push(`${r.file}: not found: ${r.src}`);
    else if (placeIn(r.src, inner) === -1) bad.push(`${r.file}: "${r.en}" is not exactly once, as a whole word, in its src: ${r.src}`);
  }
  if (bad.length) {
    throw new Error(`i18n/reviewed-strings.json no longer matches the code:\n    ${bad.join("\n    ")}\n  Update the entries to the new code.`);
  }
  return list;
}

// ---------------------------------------------------------------------------
// content.en.json
// ---------------------------------------------------------------------------
const CONTENT = path.join(ROOT, "i18n", "content.en.json");
const MEM = path.join(ROOT, "i18n", "translations.json");
const UI = path.join(ROOT, "i18n", "ui.en.json");
const SCHEMA = "launch-content/1";
const BUCKETS = ["data", "markup", "js", "reviewed", "ui"];
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

function assemble() {
  const found = collect();
  const text = [];
  for (const b of BUCKETS) {
    for (const s of found[b]) {
      const e = { key: key(s.text), bucket: b, en: s.text, where: s.where };
      if (s.quote) e.quote = s.quote;
      text.push(e);
    }
  }
  const values = {};
  for (const f of Object.keys(GLOBALS)) {
    const data = readDataFile(f);
    values[f] = { sha256: digest(data), data };
  }
  const counts = { data: found.data.length, markup: found.markup.length, js: found.js.length, reviewed: found.reviewed.length, ui: found.ui.length, total: text.length };
  return { schema: SCHEMA, contentHash: contentHashOf(text, values), counts, text, values };
}

// What the analyst approves. `where` and `quote` are locations, not content, and
// are left out, so moving a string to another line of the page does not void an
// approval. Values are represented by their per-file sha256.
function contentHashOf(text, values) {
  return digest({
    schema: SCHEMA,
    text: text.map((e) => ({ key: e.key, bucket: e.bucket, en: e.en })),
    values: Object.fromEntries(Object.entries(values).map(([f, v]) => [f, v.sha256])),
  });
}

// Readable and diffable: one text entry per line, each data file on one line
// (pretty-printed, the study rows alone would run to hundreds of thousands).
function serialise(c) {
  const out = ["{",
    `  "schema": ${JSON.stringify(c.schema)},`,
    `  "note": "Generated by scripts/assemble-content.js. Do not edit by hand: edit the source and re-run it.",`,
    `  "contentHash": ${JSON.stringify(c.contentHash)},`,
    `  "counts": ${JSON.stringify(c.counts)},`,
    `  "text": [`];
  c.text.forEach((e, i) => out.push("    " + JSON.stringify(e) + (i < c.text.length - 1 ? "," : "")));
  out.push("  ],", `  "values": {`);
  const files = Object.keys(c.values);
  files.forEach((f, i) => out.push(`    ${JSON.stringify(f)}: ${JSON.stringify(c.values[f])}` + (i < files.length - 1 ? "," : "")));
  out.push("  }", "}");
  return out.join("\n") + "\n";
}

function load() {
  return fs.existsSync(CONTENT) ? JSON.parse(fs.readFileSync(CONTENT, "utf8")) : null;
}

// Everything that makes content.en.json untrustworthy. Empty list = up to date.
function problems() {
  const saved = load();
  if (!saved) return [`${rel(CONTENT)} does not exist`];
  const p = [];
  if (saved.schema !== SCHEMA) p.push(`schema is "${saved.schema}", this script writes "${SCHEMA}"`);

  // 1. edited by hand? re-hash the file's own contents
  const text = saved.text || [];
  const badKeys = text.filter((e) => e.key !== key(e.en)).length;
  if (badKeys) p.push(`${badKeys} text entr${badKeys === 1 ? "y's key does" : "ies' keys do"} not match their English (edited by hand?)`);
  const values = saved.values || {};
  for (const [f, v] of Object.entries(values)) {
    if (digest(v.data) !== v.sha256) p.push(`values["${f}"] does not match its sha256 (edited by hand?)`);
  }
  if (contentHashOf(text, values) !== saved.contentHash) p.push("contentHash does not match the file's own contents");

  // 2. stale? re-read the source and compare
  const now = assemble();
  if (now.contentHash !== saved.contentHash) {
    for (const f of Object.keys(now.values)) {
      if (!values[f] || values[f].sha256 !== now.values[f].sha256) p.push(`${f} changed`);
    }
    const id = (e) => e.bucket + "\u0000" + e.key;
    const before = new Set(text.map(id)), after = new Set(now.text.map(id));
    const added = now.text.filter((e) => !before.has(id(e))).length;
    const removed = text.filter((e) => !after.has(id(e))).length;
    if (added || removed) p.push(`text: ${added} string(s) added or changed, ${removed} removed or changed`);
    if (!p.length) p.push("the source changed since content.en.json was written");
  }

  // 3. the translation memory must still agree with scripts/i18n-hash.js
  if (fs.existsSync(MEM)) {
    const entries = JSON.parse(fs.readFileSync(MEM, "utf8")).entries || {};
    const off = Object.entries(entries).filter(([k, e]) => key(e.en) !== k).length;
    if (off) p.push(`${off} key(s) in ${rel(MEM)} do not match scripts/i18n-hash.js — was the hash rule or an "en" value edited?`);
  }
  return p;
}

// Called first by every script that reads content.en.json. Refuses to go on
// when the file is stale or invalid, so nothing is translated or built from it.
function requireFresh() {
  const p = problems();
  if (!p.length) return load();
  console.error(`\n  ${rel(CONTENT)} is OUT OF DATE or invalid:`);
  p.forEach((x) => console.error(`    ${x}`));
  console.error("  run: node scripts/assemble-content.js\n");
  process.exit(1);
}

function main() {
  if (process.argv.includes("--check")) {
    const p = problems();
    if (!p.length) {
      console.log(`\n  ${rel(CONTENT)} is up to date\n  contentHash ${load().contentHash.slice(0, 12)}…  matches the source\n`);
      return;
    }
    console.error(`\n  ${rel(CONTENT)} is OUT OF DATE or invalid:`);
    p.forEach((x) => console.error(`    ${x}`));
    console.error("  run: node scripts/assemble-content.js\n");
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(CONTENT), { recursive: true });
  fs.writeFileSync(CONTENT, serialise(assemble()), "utf8");
}

module.exports = { assemble, load, problems, requireFresh, reviewed, escHtml, placeIn, CONTENT };
if (require.main === module) main();
