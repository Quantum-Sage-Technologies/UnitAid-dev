#!/usr/bin/env node
// Tests for scripts/import-xliff.js and scripts/export-xliff.js — the
// translators' XLIFF files in and out of the translation memory.
//   node scripts/test-xliff.js
// The repository's own files are read, never written: the export of every
// string reads back as the same English and key, and the memory is written in
// the translate bot's own format. Then made-up files prove what an import
// takes, refuses and leaves out, and main() runs in a temporary folder to
// prove what it writes and records.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { key } = require("./i18n-hash");
const { parseXliff, plan, derive, serialiseMemory, main: importMain } = require("./import-xliff");
const { holes, sourceXml, pending, xliff, main: exportMain } = require("./export-xliff");

let passed = 0, failed = 0;
const ok = (c, name) => { if (c) passed++; else { failed++; console.log("  FAIL " + name); } };
const quiet = (fn) => { const e = console.error, l = console.log; let out = ""; console.error = console.log = (s) => { out += s + "\n"; }; try { return { code: fn(), out }; } finally { console.error = e; console.log = l; } };
const ROOT = path.resolve(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const content = read("i18n/content.en.json"), memory = read("i18n/translations.json");

// ---------------------------------------------------------------------------
// 1. the repository's own files
// ---------------------------------------------------------------------------
// The bot's format: keys sorted, two-space indent. (The file itself may hold
// an entry added by hand out of order; the bot's next save sorts it too.)
const written = serialiseMemory(memory), reread = JSON.parse(written);
ok(JSON.stringify(reread) === JSON.stringify({ ...memory, entries: Object.fromEntries(Object.keys(memory.entries).sort().map((k) => [k, memory.entries[k]])) })
   && written === JSON.stringify(reread, null, 2) + "\n",
   "the memory is written as the translate bot writes it: same content, keys sorted");
for (const loc of ["fr", "pt"]) {
  const list = pending(content, memory, { fr: new Set(), pt: new Set() }, loc);
  const back = parseXliff(xliff(list, memory, loc), loc);
  ok(back.units.length === list.length && back.units.every((u) => key(u.source) === u.id),
     `${loc}: every string exported reads back as the same English, under its key`);
  ok(back.language === (loc === "fr" ? "fr" : "pt-br"), `${loc}: the file names the language as the translators' own files do`);
}
ok(JSON.stringify(holes("Stage ${stepNo(i)} of ${n ? `${a}` : {b}}, {count} left")) === JSON.stringify([[6, 18], [22, 41], [43, 50]]),
   "holes: ${…} with nested braces, and {name}");
ok(sourceXml("R&D <b> ${x}") === 'R&amp;D &lt;b&gt; <ph id="1">${x}</ph>', "sourceXml escapes the text, and wraps the code in <ph>");

// ---------------------------------------------------------------------------
// 2. made-up files
// ---------------------------------------------------------------------------
const e1 = content.text.find((e) => /\$\{/.test(e.en)), e2 = content.text.find((e) => !/[${}]/.test(e.en) && e.en.length > 20);
const file = (lang, units) => `<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="x" source-language="en" target-language="${lang}"><body><group resname="G">${units.join("")}</group></body></file></xliff>`;
const unit = (id, src, tgt) => `<trans-unit id="${id}" resname="R-${id.slice(0, 4)}"><source>${src}</source>${tgt == null ? "" : `<target>${tgt}</target>`}</trans-unit>`;
const tr = (s) => "[T] " + s;
const good = [unit(e1.key, sourceXml(e1.en), tr(sourceXml(e1.en))), unit(e2.key, sourceXml(e2.en), tr(sourceXml(e2.en)))];
const stale = unit(key("Words the page no longer shows"), "Words the page no longer shows", "Des mots");

let r = plan([{ name: "a.xlf", xml: file("fr", [...good, stale]) }], content, memory);
ok(!r.errors.length && r.changes.length === 2 && r.stale.length === 1 && r.changes.every((c) => c.locale === "fr"),
   "a good file: two translations taken, the reworded string left out");
ok(r.changes.find((c) => c.key === e1.key).after === tr(e1.en), "the code inside a string comes back as it went");
r = plan([{ name: "a.xlf", xml: file("pt-BR", good) }], content, memory);
ok(!r.errors.length && r.changes.every((c) => c.locale === "pt"), "pt-BR goes to the memory's pt (Brazilian)");
const refused = [
  [file("de", good), "is not French or Portuguese", "another language"],
  [file("fr", [unit("0000000000000000", sourceXml(e2.en), "x")]), "is not key(its English)", "an id that is not key(English)"],
  [file("fr", [unit(e2.key, sourceXml(e2.en), null)]), "no translation", "a unit with no target"],
  [file("fr", [unit(e2.key, sourceXml(e2.en), "  ")]), "no translation", "an empty target"],
  [file("fr", [unit(e1.key, sourceXml(e1.en), "lost the tag")]), "the tags differ", "a target that lost a tag"],
  [file("fr", [unit(e2.key, sourceXml(e2.en), "<g id=\"1\">x</g>")]), "markup other than <ph>", "markup other than <ph>"],
  ["<xliff version=\"2.0\"></xliff>", "not an XLIFF 1.2 file", "XLIFF 2.0"],
];
for (const [xml, says, what] of refused) {
  const p = plan([{ name: "b.xlf", xml }], content, memory);
  ok(p.errors.some((e) => e.includes(says)), `refused: ${what}`);
}

// the page's sentences: a React message takes a delivered page sentence's words
{
  const ui = read("i18n/ui.en.json"), forms = read("i18n/ui.page-forms.json").forms;
  const [message, form] = Object.entries(forms).find(([, f]) => typeof f.page === "string" && Object.keys(f.holes || {}).length >= 2);
  const en = message.split(".").reduce((o, k) => o[k], ui);
  const filled = (text) => Object.entries(form.holes).reduce((t, [hole, name]) => t.split(hole).join(name), text);
  let d = derive(ui, forms, { [key(form.page)]: { fr: "[T] " + form.page } }, memory).filter((x) => x.message === message);
  ok(d.length === 1 && d[0].key === key(en) && d[0].locale === "fr" && d[0].after === filled("[T] " + form.page),
     `derive: ${message} takes the page sentence's words, each hole back to its {name}`);
  const lost = Object.keys(form.holes)[0];
  d = derive(ui, forms, { [key(form.page)]: { fr: "[T] " + form.page.split(lost).join("") } }, memory).filter((x) => x.message === message);
  ok(d.length === 0, "derive: a page sentence that lost a hole gives the message nothing");
}

// ---------------------------------------------------------------------------
// 3. main() in a temporary folder
// ---------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xliff-"));
const paths = { MEM: path.join(tmp, "translations.json"), CONTENT: path.join(ROOT, "i18n/content.en.json"), RECORDS: path.join(tmp, "translator") };
fs.writeFileSync(paths.MEM, serialiseMemory(memory));
const xlf = path.join(tmp, "in_FRA.xlf");
fs.writeFileSync(xlf, file("fr", [...good, stale]));
const memBefore = fs.readFileSync(paths.MEM, "utf8");

let run = quiet(() => importMain([xlf, "--check", "--record-date", "2026-11-04"], paths));
ok(run.code === 0 && fs.readFileSync(paths.MEM, "utf8") === memBefore && !fs.existsSync(paths.RECORDS), "--check writes nothing");
run = quiet(() => importMain([xlf, "--record-date", "2026-11-04"], paths));
const after = JSON.parse(fs.readFileSync(paths.MEM, "utf8"));
ok(run.code === 0 && after.entries[e1.key].fr === tr(e1.en) && after.entries[e2.key].fr === tr(e2.en), "the memory holds the translators' text");
ok(after.entries[e1.key].pt === memory.entries[e1.key].pt && Object.keys(after.entries).length === Object.keys(memory.entries).length,
   "nothing else in the memory changes");
const rec = JSON.parse(fs.readFileSync(path.join(paths.RECORDS, "2026-11-04", "imported.json"), "utf8"));
ok(fs.existsSync(path.join(paths.RECORDS, "2026-11-04", "in_FRA.xlf")) && Object.keys(rec.entries).length === 2 && rec.entries[e2.key].fr === tr(e2.en)
   && rec.files[0].imported === 2 && rec.files[0].stale === 1 && /^[0-9a-f]{64}$/.test(rec.files[0].sha256),
   "the record keeps the file, its sha256 and counts, and the text imported per key");
run = quiet(() => importMain([path.join(paths.RECORDS, "2026-11-04", "in_FRA.xlf"), "--record-date", "2026-11-04"], paths));
ok(run.code === 0 && fs.readFileSync(paths.MEM, "utf8") === serialiseMemory(after) && /0 new or changed/.test(run.out),
   "importing the recorded copy again changes nothing (and would put it back if overwritten)");
const badXlf = path.join(tmp, "bad.xlf");
fs.writeFileSync(badXlf, file("fr", [unit(e1.key, sourceXml(e1.en), "lost the tag")]));
const memNow = fs.readFileSync(paths.MEM, "utf8");
run = quiet(() => importMain([badXlf, "--record-date", "2026-11-05"], paths));
ok(run.code === 1 && fs.readFileSync(paths.MEM, "utf8") === memNow && !fs.existsSync(path.join(paths.RECORDS, "2026-11-05")), "a refused file writes nothing");

const out = path.join(tmp, "out");
run = quiet(() => exportMain(["--out", out], paths));
const files = fs.readdirSync(out);
const fra = parseXliff(fs.readFileSync(path.join(out, files.find((f) => f.endsWith("_FRA.xlf"))), "utf8"));
const pt = parseXliff(fs.readFileSync(path.join(out, files.find((f) => f.endsWith("_PT-BZ.xlf"))), "utf8"));
ok(run.code === 0 && !fra.units.some((u) => u.id === e1.key || u.id === e2.key) && pt.units.some((u) => u.id === e1.key),
   "the follow-up file leaves out what a translator delivered, per language");
ok(fra.units.every((u) => u.target === ""), "the follow-up file has no targets");
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n  xliff: ${passed} passed, ${failed} failed\n`);
process.exitCode = failed ? 1 : 0;
