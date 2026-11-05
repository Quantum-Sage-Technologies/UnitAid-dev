#!/usr/bin/env node
// Builds dashboard.json — the one file the RBM dashboard pages fetch from the
// public data repo (DEV-32). Contract: public-data/v1/schema.json.
//
//   node scripts/build-dataset.js                      # → dist/dataset/v1/dashboard.json
//   node scripts/build-dataset.js --out <file>
//   node scripts/build-dataset.js --allow-stale        # CI dry build only (see below)
//
// ONE FILE PER LANGUAGE (28 Oct 2026). Beside dashboard.json it also writes
// dashboard.en.json, dashboard.fr.json and dashboard.pt.json, and their
// contract schema.lang.json. Each holds the same data with every text as a
// plain string in its own language, for the React version on RBM's Next.js
// site, which loads one file per language (next-intl). dashboard.json stays
// as it is for the static pages until the React version replaces them.
// docs/data-per-language-notes.md.
//
// Reads data/products.js, data/sources.js, data/treatment-policy.js,
// i18n/translations.json (through build-locale-pages.js) and data/decisions.js.
// Writes nothing in the repo except under dist/ (gitignored). Publishing it is
// .github/workflows/publish-dataset.yml's job, not this script's.
//
// TEXT. Every field a reader sees becomes { en, fr, pt }. The French and
// Portuguese come from the same localisation as the /fr and /pt pages
// (build-locale-pages.js), so the two can never disagree; a field with no
// translation yet carries the English in fr and pt. Which fields are text is
// the fixed list TEXT_PATHS below, not "whatever happens to be translated
// today", so a field never changes type when its first translation lands. The
// build fails if a translated field is missing from the list (it would be
// silently published in English only).
//
// LEFT OUT. Placeholder products; sources that are not public, and the
// internal fields of the rest (findings, relevance); proposals, decisions,
// sourcing/, the synthetic dataset; map shapes (they ship with the pages).
//
// WHO APPROVED IT. Set by the publish workflow through the environment:
//   PUBLISH_TRIGGER=approval   approver, date, issue and PR from the newest
//                              approval in data/decisions.js
//   PUBLISH_TRIGGER=manual     PUBLISHED_BY (the GitHub login that clicked
//                              Publish now), PUBLISH_REASON, and the time now
// Unset, it is a local build: trigger "manual", by the git user, reason
// "local build".
//
// --allow-stale is for the CI dry build on pull requests: a hand-made change can
// reach a PR before i18n/content.en.json is rebuilt, and the dry build only
// proves the file can be built. The publish workflow never passes it — a stale
// content file stops a publish.
//
// Requires Node 18+. No dependencies.
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA_FILE = path.join(ROOT, "public-data", "v1", "schema.json");
const rules = require("./data-rules");
const { assemble } = require("./assemble-content");
const locale = require("./build-locale-pages");   // loads the memory and checks content.en.json

const LOCALES = ["en", ...locale.LOCALES];          // en, fr, pt

// Every field a reader sees, as a path pattern: [] = any array index,
// * = any object key. Mirrors localiseProducts/localiseSources in
// build-locale-pages.js, plus the fields shown on the page that the
// translation build does not reach yet (they carry English in fr/pt until it
// does, and keep their type when it does).
const TEXT_PATHS = {
  products: [
    "stages[]",
    "stageInfo[].what", "stageInfo[].who", "stageInfo[].stall", "stageInfo[].source",
    "glossary.*",
    "changelog[].plain",
    "products[].classLabel", "products[].flag", "products[].barrier", "products[].note", "products[].next",
    "products[].acknowledgement",
    "products[].stages[].note", "products[].stages[].next",
    "products[].stages[].date", "products[].stages[].nextDate",
    "products[].detail.useCase", "products[].detail.access[]", "products[].detail.adoption[]",
    "products[].detail.research.question", "products[].detail.research.lead",
    "products[].detail.research.geographies", "products[].detail.research.timeline",
    "products[].detail.price.note", "products[].detail.volumeNote",
    "products[].detail.volume.total", "products[].detail.volume.period", "products[].detail.volume.split[].channel",
    "products[].detail.volume.byPresentation[].label", "products[].detail.volume.coursesRule",
    "products[].detail.procurement.presentations[]",
    "products[].detail.milestones[].milestone", "products[].detail.milestones[].label",
    "products[].detail.milestones[].next", "products[].detail.milestones[].date",
    "products[].detail.milestones[].anticipated",
    "products[].detail.journey[].label",
  ],
  sources: ["sources[].label", "sources[].title", "sources[].plain", "sources[].alsoSee[].label"],
  // country names, from i18n/country-names.json (CLDR) through build-locale-pages.js
  treatmentPolicy: ["countries.*.name"],
};

// Fields of a source entry that are published; findings and relevance are the
// registry's own internal notes (its header says so).
// dataUrl (12 Oct 2026): the address a fetcher reads, an added optional field
// (allowed in v1, public-data/README.md "Change rules"); never translated.
const SOURCE_FIELDS = ["id", "title", "label", "org", "category", "group", "url", "dataUrl", "alsoSee", "year", "products", "plain", "collection"];

const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const OUT = path.resolve(ROOT, argOf("--out") || path.join("dist", "dataset", "v1", "dashboard.json"));

// ---- paths -----------------------------------------------------------------
const tokens = (pattern) => pattern.replace(/\[\]/g, ".[]").split(".").filter(Boolean);
function matches(pattern, at) {
  if (pattern.length !== at.length) return false;
  return pattern.every((p, i) => p === "*" ? typeof at[i] === "string" : p === "[]" ? typeof at[i] === "number" : p === at[i]);
}
const getAt = (obj, at) => at.reduce((o, k) => (o == null ? undefined : o[k]), obj);
const show = (at) => at.map((k) => (typeof k === "number" ? `[${k}]` : "." + k)).join("").replace(/^\./, "");

// Replaces every string (or null) at a TEXT path with { en, fr, pt },
// taking each language from the localised copies at the same place.
function mergeText(en, copies, patterns, file) {
  const pats = patterns.map(tokens);
  const isText = (at) => pats.some((p) => matches(p, at));
  const seen = new Set();
  const walk = (node, at) => {
    if (typeof node === "string" || node === null) {
      if (!at.length || !isText(at)) return node;
      if (node === null) return null;
      const out = { en: node };
      for (const loc of locale.LOCALES) {
        const v = getAt(copies[loc], at);
        out[loc] = typeof v === "string" ? v : node;
      }
      return out;
    }
    if (Array.isArray(node)) return node.map((v, i) => walk(v, at.concat(i)));
    if (node && typeof node === "object") {
      const o = {};
      for (const k of Object.keys(node)) o[k] = walk(node[k], at.concat(k));
      return o;
    }
    return node;
  };
  // The drift guard: any string the localisation changed must be on the list.
  const check = (node, at) => {
    if (typeof node === "string") {
      if (isText(at)) return;
      for (const loc of locale.LOCALES) {
        if (getAt(copies[loc], at) !== node) seen.add(`${file}: ${show(at)}`);
      }
      return;
    }
    if (Array.isArray(node)) node.forEach((v, i) => check(v, at.concat(i)));
    else if (node && typeof node === "object") Object.keys(node).forEach((k) => check(node[k], at.concat(k)));
  };
  check(en, []);
  return { merged: walk(en, []), untracked: [...seen] };
}

// ---- schema check (the subset of JSON Schema public-data/v1/schema.json uses)
function validate(schema, value) {
  const errors = [];
  const resolve = (s) => (s && s.$ref ? resolve(getAt(schema, s.$ref.replace(/^#\//, "").split("/"))) : s);
  const typeOk = (t, v) => t === "integer" ? Number.isInteger(v) : t === "null" ? v === null
    : t === "array" ? Array.isArray(v) : t === "object" ? v !== null && typeof v === "object" && !Array.isArray(v)
    : typeof v === t;
  const check = (s, v, where) => {
    s = resolve(s);
    if (!s) return;
    if (s.anyOf) {
      if (!s.anyOf.some((alt) => { const before = errors.length; check(alt, v, where); const ok = errors.length === before; errors.length = before; return ok; }))
        errors.push(`${where || "(root)"}: does not match any allowed shape`);
      return;
    }
    if ("const" in s && v !== s.const) errors.push(`${where}: must be ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.includes(v)) errors.push(`${where}: ${JSON.stringify(v)} is not one of ${s.enum.join(", ")}`);
    if (s.type && ![].concat(s.type).some((t) => typeOk(t, v))) { errors.push(`${where || "(root)"}: must be ${[].concat(s.type).join(" or ")}`); return; }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      (s.required || []).forEach((k) => { if (!(k in v)) errors.push(`${where ? where + "." : ""}${k}: missing`); });
      Object.entries(s.properties || {}).forEach(([k, sub]) => { if (k in v) check(sub, v[k], `${where ? where + "." : ""}${k}`); });
    }
    if (Array.isArray(v) && s.items) v.forEach((item, i) => check(s.items, item, `${where}[${i}]`));
  };
  check(schema, value, "");
  return errors;
}

// ---- who and when ----------------------------------------------------------
function approvalInfo() {
  const trigger = process.env.PUBLISH_TRIGGER || "";
  if (trigger === "approval") {
    const got = rules.extractData(fs.readFileSync(path.join(ROOT, "data", "decisions.js"), "utf8"), "LAUNCH_DECISIONS");
    if (!got.ok) throw new Error("data/decisions.js cannot be read");
    const last = got.data.decisions.filter((d) => d.state === "approved").pop();
    if (!last) throw new Error("PUBLISH_TRIGGER=approval but data/decisions.js records no approval");
    return { approved_at: last.on, approved_by: last.by,
             approval: { trigger: "approval", issue: last.issue ?? null, pr: last.pr ?? null, reason: null } };
  }
  let by = process.env.PUBLISHED_BY || "";
  if (!by) { try { by = execSync("git config user.name", { cwd: ROOT }).toString().trim(); } catch (e) { by = "local"; } }
  return { approved_at: new Date().toISOString(), approved_by: by,
           approval: { trigger: "manual", issue: null, pr: null, reason: process.env.PUBLISH_REASON || "local build" } };
}

// The commit actually checked out — not GITHUB_SHA, which for a dispatched run
// is main as it was when the run was started, possibly older than what the
// workflow checked out.
function commitOf() {
  try { return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); }
  catch (e) { return process.env.GITHUB_SHA || "unknown"; }
}

// ---- build -----------------------------------------------------------------
function build() {
  const copies = (rel, fn) => {
    const out = { en: locale.readData(rel) };
    for (const loc of locale.LOCALES) out[loc] = fn(locale.readData(rel), loc);
    return out;
  };
  const P = copies("data/products.js", locale.localiseProducts);
  const S = copies("data/sources.js", locale.localiseSources);
  const products = mergeText(P.en, P, TEXT_PATHS.products, "data/products.js");
  const sources = mergeText(S.en, S, TEXT_PATHS.sources, "data/sources.js");
  const tpRaw = rules.extractData(fs.readFileSync(path.join(ROOT, "data", "treatment-policy.js"), "utf8"), "LAUNCH_TREATMENT_POLICY");
  if (!tpRaw.ok) throw new Error("data/treatment-policy.js cannot be read");
  const TPc = { en: tpRaw.data };
  for (const loc of locale.LOCALES) TPc[loc] = locale.localiseTreatmentPolicy(JSON.parse(JSON.stringify(tpRaw.data)), loc);
  const policy = mergeText(TPc.en, TPc, TEXT_PATHS.treatmentPolicy, "data/treatment-policy.js");
  const untracked = products.untracked.concat(sources.untracked, policy.untracked);

  const D = products.merged;
  const publicSources = (sources.merged.sources || []).filter((s, i) => (S.en.sources[i] || {}).public)
    .map((s) => Object.fromEntries(SOURCE_FIELDS.filter((k) => k in s).map((k) => [k, s[k]])));

  const meta = D.meta || {};
  const dataset = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    ...approvalInfo(),
    pipeline_commit: commitOf(),
    content_hash: assemble().contentHash,
    locales: LOCALES,
    data_status: meta.dataStatus,
    last_updated: meta.lastUpdated,
    source_coverage: publicSources.map((s) => ({ id: s.id, label: s.label || s.title || null, url: s.url ?? null, collection: s.collection })),
    data: {
      host: meta.host,
      stages: D.stages,
      stageColumns: D.stageColumns,
      stageInfo: (D.stageInfo || []).map((x) => ({ what: x.what, who: x.who, stall: x.stall, source: x.source })),
      // numbers only (no text to localise); left out when the data has none
      ...(D.yardstick ? { yardstick: { wholeYears: D.yardstick.wholeYears, expected: D.yardstick.expected } } : {}),
      glossary: D.glossary,
      changelog: (D.changelog || []).map((c) => ({ date: c.date, product: c.product, plain: c.plain === undefined ? null : c.plain })),
      products: (D.products || []).filter((p) => !p.placeholder),
      treatmentPolicy: policy.merged,
      sources: publicSources,
    },
  };
  return { dataset, untracked };
}

// ---- one file per language -------------------------------------------------
// The dataset in one language: every text ({ en, fr, pt }, exactly the keys in
// `locales`) becomes its `loc` string, or the English where that is empty;
// `locales` becomes `locale`. The same rule as the React version's localize()
// (launch-rbm-test lib/dataset.ts), whose tests prove a language file gives
// the page exactly what the combined file does. The envelope is unchanged, so
// the four files of one build share generated_at and content_hash.
function forLocale(dataset, loc) {
  const locs = dataset.locales;
  const isText = (v) => v !== null && typeof v === "object" && !Array.isArray(v) &&
    typeof v.en === "string" && Object.keys(v).every((k) => locs.includes(k));
  const pick = (v) => {
    if (Array.isArray(v)) return v.map(pick);
    if (isText(v)) return v[loc] || v.en;
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pick(x)]));
    return v;
  };
  const out = {};
  for (const [k, v] of Object.entries(dataset)) {
    if (k === "locales") out.locale = loc;
    else out[k] = k === "source_coverage" || k === "data" ? pick(v) : v;
  }
  return out;
}

// The contract of a language file, worked out from schema.json rather than
// kept as a second hand-written file that could drift from it: every
// $defs/text becomes a string, and `locales` becomes `locale`.
function langSchema(schema) {
  const s = JSON.parse(JSON.stringify(schema));
  const langs = schema.properties.locales.items.enum;
  s.$id = schema.$id.replace(/schema\.json$/, "schema.lang.json");
  s.title = `${schema.title}, one language`;
  s.description = "One language of dashboard.json: dashboard.<locale>.json, for a site that loads one file per language. " +
    "The same fields as schema.json, except that every text is a plain string in this file's language (the English " +
    "where no translation exists yet) and `locales` is `locale`. Built from the same data at the same time as " +
    "dashboard.json, so generated_at and content_hash match. Generated from schema.json by scripts/build-dataset.js.";
  s.required = schema.required.map((k) => (k === "locales" ? "locale" : k));
  s.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => (k === "locales"
    ? ["locale", { enum: langs, description: "This file's language." }]
    : [k, v])));
  s.$defs.text = { type: "string", description: "A text a reader sees, in this file's language: the English where no translation exists yet." };
  return s;
}

// dashboard.json → dashboard.fr.json, beside it
const langFile = (out, loc) => out.replace(/\.json$/, `.${loc}.json`);

// Counts the text fields and how many still read the same as the English.
function coverage(dataset) {
  const out = { text: 0 };
  locale.LOCALES.forEach((l) => { out[l] = 0; });
  const walk = (n) => {
    if (n && typeof n === "object" && !Array.isArray(n) && typeof n.en === "string" && locale.LOCALES.every((l) => typeof n[l] === "string")) {
      if (!n.en.trim()) return;
      out.text++;
      locale.LOCALES.forEach((l) => { if (n[l] !== n.en) out[l]++; });
      return;
    }
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") Object.values(n).forEach(walk);
  };
  walk(dataset.data);
  return out;
}

function main() {
  const { dataset, untracked } = build();
  const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf8"));
  const errors = validate(schema, dataset);
  untracked.forEach((u) => errors.push(`translated but not published as text (add it to TEXT_PATHS): ${u}`));
  const lSchema = langSchema(schema);
  const perLocale = dataset.locales.map((loc) => [loc, forLocale(dataset, loc)]);
  for (const [loc, file] of perLocale) validate(lSchema, file).forEach((e) => errors.push(`dashboard.${loc}.json: ${e}`));
  if (errors.length) {
    console.error(`\n  dashboard.json NOT written — ${errors.length} problem(s):`);
    errors.slice(0, 40).forEach((e) => console.error("    " + e));
    console.error("");
    process.exit(1);
  }
  const body = JSON.stringify(dataset, null, 2) + "\n";
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body, "utf8");
  const sizes = perLocale.map(([loc, file]) => {
    const b = JSON.stringify(file, null, 2) + "\n";
    fs.writeFileSync(langFile(OUT, loc), b, "utf8");
    return `${loc} ${Math.round(b.length / 1024)} KB`;
  });
  fs.writeFileSync(path.join(path.dirname(OUT), "schema.lang.json"), JSON.stringify(lSchema, null, 2) + "\n", "utf8");
  const c = coverage(dataset);
  const pct = (n) => (c.text ? Math.round((n / c.text) * 100) : 0);
  console.log(`\n  dashboard.json  ${path.relative(ROOT, OUT)}  (${Math.round(body.length / 1024)} KB)`);
  console.log(`  ${dataset.data.products.length} products · ${dataset.data.sources.length} public sources · ${c.text} text fields`);
  console.log(`  translated: ${locale.LOCALES.map((l) => `${l} ${c[l]} (${pct(c[l])}%)`).join(" · ")} — the rest carry the English`);
  console.log(`  ${dataset.approval.trigger === "approval" ? `approval #${dataset.approval.issue}` : "manual"} by ${dataset.approved_by} · ${dataset.approved_at}`);
  console.log(`  one file per language: ${sizes.join(" · ")}, with schema.lang.json`);
  console.log(`  schema v${dataset.schema_version}: valid\n`);
}

module.exports = { build, validate, mergeText, TEXT_PATHS, coverage, forLocale, langSchema, langFile };
if (require.main === module) main();
