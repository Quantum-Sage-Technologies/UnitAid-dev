#!/usr/bin/env node
// Builds the interface-text files for the React version of the dashboard that
// RBM's Next.js app loads through its i18n.ts: one JSON file per language,
// nested by key path, everything under one name, "Unitaid" (NAMESPACE, the
// name RBM gave our module on 28 Oct 2026), so our keys sit beside RBM's own
// without colliding and RBM's page can hand the dashboard its part in one
// piece. Each file also carries the few keys RBM's site itself reads for the
// module (shellKeys(): its sidebar entry, the page's title and metadata).
//
//   node scripts/build-rbm-messages.js                 # → dist/rbm-messages/{en,fr,pt}.json
//   node scripts/build-rbm-messages.js --check         # the same checks, writes nothing
//   node scripts/build-rbm-messages.js --allow-stale   # a string with no translation stays English
//
// Only the INTERFACE text is here: buttons, labels, headings, messages, the
// feedback form, the failure messages. Data texts (products, sources, stages,
// glossary, country names) come translated inside dashboard.json.
//
// HOW. The English is i18n/ui.en.json: named keys, {name} placeholders. It is
// a bucket of i18n/content.en.json ("ui", scripts/assemble-content.js), so the
// translate bot translates a new or reworded message like any other text, and
// every message's French and Portuguese is memory[key(its English)] in
// i18n/translations.json (scripts/i18n-hash.js). Every translated string must
// keep exactly the English's placeholders, or it counts as missing. French
// gets the typographic apostrophe ’ (typeset()).
//
// THE OLD PAGE. While index.html runs too, a message must say what the page
// says, or the two sites drift apart. So every message must be on the page:
// a plain one word for word (its key is in content.en.json's page buckets);
// one with {placeholders} through its page form in i18n/ui.page-forms.json
// ("Stage ${stepNo(i)} of ${STAGE_COLUMNS.length}", or words the page joins
// with +), which must rebuild its English exactly, from strings the page
// still has. A message only the React version has is marked { "uiOnly": true }
// there. Anything else stops the build: reword the page and ui.en.json
// together.
//
// A string with no translation: the build fails and lists them, unless
// --allow-stale, which writes the English in its place and says so (CI, on a
// pull request the bot has not translated yet). A string the memory holds
// only as a stub (TRANSLATE_ENGINE=stub) counts as missing.
//
// Requires Node 18+. No dependencies.
"use strict";
const fs = require("fs");
const path = require("path");
const { key } = require("./i18n-hash");
const { LOCALES } = require("./rbm-manifest");

const ROOT = path.resolve(__dirname, "..");
const UI = path.join(ROOT, "i18n", "ui.en.json");
const FORMS = path.join(ROOT, "i18n", "ui.page-forms.json");
const MEM = path.join(ROOT, "i18n", "translations.json");
const CONTENT = path.join(ROOT, "i18n", "content.en.json");
const OUT = path.join(ROOT, "dist", "rbm-messages");
// The top-level key of every file that holds our messages: RBM's page passes
// messages[NAMESPACE] to the dashboard. RBM named it (sample files, 28 Oct
// 2026). Renaming it is this line (and the React version's lib/messages.ts).
const NAMESPACE = "Unitaid";

// What RBM's site reads for the module besides our messages: its menu entry,
// outside the namespace, with RBM's key names, Sidebar.<group>_subitem_unitaid
// and its _tooltip (rbm-module-unitaid's contract check and sidebar, 4 Nov
// 2026; the sample files of 28 Oct had Sidebar.unitaid), and inside it the
// page's title and metadata. They are made from messages we already have, so
// they never need a translation of their own: the header's title and
// description, RBM's own name kept in English in the title, and the keywords
// in English in every language, as RBM's sample keeps its own.
const RBM_SITE = "RBM Partnership to End Malaria";
const KEYWORDS = "LAUNCH, Unitaid, Malaria, Antimalarial medicines, Market access, Product launch, Dashboard, RBM Partnership to End Malaria";
// The menu entry's key: RBM's sidebar group "partners", as its sandbox reads it.
const SIDEBAR_KEY = "partners_subitem_unitaid";
// m: one language's messages, { "header.title": "…" }. A key whose source is
// missing is left out (small test inputs have no header).
function shellKeys(m) {
  const title = m["header.title"], description = m["header.description"];
  const keep = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string"));
  return {
    sidebar: keep({ [SIDEBAR_KEY]: title, [`${SIDEBAR_KEY}_tooltip`]: description }),
    page: {
      ...keep({ title }),
      ...(title ? { metadata: keep({ title: `${title} | ${RBM_SITE}`, description, keywords: KEYWORDS }) } : {}),
    },
  };
}
// keys our own messages may not use, since shellKeys() writes them
const SHELL_TOP = ["title", "metadata"];
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

// ---------------------------------------------------------------------------
// keys
// ---------------------------------------------------------------------------
// camelCase segments, dot-separated. Keys starting with "_" are notes for the
// reader of ui.en.json, never messages.
const SEGMENT = /^[a-z][A-Za-z0-9]*$/;

// { a: { b: "x" } } → [["a.b", "x"]], in file order
function flatten(obj, prefix = "", out = [], errors = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("_")) continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (!SEGMENT.test(k)) errors.push(`${p}: "${k}" is not a camelCase key`);
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, p, out, errors);
    else if (typeof v !== "string" || !v.trim()) errors.push(`${p}: not a non-empty string`);
    else out.push([p, v]);
  }
  return Object.assign(out, { errors });
}

// [["a.b", "x"]] → { a: { b: "x" } }
function nest(pairs) {
  const root = {};
  for (const [p, v] of pairs) {
    const parts = p.split(".");
    let o = root;
    parts.slice(0, -1).forEach((s) => { o = (o[s] ||= {}); });
    o[parts[parts.length - 1]] = v;
  }
  return root;
}

// ICU-style {name} placeholders, sorted, without repeats
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const placeholders = (s) => [...new Set([...String(s).matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();

// What an ICU message reader would misread: a brace that is not part of a
// {name}, and an ASCII apostrophe next to a brace or another apostrophe (ICU's
// quoting character: "l'{stage}" would print "{stage}" literally).
function icuProblems(s) {
  const p = [];
  if (/[{}]/.test(String(s).replace(PLACEHOLDER, ""))) p.push("a { or } that is not a {placeholder}");
  if (/'[{}']|[{}]'/.test(s)) p.push("an ASCII apostrophe next to a brace or another apostrophe (ICU quoting)");
  if (/\$\{/.test(s)) p.push("a ${...} hole left in");
  return p;
}

// French takes the typographic apostrophe ’ (U+2019) for every straight one
// (decision 9). Today's pages mix the two by where a text happens to live:
// build-locale-pages.js turns ' into ’ only inside JavaScript literals, so 36
// texts have ’ and 17 have '. These files are one text per key, so they take
// one style; ’ is also never ICU's quoting character. Applied to translations
// only: English, and an English fallback, are the pages' own text.
const TYPESET = { fr: (s) => s.replace(/'/g, "’") };
const typeset = (loc, s) => (TYPESET[loc] ? TYPESET[loc](s) : s);

// ---------------------------------------------------------------------------
// page forms: how the old page writes a message with {placeholders}
// ---------------------------------------------------------------------------
// One form as a list of parts: a string is copied as it is; { t, holes, drop }
// is a string the page has.
function partsOf(form) {
  if (Array.isArray(form.parts)) return form.parts;
  if (typeof form.page === "string") return [{ t: form.page, holes: form.holes || {}, drop: form.drop }];
  return null;
}

// One page string with its holes filled and its leading `drop` removed: how
// the form rebuilds the message's English. (Until 28 Oct 2026 it converted
// the page's translations too; they are now in the memory under the
// message's own English, decision 11.) Fails if a hole is not there exactly
// as often as in the page text, or the drop is not where it should be.
function fill(text, part, englishText) {
  let s = String(text);
  if (part.drop) {
    if (!s.startsWith(part.drop)) return { error: `does not start with "${part.drop}"` };
    s = s.slice(part.drop.length);
  }
  for (const [hole, to] of Object.entries(part.holes || {})) {
    const want = englishText.split(hole).length - 1;
    const have = s.split(hole).length - 1;
    if (!want) return { error: `the form's hole ${hole} is not in its page text` };
    if (have !== want) return { error: `has ${hole} ${have} time(s), the English ${want}` };
    s = s.split(hole).join(to);
  }
  return { text: s };
}

// ---------------------------------------------------------------------------
// the build
// ---------------------------------------------------------------------------
const STUB = /^\[stub-[a-z]+\] /;

// Everything in memory: returns the messages per language (flat), what is
// missing, and any error that is not a translation gap (a broken ui.en.json
// or page-forms file, or a message the old page no longer says). Reads
// nothing itself, so the tests can feed it what they like. `pageKeys` is the
// keys of content.en.json's page buckets (not "ui"); null skips the page check.
function build({ ui, forms, memory, pageKeys = null }) {
  const errors = [];
  const flat = flatten(ui);
  errors.push(...flat.errors);
  const formOf = (forms && forms.forms) || {};
  const uiKeys = new Set(flat.map(([k]) => k));
  for (const k of SHELL_TOP) if (uiKeys.has(k) || [...uiKeys].some((u) => u.startsWith(k + "."))) errors.push(`${k}: a top-level key shellKeys() writes; give the message another name`);
  for (const k of Object.keys(formOf)) if (!uiKeys.has(k)) errors.push(`${rel(FORMS)}: "${k}" is not a key in ${rel(UI)}`);
  if (LOCALES[0] !== "en") errors.push(`LOCALES must start with "en", got ${LOCALES.join(",")}`);

  const messages = Object.fromEntries(LOCALES.map((l) => [l, []]));
  const missing = Object.fromEntries(LOCALES.map((l) => [l, []]));
  const stubs = Object.fromEntries(LOCALES.map((l) => [l, 0]));
  const placeholderKeys = [];
  const uiOnly = [];
  const onPage = (t) => !pageKeys || pageKeys.has(key(t));

  for (const [k, en] of flat) {
    for (const p of icuProblems(en)) errors.push(`${k}: the English has ${p}`);
    const ph = placeholders(en);
    if (ph.length) placeholderKeys.push(k);

    // the old page must say the same
    const form = formOf[k];
    if (form && form.uiOnly === true) {
      uiOnly.push(k);
    } else if (form) {
      const parts = partsOf(form);
      if (!parts) { errors.push(`${k}: its page form has neither "page" nor "parts" (nor "uiOnly": true)`); continue; }
      // the form must rebuild this key's English exactly, from strings the page still has
      let rebuilt = "", broken = false;
      for (const part of parts) {
        if (typeof part === "string") { rebuilt += part; continue; }
        const r = fill(part.t, part, part.t);
        if (r.error) { errors.push(`${k}: its page form ${r.error}`); broken = true; break; }
        if (!onPage(part.t)) { errors.push(`${k}: the page no longer has "${part.t}" (its page form): reword ${rel(UI)} and ${rel(FORMS)} with the page`); broken = true; break; }
        rebuilt += r.text;
      }
      if (broken) continue;
      if (rebuilt !== en) { errors.push(`${k}: its page form gives "${rebuilt}", ${rel(UI)} says "${en}"`); continue; }
    } else if (ph.length) {
      errors.push(`${k}: has {${ph.join("}, {")}} but no page form in ${rel(FORMS)}: add how the page writes it, or "uiOnly": true`);
      continue;
    } else if (!onPage(en)) {
      errors.push(`${k}: the page does not say "${en}": reword ${rel(UI)} with the page, or mark it "uiOnly": true in ${rel(FORMS)}`);
      continue;
    }

    messages.en.push([k, en]);
    for (const loc of LOCALES.slice(1)) {
      const e = memory[key(en)];
      const v = e && e[loc];
      let why = null, out = v;
      if (!v) why = `no ${loc} translation yet`;
      else if (STUB.test(v)) { stubs[loc]++; why = `only a stub ${loc} value`; }
      else {
        out = typeset(loc, v);
        const got = placeholders(out).join(), want = ph.join();
        const icu = icuProblems(out);
        if (got !== want) why = `the ${loc} has {${placeholders(out).join("}, {")}}, the English {${ph.join("}, {")}}: "${out}"`;
        else if (icu.length) why = `the ${loc} has ${icu.join("; ")}: "${out}"`;
      }
      if (why) { missing[loc].push({ key: k, en, why }); messages[loc].push([k, en]); continue; }
      messages[loc].push([k, out]);
    }
  }
  return { keys: flat.map(([k]) => k), messages, missing, stubs, placeholderKeys, uiOnly, errors };
}

// The repository's own files.
function load() {
  const content = fs.existsSync(CONTENT) ? readJson(CONTENT) : null;
  return {
    ui: readJson(UI),
    forms: fs.existsSync(FORMS) ? readJson(FORMS) : { forms: {} },
    memory: readJson(MEM).entries || {},
    pageKeys: content ? new Set((content.text || []).filter((e) => e.bucket !== "ui").map((e) => e.key)) : null,
  };
}

// The file each language gets: RBM's Sidebar keys, then everything under
// NAMESPACE (the page's title and metadata first, as in RBM's sample), nested,
// tab indent (RBM's Biome format check), LF, newline at the end.
const serialise = (pairs) => {
  const shell = shellKeys(Object.fromEntries(pairs));
  const file = { Sidebar: shell.sidebar, [NAMESPACE]: { ...shell.page, ...nest(pairs) } };
  if (!Object.keys(file.Sidebar).length) delete file.Sidebar;
  return JSON.stringify(file, null, "\t") + "\n";
};

// ---------------------------------------------------------------------------
// Returns the exit code. The tests pass their own inputs and folder.
function main(args = [], inputs = load(), outDir = OUT) {
  const check = args.includes("--check");
  const allowStale = args.includes("--allow-stale");
  const r = build(inputs);

  if (r.errors.length) {
    console.error(`\n  ${rel(UI)} / ${rel(FORMS)} are not consistent:`);
    r.errors.forEach((e) => console.error(`    ${e}`));
    console.error("  Nothing written.\n");
    return 1;
  }

  // coverage
  const areas = {};
  r.keys.forEach((k) => { const a = k.split(".")[0]; areas[a] = (areas[a] || 0) + 1; });
  console.log(`\n  ${rel(UI)}: ${r.keys.length} keys (${Object.entries(areas).map(([a, n]) => `${a} ${n}`).join(", ")})`);
  console.log(`  ${r.placeholderKeys.length} with {placeholders} · ${r.keys.length - r.uiOnly.length} checked against the page · ${r.uiOnly.length} only in the React version`);
  for (const loc of LOCALES.slice(1)) {
    const miss = r.missing[loc].length;
    const pct = Math.round(((r.keys.length - miss) / r.keys.length) * 100);
    console.log(`  ${loc}: ${r.keys.length - miss} translated · ${miss} missing · ${pct}%${r.stubs[loc] ? ` · ${r.stubs[loc]} stub value(s) counted as missing` : ""}`);
  }

  const anyMissing = LOCALES.some((l) => r.missing[l].length);
  if (anyMissing) {
    console.log("\n  No translation" + (allowStale ? " (English used, --allow-stale):" : ":"));
    for (const loc of LOCALES.slice(1)) r.missing[loc].forEach((m) => console.log(`    [${loc}] ${m.key}: ${m.why}`));
  }
  if (anyMissing && !allowStale) {
    console.error("\n  BUILD FAILED — strings with no translation (above). The translate bot translates them once");
    console.error("  i18n/ui.en.json is on main; or build with --allow-stale to ship them in English. Nothing written.\n");
    return 1;
  }

  const files = Object.fromEntries(LOCALES.map((l) => [l, serialise(r.messages[l])]));
  if (check) {
    const state = LOCALES.map((l) => {
      const f = path.join(outDir, `${l}.json`);
      return `${l}.json ${!fs.existsSync(f) ? "not built" : fs.readFileSync(f, "utf8") === files[l] ? "up to date" : "differs"}`;
    });
    console.log(`\n  ${rel(outDir)}/: ${state.join(", ")}\n  --check: nothing written.\n`);
    return 0;
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const l of LOCALES) fs.writeFileSync(path.join(outDir, `${l}.json`), files[l], "utf8");
  // a language that is no longer built (Spanish, until 27 Oct 2026) must not linger beside them
  for (const f of fs.readdirSync(outDir)) {
    if (/\.json$/.test(f) && !LOCALES.includes(f.replace(/\.json$/, ""))) { fs.rmSync(path.join(outDir, f)); console.log(`  removed ${rel(path.join(outDir, f))}`); }
  }
  console.log(`\n  wrote ${rel(outDir)}/{${LOCALES.join(",")}}.json\n`);
  return 0;
}

module.exports = { build, load, main, flatten, nest, placeholders, icuProblems, typeset, serialise, shellKeys, LOCALES, OUT, UI, FORMS, NAMESPACE, RBM_SITE, KEYWORDS, SIDEBAR_KEY };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
