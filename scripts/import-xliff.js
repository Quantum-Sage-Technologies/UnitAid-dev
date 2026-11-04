#!/usr/bin/env node
// Brings professional translators' XLIFF 1.2 files into the translation memory
// (i18n/translations.json), and keeps a record of what they delivered.
//
//   node scripts/import-xliff.js <file.xlf> [<file.xlf> ...]            # import, and record
//   node scripts/import-xliff.js <file.xlf> ... --check                 # what would change; writes nothing
//   node scripts/import-xliff.js <file.xlf> ... --record-date 2026-11-04
//
// WHAT. Each <trans-unit> carries the English in <source> and the translation
// in <target>. Its id is key(English) (scripts/i18n-hash.js), the key of the
// string's entry in the memory, so a unit lands on exactly the string it was
// made from. The page's own code inside a string (${…}, or {name} in the
// interface text) travels as <ph> tags, and goes back as it came.
//
// WHY THE MEMORY. The translate bot only fills a language that is empty
// (scripts/translate-strings.js, rule 1), so a translator's text written there
// is never replaced by the engine. The pages, the published dataset and the
// RBM message files all read their French and Portuguese from the memory.
//
// It stops, and writes nothing, when a file is not XLIFF 1.2, its
// target-language is not French or Portuguese, a unit's id is not key(its
// English), a target is missing or empty, or a target lost, added or changed
// a <ph> tag. A unit whose English is no longer in i18n/content.en.json (it
// was reworded since the export) is listed and left out: its translation is
// of words the page no longer shows. export-xliff.js puts such strings in the
// next file for the translators.
//
// THE RECORD. Each import copies the files into i18n/translator/<date>/ and
// writes imported.json there: per file its sha256, language and counts, and
// per key the text that was imported. That says which lines a person wrote,
// and running this script on the copies puts their text back if the memory
// was ever overwritten. export-xliff.js reads every record to leave those
// lines out of the next file.
//
// Requires Node 18+. No dependencies.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { key } = require("./i18n-hash");

const ROOT = path.resolve(__dirname, "..");
const MEM = path.join(ROOT, "i18n", "translations.json");
const CONTENT = path.join(ROOT, "i18n", "content.en.json");
const RECORDS = path.join(ROOT, "i18n", "translator");
const UI = path.join(ROOT, "i18n", "ui.en.json");
const FORMS = path.join(ROOT, "i18n", "ui.page-forms.json");
// XLIFF target-language → the memory's locale. Portuguese is Brazilian.
const LANGUAGES = { fr: "fr", "fr-fr": "fr", pt: "pt", "pt-br": "pt" };

const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const unescapeXml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// "Reached in <ph id="1">${y}</ph>" → { text: "Reached in ${y}", phs: ["${y}"] }
function inline(xml, where, errors) {
  const phs = [];
  const marked = xml.replace(/<ph\b[^>]*>([\s\S]*?)<\/ph>/g, (_, code) => {
    phs.push(unescapeXml(code));
    return `\u0000${phs.length - 1}\u0000`;
  });
  if (/<[A-Za-z/]/.test(marked)) errors.push(`${where}: markup other than <ph> (${marked.match(/<[^>]*>/)[0]})`);
  const text = unescapeXml(marked).replace(/\u0000(\d+)\u0000/g, (_, i) => phs[i]);
  return { text, phs };
}

// One XLIFF 1.2 file → { language, units: [{ id, resname, group, source, target, srcPhs, tgtPhs }] }
function parseXliff(xml, name = "file", errors = []) {
  if (!/<xliff\b[^>]*version="1\.2"/.test(xml)) errors.push(`${name}: not an XLIFF 1.2 file`);
  const language = ((xml.match(/<file\b[^>]*target-language="([^"]+)"/) || [])[1] || "").toLowerCase();
  const units = [];
  // the group a unit sits in, for the messages: the last <group resname> opened before it
  const groups = [...xml.matchAll(/<group\b[^>]*resname="([^"]*)"/g)].map((g) => ({ at: g.index, name: unescapeXml(g[1]) }));
  let gi = -1;
  const unitRe = /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g;
  let m;
  while ((m = unitRe.exec(xml))) {
    const attr = (n) => (m[1].match(new RegExp(`\\b${n}="([^"]*)"`)) || [])[1];
    const id = attr("id"), resname = attr("resname") || id, where = `${name} ${resname}`;
    while (gi + 1 < groups.length && groups[gi + 1].at < m.index) gi++;
    const group = gi >= 0 ? groups[gi].name : "";
    const src = m[2].match(/<source>([\s\S]*?)<\/source>/);
    const tgt = m[2].match(/<target\b[^>]*>([\s\S]*?)<\/target>/);
    if (!src) { errors.push(`${where}: no <source>`); continue; }
    const s = inline(src[1], where, errors);
    const t = tgt ? inline(tgt[1], where, errors) : { text: "", phs: [] };
    units.push({ id, resname, group, source: s.text, target: t.text, srcPhs: s.phs, tgtPhs: t.phs });
  }
  return { language, units };
}

// What importing these files would do to the memory. files: [{ name, xml }].
function plan(files, content, memory) {
  const errors = [], current = new Map(content.text.map((e) => [e.key, e]));
  const changes = [], stale = [], perFile = [];
  for (const f of files) {
    const { language, units } = parseXliff(f.xml, f.name, errors);
    const loc = LANGUAGES[language];
    if (!loc) { errors.push(`${f.name}: target-language "${language}" is not French or Portuguese`); continue; }
    const counts = { name: f.name, language, locale: loc, units: units.length, imported: 0, unchanged: 0, stale: 0 };
    for (const u of units) {
      const where = `${f.name} ${u.resname}`;
      if (key(u.source) !== u.id) { errors.push(`${where}: its id is not key(its English); the file was edited or made from other text`); continue; }
      if (!u.target.trim()) { errors.push(`${where}: no translation`); continue; }
      if ([...u.srcPhs].sort().join("\u0001") !== [...u.tgtPhs].sort().join("\u0001")) {
        errors.push(`${where}: the tags differ, English ${JSON.stringify(u.srcPhs)}, translation ${JSON.stringify(u.tgtPhs)}`);
        continue;
      }
      if (!current.has(u.id)) { counts.stale++; stale.push({ ...u, locale: loc, file: f.name }); continue; }
      const before = memory.entries[u.id] && memory.entries[u.id][loc];
      if (before === u.target) counts.unchanged++; else counts.imported++;
      changes.push({ key: u.id, locale: loc, before, after: u.target, resname: u.resname });
    }
    perFile.push(counts);
  }
  return { errors, changes, stale, perFile };
}

// THE PAGE'S SENTENCES. A React message with {placeholders} has its own
// English ("Stage {n} of {total}") and so its own memory entry, but the page
// says the same sentence with its code in it ("Stage ${stepNo(i)} of
// ${STAGE_COLUMNS.length}", its page form in i18n/ui.page-forms.json). When a
// translator delivered that page sentence, the message takes the same words:
// each hole back to the message's {name}. Taken only when the result holds
// exactly the message's placeholders. Messages the page joins from pieces
// ("parts") are left to the translators.
// translated: { [pageKey]: { fr?, pt? } } — every translator text known
// (this import's and the records'). Returns [{ key, locale, after, from, message }].
function derive(ui, forms, translated, memory) {
  const out = [];
  const walk = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (k.startsWith("_") ? [] : typeof v === "object" ? walk(v, `${p}${k}.`) : [[p + k, v]]));
  const names = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const [message, en] of walk(ui)) {
    const form = forms[message];
    if (!/\{\w+\}/.test(en) || !form || typeof form.page !== "string") continue;
    const from = key(form.page), delivered = translated[from];
    if (!delivered) continue;
    for (const loc of ["fr", "pt"]) {
      if (!delivered[loc]) continue;
      let text = delivered[loc];
      for (const [hole, name] of Object.entries(form.holes || {})) text = text.split(hole).join(name);
      if (text.includes("${") || names(text) !== names(en)) continue;
      const before = memory.entries[key(en)] && memory.entries[key(en)][loc];
      out.push({ key: key(en), locale: loc, before, after: text, from, message });
    }
  }
  return out;
}

// The memory with the changes applied; a missing entry is made from content.en.json.
function apply(memory, changes, content) {
  const current = new Map(content.text.map((e) => [e.key, e]));
  const out = { ...memory, entries: { ...memory.entries } };
  for (const c of changes) {
    const e = current.get(c.key);
    out.entries[c.key] = { ...(out.entries[c.key] || { en: e.en, where: e.where, bucket: e.bucket }), [c.locale]: c.after };
  }
  return out;
}

// Written as scripts/translate-strings.js writes it: keys sorted, two-space indent.
function serialiseMemory(mem) {
  const ordered = {};
  for (const k of Object.keys(mem.entries).sort()) ordered[k] = mem.entries[k];
  const { schema, targets, entries, ...rest } = mem;
  return JSON.stringify({ schema, ...(targets ? { targets } : {}), ...rest, entries: ordered }, null, 2) + "\n";
}

const today = () => new Date().toISOString().slice(0, 10);

function main(args = process.argv.slice(2), given = {}) {
  const paths = { MEM, CONTENT, RECORDS, UI, FORMS, ...given };
  const check = args.includes("--check");
  const dateAt = args.indexOf("--record-date");
  const date = dateAt >= 0 ? args[dateAt + 1] : today();
  const names = args.filter((a, i) => !a.startsWith("--") && !(dateAt >= 0 && i === dateAt + 1));
  if (!names.length || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("\n  usage: node scripts/import-xliff.js <file.xlf> [...] [--check] [--record-date YYYY-MM-DD]\n");
    return 1;
  }
  const files = names.map((n) => ({ name: path.basename(n), path: n, buf: fs.readFileSync(n) }));
  files.forEach((f) => (f.xml = f.buf.toString("utf8")));
  const content = JSON.parse(fs.readFileSync(paths.CONTENT, "utf8"));
  const memory = JSON.parse(fs.readFileSync(paths.MEM, "utf8"));
  const r = plan(files, content, memory);

  if (r.errors.length) {
    console.error("\n  The files cannot be imported:");
    r.errors.slice(0, 40).forEach((e) => console.error(`    ${e}`));
    if (r.errors.length > 40) console.error(`    … ${r.errors.length - 40} more`);
    console.error("  Nothing written.\n");
    return 1;
  }
  console.log("");
  for (const c of r.perFile) {
    console.log(`  ${c.name} (${c.language} → ${c.locale}): ${c.units} units · ${c.imported} new or changed · ${c.unchanged} already the same · ${c.stale} no longer in the English`);
  }
  if (r.stale.length) {
    console.log("\n  Left out, the English was reworded since the export (export-xliff.js offers the new wording):");
    const seen = new Set();
    for (const s of r.stale) if (!seen.has(s.id)) { seen.add(s.id); console.log(`    ${s.resname} [${s.group}] ${JSON.stringify(s.source.length > 70 ? s.source.slice(0, 70) + "…" : s.source)}`); }
  }
  // the page's sentences: every translator text known, the records' and this import's
  const dir = path.join(paths.RECORDS, date);
  const translated = {};
  const add = (k, loc, text) => { translated[k] = { ...(translated[k] || {}), [loc]: text }; };
  if (fs.existsSync(paths.RECORDS)) {
    for (const d of fs.readdirSync(paths.RECORDS).sort()) {
      const f = path.join(paths.RECORDS, d, "imported.json");
      if (fs.existsSync(f)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(f, "utf8")).entries || {})) for (const [loc, t] of Object.entries(v)) add(k, loc, t);
    }
  }
  for (const c of r.changes) add(c.key, c.locale, c.after);
  const derived = derive(JSON.parse(fs.readFileSync(paths.UI, "utf8")), JSON.parse(fs.readFileSync(paths.FORMS, "utf8")).forms, translated, apply(memory, r.changes, content));
  const derivedChanged = derived.filter((d) => d.before !== d.after).length;
  console.log(`\n  React messages that say a delivered page sentence: ${derived.length} values (${derivedChanged} new or changed)`);
  if (check) { console.log("\n  --check: nothing written.\n"); return 0; }

  fs.writeFileSync(paths.MEM, serialiseMemory(apply(memory, [...r.changes, ...derived], content)), "utf8");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    const to = path.join(dir, f.name);
    if (path.resolve(f.path) !== path.resolve(to)) fs.writeFileSync(to, f.buf);
  }
  const recordFile = path.join(dir, "imported.json");
  const before = fs.existsSync(recordFile) ? JSON.parse(fs.readFileSync(recordFile, "utf8")) : { files: [], entries: {} };
  const record = {
    note: "Translations delivered by professional translators and imported by scripts/import-xliff.js. entries: the text imported, per key (key(English), as in i18n/translations.json) and language.",
    date,
    files: [...before.files.filter((x) => !files.some((f) => f.name === x.name)),
      ...r.perFile.map((c) => ({ ...c, sha256: sha256(files.find((f) => f.name === c.name).buf) }))],
    entries: { ...before.entries },
  };
  for (const c of r.changes) record.entries[c.key] = { ...(record.entries[c.key] || {}), [c.locale]: c.after };
  const sorted = {};
  for (const k of Object.keys(record.entries).sort()) sorted[k] = record.entries[k];
  record.entries = sorted;
  // derived: the React messages that took a page sentence's words, and from which key
  const deriv = { ...(before.derived || {}) };
  for (const d of derived) deriv[d.key] = { ...(deriv[d.key] || {}), message: d.message, from: d.from, [d.locale]: d.after };
  record.derived = Object.fromEntries(Object.keys(deriv).sort().map((k) => [k, deriv[k]]));
  fs.writeFileSync(recordFile, JSON.stringify(record, null, 2) + "\n", "utf8");
  console.log(`\n  wrote ${rel(paths.MEM)} (${r.changes.length - r.perFile.reduce((n, c) => n + c.unchanged, 0) + derivedChanged} values changed)`);
  console.log(`  recorded in ${rel(dir)}/ (${Object.keys(record.entries).length} keys, ${Object.keys(record.derived).length} derived)\n`);
  return 0;
}

module.exports = { parseXliff, plan, derive, apply, serialiseMemory, main, LANGUAGES, RECORDS };
if (require.main === module) process.exitCode = main();
