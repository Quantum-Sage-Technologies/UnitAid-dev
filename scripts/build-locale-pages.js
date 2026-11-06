#!/usr/bin/env node
/**
 * scripts/build-locale-pages.js
 *
 * Produces French and Portuguese copies of the illustrated journey
 * dashboard by substitution at build time. The source page and the source data files are
 * READ ONLY — nothing in the repo is modified, so the English page stays the
 * single source and this step is reversible by deleting the output.
 *
 *   node scripts/build-locale-pages.js --check     # report, write nothing
 *   node scripts/build-locale-pages.js
 *   node scripts/build-locale-pages.js --allow-stale   # the public build only
 *
 * Output, ready for build-public-site.sh to copy:
 *
 *   dist/locale/fr/index.html
 *   dist/locale/fr/data/{products,sources}.js
 *   dist/locale/fr/data/  every other data file the page loads, unchanged
 *   dist/locale/pt/...
 *
 * Why per-locale copies of the data files: the page loads data/*.js with
 * <script src>, so the only way to give /fr/ French content without editing
 * the page's JavaScript is to serve it French data. The copies are generated,
 * never hand-edited, and never written back into data/.
 *
 * Which strings may be substituted comes from i18n/content.en.json: a string is
 * replaced only if it is in the approved text section AND has a translation in
 * i18n/translations.json. Keys are read from content.en.json, not recomputed.
 * The build exits first if content.en.json is stale (assemble-content.js).
 *
 * --allow-stale is for scripts/build-public-site.sh alone. A hand-made change
 * reaches main before the translate bot has rebuilt content.en.json, and
 * English does not wait for French (docs/translation-notes.md): so instead of
 * refusing, the build assembles the content from the source in memory — the
 * current English, never an old file — and whatever is new stays in English
 * until the bot has translated it. Nothing is written back.
 *
 * Substitution is exact-match only, and each kind is handled separately:
 *
 *   data    the JSON is parsed, values replaced at the allow-listed paths,
 *           and re-serialised. Nothing is matched by text.
 *   markup  whole text nodes in the static HTML, replaced as whole nodes.
 *   js      string literals, replaced INCLUDING their surrounding quotes, so
 *           a literal can never be confused with an identifier that happens
 *           to read the same.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { normalise } = require("./i18n-hash");
const { requireFresh, problems, assemble, reviewed, escHtml, placeIn } = require("./assemble-content");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist", "locale");
const PAGE = "index.html";
const MEM = path.join(ROOT, "i18n", "translations.json");
const COUNTRY_NAMES = path.join(ROOT, "i18n", "country-names.json");
// Adding a language: docs/jackson/spanish.md §4 lists every place it goes
// (Spanish was added on 8 Oct 2026 and removed on 27 Oct 2026).
const LOCALES = ["fr", "pt"];
// pt-BR since 28 Oct 2026 (Brazilian, as RBM's site): dates and numbers follow it
const HTML_LANG = { fr: "fr", pt: "pt-BR" };
// Shared widgets the page loads from assets/. Their locale copies get the
// reviewed-strings substitution (i18n/reviewed-strings.json).
const ASSET_SCRIPTS = ["assets/report-issue.js", "assets/site-nav.js"];

const GLOBALS = {
  "data/products.js": "window.LAUNCH_DATA",
  "data/sources.js": "window.LAUNCH_SOURCES",
  "data/treatment-policy.js": "window.LAUNCH_TREATMENT_POLICY",
  "data/world-map.js": "window.LAUNCH_MAP",
  "data/world-map-geo.js": "window.LAUNCH_MAP_GEO",
};

const isCodeChars = (t) => /[!=&|{}\\]/.test(t) || /=>/.test(t) ||
  /\b(return|const|let|var|function|typeof|null|undefined)\b/.test(t);

const check = process.argv.includes("--check");
const verifyOnly = process.argv.includes("--verify");   // re-run the self-check on existing output
const allowStale = process.argv.includes("--allow-stale");
if (!fs.existsSync(MEM)) {
  console.error(`\n  ${path.relative(ROOT, MEM)} not found — run scripts/translate-strings.js first.\n`);
  process.exit(1);
}
const MEMORY = JSON.parse(fs.readFileSync(MEM, "utf8")).entries;

// English -> key, from the approved text section of content.en.json. The builder
// does no hashing: a string that is not in content.en.json has no key, so it is
// never substituted, whatever the memory holds. --verify only inspects dist/ and
// does not need the content file.
//
// Three lookups, one per kind of substitution. The page's own JavaScript is
// matched only against strings collected FROM the page (markup and js): a word
// that is UI text in the data or in the reviewed list ("TBC", "None", "Source")
// can also be a literal the code compares against, and translating that
// literal breaks the comparison silently. Reviewed strings are replaced only
// at their exact snippet.
const KEY_OF = new Map();        // every bucket: data files and static markup
const PAGE_KEY_OF = new Map();   // markup + js: literals and text nodes in the page script
const REVIEWED_KEY_OF = new Map();
if (!verifyOnly) {
  let text;
  const stale = allowStale ? problems() : [];
  if (stale.length) {
    console.log("\n  i18n/content.en.json is not current — building from the source instead (--allow-stale):");
    stale.forEach((x) => console.log(`    ${x}`));
    console.log("  Anything new stays in English until the translate bot has run.");
    text = assemble().text;
  } else {
    text = requireFresh().text;
  }
  for (const e of text) {
    // the React version's text (i18n/ui.en.json): translated, never put in the page
    if (e.bucket === "ui") continue;
    if (e.bucket === "reviewed") { REVIEWED_KEY_OF.set(normalise(e.en), e.key); continue; }
    KEY_OF.set(normalise(e.en), e.key);
    if (e.bucket === "markup" || e.bucket === "js") PAGE_KEY_OF.set(normalise(e.en), e.key);
  }
}
const lookup = (map) => (text) => {
  const k = map.get(normalise(text));
  return k ? MEMORY[k] : undefined;
};
const entryOf = lookup(KEY_OF);
const pageEntryOf = lookup(PAGE_KEY_OF);
const reviewedEntryOf = lookup(REVIEWED_KEY_OF);

// A translation goes into a JavaScript string whose quote character the
// substitution cannot always see. A straight apostrophe would end a '...'
// literal, so it becomes the typographic one (’), which is also the correct
// French apostrophe; until 2 Oct 2026 such translations were skipped instead,
// which left "Lire l'avertissement" and most French with an apostrophe in
// English. Double quotes, backticks and backslashes outside ${...} holes are
// still refused.
const HOLE = /\$\{(?:[^{}]|\{[^{}]*\})*\}/g;
const holesOf = (t) => (String(t).match(HOLE) || []).sort().join("\u0000");
function scriptSafe(en, v) {
  const out = String(v).replace(/'/g, "’");
  if (holesOf(out) !== holesOf(en)) return null;               // a placeholder was lost or changed
  if (/["`\\]/.test(out.replace(HOLE, ""))) return null;
  return out;
}

const stat = {};
function tr(locale, text) {
  const t = String(text == null ? "" : text);
  const e = entryOf(t);
  const v = e && e[locale];
  const s = (stat[locale] ||= { hit: 0, miss: 0, missed: new Set() });
  if (!v && !/[A-Za-z]{2}/.test(t)) return t;   // "—", "2026", "Q4 2026": nothing to translate, not a miss
  if (v && /^\[stub-[a-z]+\] /.test(v)) s.stub = (s.stub || 0) + 1;
  if (v) { s.hit++; return v; }
  s.miss++; if (s.missed.size < 40) s.missed.add(t.slice(0, 70));
  return t;                                   // untranslated stays English
}

// ---------------------------------------------------------------------------
// data files — parse, replace at known paths, re-serialise
// ---------------------------------------------------------------------------
function readData(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const m = GLOBALS[rel];
  const at = src.indexOf(m + " =");
  if (at === -1) throw new Error(`${rel}: marker "${m} =" not found`);
  return JSON.parse(src.slice(at + m.length + 2).trim().replace(/;\s*$/, ""));
}

function localiseProducts(D, loc) {
  const T = (v) => (typeof v === "string" && v.trim() ? tr(loc, v) : v);
  if (Array.isArray(D.stages)) D.stages = D.stages.map(T);
  (D.stageInfo || []).forEach((x) => { ["what", "who", "stall", "source", "pendingName"].forEach((k) => { if (x[k]) x[k] = T(x[k]); }); });
  if (D.glossary) for (const k of Object.keys(D.glossary)) D.glossary[k] = T(D.glossary[k]);
  (D.changelog || []).forEach((c) => { c.plain = T(c.plain); c.summary = T(c.summary); });
  (D.products || []).forEach((p) => {
    ["note", "next", "flag", "classLabel", "barrier", "acknowledgement"].forEach((k) => { if (p[k]) p[k] = T(p[k]); });
    const d = p.detail || {};
    if (d.useCase) d.useCase = T(d.useCase);
    if (d.volumeNote) d.volumeNote = T(d.volumeNote);
    if (d.procurement && Array.isArray(d.procurement.presentations)) d.procurement.presentations = d.procurement.presentations.map(T);
    if (Array.isArray(d.access)) d.access = d.access.map(T);
    if (Array.isArray(d.adoption)) d.adoption = d.adoption.map(T);
    if (d.research) ["question", "lead", "geographies", "timeline"].forEach((k) => { if (d.research[k]) d.research[k] = T(d.research[k]); });
    // the citation (volume.source) stays English, as every source line does
    if (d.volume) {
      ["total", "period"].forEach((k) => { if (d.volume[k]) d.volume[k] = T(d.volume[k]); });
      (d.volume.split || []).forEach((s) => { if (s.channel) s.channel = T(s.channel); });
      (d.volume.byPresentation || []).forEach((r) => { if (r.label) r.label = T(r.label); });
      if (d.volume.coursesRule) d.volume.coursesRule = T(d.volume.coursesRule);
    }
    // the price guard — an unconfirmed note is never translated and never moves
    if (d.price && d.price.confirmedInWriting === true && d.price.note) d.price.note = T(d.price.note);
    (d.milestones || []).forEach((m) => {
      ["milestone", "label", "next", "date", "anticipated"].forEach((k) => { if (m[k]) m[k] = T(m[k]); });
    });
    // "TBC" stays: the page drops an expected date that reads exactly TBC
    const Tdate = (v) => (/^tbc$/i.test(String(v || "").trim()) ? v : T(v));
    (p.stages || []).forEach((st) => {
      if (st.note) st.note = T(st.note);
      if (st.pendingName) st.pendingName = T(st.pendingName);
      if (st.next) st.next = T(st.next);
      if (st.date) st.date = Tdate(st.date);
      if (st.nextDate) st.nextDate = Tdate(st.nextDate);
    });
    // under detail, as in the data (was read from the product's top level)
    (d.journey || []).forEach((j) => { if (j.label) j.label = T(j.label); });
  });
  return D;
}

// The Sources footer — the same fields assemble-content.js collects, and only
// the one renderSources() shows: label, or title where there is no label.
function localiseSources(D, loc) {
  const T = (v) => (typeof v === "string" && v.trim() ? tr(loc, v) : v);
  (D.sources || []).forEach((src) => {
    if (!src.public) return;
    if (src.label) src.label = T(src.label);
    else src.title = T(src.title);
    src.plain = T(src.plain);
    (src.alsoSee || []).forEach((a) => { a.label = T(a.label); });
  });
  return D;
}
// Country names — from i18n/country-names.json (Unicode CLDR, written by
// scripts/build-country-names.js), never from the translation memory: a
// country's name is reference data with one standard form. Keyed by the
// English spelling each file uses. A name the table lacks stays English and is
// reported.
const COUNTRIES = fs.existsSync(COUNTRY_NAMES) ? JSON.parse(fs.readFileSync(COUNTRY_NAMES, "utf8")).names : {};
const countryStat = {};
function countryName(loc, en) {
  const s = (countryStat[loc] ||= { hit: 0, missed: new Set() });
  const v = COUNTRIES[en] && COUNTRIES[en][loc];
  if (v) { s.hit++; return v; }
  if (en) s.missed.add(en);
  return en;
}
function localiseTreatmentPolicy(D, loc) {
  for (const c of Object.values(D.countries || {})) if (c.name) c.name = countryName(loc, c.name);
  return D;
}
function localiseMap(D, loc) {
  for (const c of Object.values(D.countries || {})) if (c.n) c.n = countryName(loc, c.n);
  return D;
}
function localiseMapGeo(D, loc) {
  for (const f of D.features || []) if (f.properties && f.properties.name) f.properties.name = countryName(loc, f.properties.name);
  return D;
}

const LOCALISE = {
  "data/products.js": localiseProducts,
  "data/sources.js": localiseSources,
  "data/treatment-policy.js": localiseTreatmentPolicy,
  "data/world-map.js": localiseMap,
  "data/world-map-geo.js": localiseMapGeo,
};

// Reviewed strings (i18n/reviewed-strings.json) in one file's text: every
// occurrence of each exact snippet, with its English swapped for the
// translation. Applied before the pattern passes, which then leave the
// translated text alone (it is not English, so it has no key).
const REVIEWED = verifyOnly ? [] : reviewed();
function applyReviewed(text, file, loc) {
  const s = (stat[loc] ||= { hit: 0, miss: 0, missed: new Set() });
  for (const r of REVIEWED) {
    if (r.file !== file) continue;
    const e = reviewedEntryOf(r.en);
    const v = e && e[loc] && scriptSafe(r.en, e[loc]);
    if (!v) { s.miss++; if (s.missed.size < 40) s.missed.add(r.en.slice(0, 70)); continue; }
    const inner = r.html ? escHtml(r.en) : r.en;
    const at = placeIn(r.src, inner);              // checked by reviewed(): exactly one whole-word place
    const out = r.src.slice(0, at) + (r.html ? escHtml(v) : v) + r.src.slice(at + inner.length);
    text = text.split(r.src).join(out);
    s.hit++;
  }
  return text;
}

// One reviewed string's translation, for text that lives outside the page and
// its two widgets: the RBM loader's messages (scripts/build-rbm-pages.js). The
// same memory and the same guard as applyReviewed(); English where there is
// none yet.
function reviewedText(loc, en) {
  const e = reviewedEntryOf(en) || entryOf(en);
  const v = e && e[loc] && scriptSafe(en, e[loc]);
  return v || en;
}

// Every data file the page loads, from its own <script src> tags. A fixed list
// here is how the locale pages lost data/sources.js when the Sources footer
// moved into it: the page loaded a file the build never copied.
const dataFilesOf = (html) => [...new Set([...html.matchAll(/<script src="(data\/[^"]+\.js)"/g)].map((m) => m[1]))];

// Local files a page references that are missing from its directory. Paths
// built at runtime (with ${...}) cannot be checked here and are skipped.
function missingFiles(dir) {
  const html = fs.readFileSync(path.join(dir, PAGE), "utf8");
  const refs = [...html.matchAll(/\bsrc="((?:data|assets)\/[^"?#]+)"/g)].map((m) => m[1]).filter((r) => !r.includes("${"));
  return [...new Set(refs)].filter((r) => !fs.existsSync(path.join(dir, r)));
}

// ---------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------
function localisePage(html, loc) {
  html = applyReviewed(html, PAGE, loc);
  const lines = html.split("\n");
  const cut = lines.findIndex((l) => l.includes('src="data/products.js"'));
  if (cut === -1) throw new Error("could not find the data script block");
  let staticPart = lines.slice(0, cut).join("\n");
  let jsPart = lines.slice(cut).join("\n");

  // --- static markup: replace whole text nodes ---------------------------
  // Split on tags, translate the text pieces, reassemble. Style, script and
  // comment blocks are masked out first so their contents are never touched.
  const masks = [];
  const mask = (re) => {
    staticPart = staticPart.replace(re, (m) => {
      masks.push(m);
      return `\u0000MASK${masks.length - 1}\u0000`;
    });
  };
  mask(/<style[\s\S]*?<\/style>/g);
  mask(/<script[\s\S]*?<\/script>/g);
  mask(/<!--[\s\S]*?-->/g);

  // The extractor collapses internal whitespace before fingerprinting, so the
  // builder must too — otherwise every text node that wraps across lines gets
  // a different fingerprint and silently misses. Leading and trailing
  // whitespace is preserved so inline spacing is unchanged.
  staticPart = staticPart.replace(/>([^<]+)</g, (whole, text) => {
    const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const [, lead, core, trail] = m;
    const norm = core.replace(/\s+/g, " ");
    if (!norm || !/[A-Za-z]{3}/.test(norm) || norm.startsWith("\u0000MASK")) return whole;
    const out = tr(loc, norm);
    return out === norm ? whole : ">" + lead + out + trail + "<";
  });
  // rendering attributes
  staticPart = staticPart.replace(/(title|aria-label|placeholder|alt)="([^"]{3,})"/g,
    (whole, attr, val) => {
      const out = tr(loc, val.trim());
      return out === val.trim() ? whole : `${attr}="${out.replace(/"/g, "&quot;")}"`;
    });

  masks.forEach((m, i) => { staticPart = staticPart.replace(`\u0000MASK${i}\u0000`, () => m); });

  // --- js literals: replace including the quotes --------------------------
  // Only literals that are IN the memory are touched. A literal that is not a
  // UI string was never sent for translation, so it has no entry and is
  // therefore skipped — the memory is the allow-list.
  const LIT = /(["'`])((?:(?!\1)[^\\\n])+)\1/g;
  jsPart = jsPart.replace(LIT, (whole, q, body) => {
    const t = body.trim();
    if (!t) return whole;
    const e = pageEntryOf(t);
    if (!e || !e[loc]) return whole;
    // never introduce a quote that would close the literal early
    const out = scriptSafe(t, e[loc]);
    if (!out || out.includes(q)) return whole;
    stat[loc].hit++;
    return q + body.replace(t, () => out) + q;
  });

  // Text nodes inside markup-bearing JS literals. Safe for the same reason the
  // literal pass is safe: the memory is the allow-list, so anything that is not
  // a known UI string never matches and is left untouched.
  jsPart = jsPart.replace(/>([^<>{}`$]{3,})</g, (whole, text) => {
    const norm = text.replace(/\s+/g, " ").trim();
    if (!norm || !/[A-Za-z]{3}/.test(norm)) return whole;
    // same guard as the extractor: an arrow function plus a comparison reads as
    // a text node, and substituting into it rewrites live code
    if (!/^[\p{L}\d\u2022\u00b7\u26a0"'(]/u.test(norm)) return whole;
    if (isCodeChars(norm)) return whole;
    const e = pageEntryOf(norm);
    if (!e || !e[loc]) return whole;
    const out = scriptSafe(norm, e[loc]);          // never inject a quote into a literal
    if (!out) return whole;
    stat[loc].hit++;
    return ">" + text.replace(norm, () => out) + "<";
  });

  let page = staticPart + "\n" + jsPart;

  // point the locale page at its own data files, and set the document language
  page = page.replace(/<html lang="en">/, `<html lang="${HTML_LANG[loc]}">`);
  return page;
}

// A shared widget's locale copy: the file as it is, with its reviewed strings
// translated. Also used by build-rbm-pages.js for the RBM pages' copies.
function localiseAsset(rel, loc) {
  return applyReviewed(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel, loc);
}

// ---------------------------------------------------------------------------
// Post-build self-check.
//
// A build that can fail without saying so will fail again, so the build proves
// the locale output is complete: every data/ and assets/ file the page loads
// must be there, or part of the page would say its data did not load.
//
// It also proves each locale copy keeps the same product ids, in the same
// order, and the same number of stages as English (from Keith's branch, merged
// 2 Oct 2026). The ids are lookup keys shared with treatment-policy.js, and a
// translated lookup key fails silently: the page renders, logs nothing, and
// whatever was keyed on it draws nothing.
// ---------------------------------------------------------------------------
function keysOf(file) {
  const src = fs.readFileSync(file, "utf8");
  const m = GLOBALS["data/products.js"];
  const D = JSON.parse(src.slice(src.indexOf(m + " =") + m.length + 2).trim().replace(/;\s*$/, ""));
  return { ids: (D.products || []).map((p) => p.id), stages: (D.stages || []).length };
}

function verify() {
  let failures = 0;
  const say = (ok, msg) => { console.log(`       ${ok ? "✓" : "✗"} ${msg}`); if (!ok) failures++; };
  const en = keysOf(path.join(ROOT, "data", "products.js"));

  console.log("\n  Self-check — locale output must load every file the page needs, and keep English's lookup keys:");
  for (const loc of LOCALES) {
    console.log(`\n    ${loc}`);
    const missing = missingFiles(path.join(OUT, loc));
    say(!missing.length, missing.length
      ? `the page loads files that are not there: ${missing.join(", ")}`
      : "every data/ and assets/ file the page loads is there");
    const lc = keysOf(path.join(OUT, loc, "data", "products.js"));
    say(JSON.stringify(lc.ids) === JSON.stringify(en.ids), `product ids unchanged (${en.ids.join(", ")})`);
    say(lc.stages === en.stages, `${lc.stages} stages (English: ${en.stages})`);
  }

  if (failures) {
    console.error(`\n  BUILD FAILED — ${failures} check(s) did not pass.`);
    console.error("  Either the page loads a file the build did not write, and part of it would");
    console.error("  say its data did not load, or a locale copy changed a product id or the");
    console.error("  number of stages, and data keyed on them would silently not match.\n");
    process.exit(1);
  }
  console.log("\n  All checks passed.\n");
}

// ---------------------------------------------------------------------------
function main() {
  if (verifyOnly) { verify(); return; }
  const html = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  console.log("");
  for (const loc of LOCALES) {
    stat[loc] = { hit: 0, miss: 0, missed: new Set() };
    const dir = path.join(OUT, loc);
    const dataDir = path.join(dir, "data");

    const page = localisePage(html, loc);
    const localised = {};
    for (const [rel, fn] of Object.entries(LOCALISE)) localised[rel] = fn(readData(rel), loc);
    // the shared widgets' own wording (feedback form, site menu)
    const assets = Object.fromEntries(ASSET_SCRIPTS.map((rel) => [rel, localiseAsset(rel, loc)]));

    const s = stat[loc];
    const pct = s.hit + s.miss ? Math.round((s.hit / (s.hit + s.miss)) * 100) : 0;
    console.log(`  ${loc}:  ${s.hit} translated · ${s.miss} left in English · ${pct}% coverage`);
    if (s.stub) console.log(`       ${s.stub} of them are stub values from a test run (TRANSLATE_ENGINE=stub), not translations`);

    if (!check) {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dir, PAGE), page, "utf8");
      for (const [rel, obj] of Object.entries(localised)) {
        fs.writeFileSync(path.join(dir, rel), `${GLOBALS[rel]} = ${JSON.stringify(obj)};\n`, "utf8");
      }
      // whatever else the page loads (the map geometry today), unchanged
      for (const rel of dataFilesOf(html)) {
        if (!LOCALISE[rel]) fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
      }
      // the page also loads assets/ with relative paths (icons, the Unitaid mark,
      // the WHO emblem, report-issue.js). Without these the locale page renders
      // with broken images and no stage glyphs.
      fs.cpSync(path.join(ROOT, "assets"), path.join(dir, "assets"), { recursive: true });
      for (const [rel, text] of Object.entries(assets)) fs.writeFileSync(path.join(dir, rel), text, "utf8");
      console.log(`       wrote ${path.relative(ROOT, dir)}/`);
    }
    const c = countryStat[loc] || { hit: 0, missed: new Set() };
    console.log(`       country names: ${c.hit} renamed${c.missed.size ? ` · ${c.missed.size} not in i18n/country-names.json: ${[...c.missed].slice(0, 8).join(", ")}` : ""}`);
  }

  const anyMiss = LOCALES.some((l) => stat[l].miss);
  if (anyMiss) {
    console.log("\n  Strings with no translation (kept in English), first few:");
    for (const loc of LOCALES) {
      [...stat[loc].missed].slice(0, 8).forEach((t) => console.log(`    [${loc}] ${t}`));
    }
  }
  if (check) { console.log("\n  --check: nothing written.\n"); return; }
  verify();
}

// scripts/build-dataset.js reuses the same localisation, so the French and
// Portuguese in the published dashboard.json are exactly those of /fr and /pt.
module.exports = { LOCALES, readData, localiseProducts, localiseSources, localiseTreatmentPolicy, localiseAsset, reviewedText, stat };

if (require.main === module) main();
