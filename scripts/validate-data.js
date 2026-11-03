#!/usr/bin/env node
// Validates data/products.js (or another data file passed as the first
// argument, e.g. the synthetic development set). Run after every data edit:
//   node scripts/validate-data.js
//   node scripts/validate-data.js data/products.synthetic.js
// Exits 1 on any error (bad JSON, broken rules); prints warnings for
// missing provenance. Rules are the governance of the dashboard — a
// traffic light must never be able to lie silently.
//
// The rules themselves live in scripts/data-rules.js, so that the browser
// data editor can enforce exactly the same ones without a second copy. This
// file is only the command-line wrapper: reading, printing and the exit code.

const fs = require("fs");
const path = require("path");
const rules = require("./data-rules.js");

const FILE = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(__dirname, "..", "data", "products.js");

// ---- extract the strict-JSON body -----------------------------------------
const extracted = rules.extractData(fs.readFileSync(FILE, "utf8"));
if (!extracted.ok) {
  if (extracted.reason === "no-marker") {
    console.error(`ERROR: could not find \`window.LAUNCH_DATA = { ... }\` at a line start in ${path.relative(process.cwd(), FILE)}`);
  } else {
    console.error("ERROR: data body is not strict JSON — " + extracted.message);
    console.error("Check for single quotes, trailing commas, or comments inside the object.");
  }
  process.exit(1);
}

// ---- the product data contract ----------------------------------------------
const found = rules.checkData(extracted.data);
const errors = found.errors;
const warnings = found.warnings;

// ---- single global files ----------------------------------------------------
// Runs only on the default (real) invocation: these are single global files,
// not one per product data file, so re-checking them on the synthetic run
// would only double the output. The rules need the file contents, which is
// this wrapper's job to supply.
if (!process.argv[2]) {
  const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

  // ---- the source registry -------------------------------------------------
  // Product ids are passed through so a source cannot cite a medicine that no
  // longer exists.
  const SRC = path.join(__dirname, "..", "data", "sources.js");
  const rawSrc = rules.extractData(fs.readFileSync(SRC, "utf8"), "LAUNCH_SOURCES");
  if (!rawSrc.ok) {
    errors.push(rawSrc.reason === "no-marker"
      ? "sources: could not find `window.LAUNCH_SOURCES = { ... }` at a line start in data/sources.js"
      : "sources: data/sources.js is not strict JSON — " + rawSrc.message);
  } else {
    const ids = (extracted.data.products || []).map((p) => p.id);
    const srcFound = rules.checkSources(rawSrc.data, ids);
    errors.push(...srcFound.errors);
    warnings.push(...srcFound.warnings);

    // Country access map citations must point at registry entries that the
    // Sources footer shows, so every source the map uses is listed publicly.
    const byId = new Map((rawSrc.data.sources || []).map((s) => [s.id, s]));
    (extracted.data.products || []).forEach((p) => {
      const list = ((p.detail || {}).countries || {}).list || [];
      list.forEach((e) => (e.sources || []).forEach((sid) => {
        const s = byId.get(sid);
        if (!s) errors.push(`product ${p.id}: countries ${e.iso3} cites "${sid}", which is not in data/sources.js`);
        else if (!s.public) errors.push(`product ${p.id}: countries ${e.iso3} cites "${sid}", which is not public in data/sources.js`);
      }));
      // Citations on individual claims (15 Oct feedback, 19 Oct 2026): a
      // stage's, a milestone's or the volume's "sources" are registry ids the
      // page links to, so each must be public in data/sources.js.
      const d = p.detail || {};
      const cited = [];
      (p.stages || []).forEach((st, i) => cited.push([`stages[${i}]`, st.sources]));
      (d.milestones || []).forEach((m, i) => cited.push([`milestones[${i}]`, m.sources]));
      if (d.volume) cited.push(["volume", d.volume.sources]);
      cited.forEach(([at, ids]) => {
        if (ids === undefined) return;
        if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) { errors.push(`product ${p.id}: ${at}.sources must be an array of data/sources.js ids`); return; }
        ids.forEach((sid) => {
          const s = byId.get(sid);
          if (!s) errors.push(`product ${p.id}: ${at} cites "${sid}", which is not in data/sources.js`);
          else if (!s.public) errors.push(`product ${p.id}: ${at} cites "${sid}", which is not public in data/sources.js`);
        });
      });
      // The hand-kept counts in detail.country must be the list's own counts,
      // so no view can show a headline that the country records do not support
      // (feedback, 15 Oct 2026). Since 3 Nov 2026 each stage is counted on its
      // own, as the page's countryStages() does for the map's three views
      // (Dale's tracker): registered = at "registered" or citing a national
      // register; guidelines = at "guidelines" or citing a policy/guidelines
      // source; mft = at "mft". A country can count in more than one.
      const country = (p.detail || {}).country;
      if (list.length && country) {
        const cites = (e, cat) => (e.sources || []).some((sid) => (byId.get(sid) || {}).category === cat);
        const has = {
          registered: (e) => e.level === "registered" || cites(e, "National register"),
          guidelines: (e) => e.level === "guidelines" || cites(e, "Policy / guidelines"),
          mft: (e) => e.level === "mft"
        };
        [["registered", "registered"], ["inGuidelines", "guidelines"], ["inMft", "mft"]].forEach(([k, lvl]) => {
          const n = list.filter(has[lvl]).length;
          if (country[k] !== n)
            errors.push(`product ${p.id}: detail.country.${k} is ${JSON.stringify(country[k])}, but the countries list has ${n} with a source for "${lvl}"`);
        });
      }
    });
  }

  // ---- WHO national treatment policy (the "Show MFT policy" switch) --------
  // One global file again, so the real run only. Product ids are passed
  // through because the page looks the policy up by product id.
  const TP = path.join(__dirname, "..", "data", "treatment-policy.js");
  const tp = rules.checkTreatmentPolicy(Object.assign(
    { worldMap: read("data/world-map.js"), productIds: (extracted.data.products || []).map((p) => p.id) },
    fs.existsSync(TP) ? { source: fs.readFileSync(TP, "utf8") } : { missing: true }
  ));
  errors.push(...tp.errors);
  warnings.push(...tp.warnings);
}

// ---- report -----------------------------------------------------------------
for (const w of warnings) console.log("WARN  " + w);
for (const e of errors) console.log("ERROR " + e);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
if (errors.length) {
  console.log("Fix the errors above before committing — the dashboard must not publish inconsistent data.");
  process.exit(1);
}
console.log("Data file is valid.");
