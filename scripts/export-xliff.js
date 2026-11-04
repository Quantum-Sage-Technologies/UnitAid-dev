#!/usr/bin/env node
// Writes XLIFF 1.2 files for professional translators: the English strings
// whose French or Portuguese no translator has delivered yet, one file per
// language, in the format scripts/import-xliff.js reads back.
//
//   node scripts/export-xliff.js --out <folder>               # LAUNCH-Dashboard-followup_<date>_{FRA,PT-BZ}.xlf
//   node scripts/export-xliff.js --out <folder> --check       # counts only; writes nothing
//
// WHICH STRINGS. Every string in i18n/content.en.json that the translate bot
// translated (it has a French or Portuguese value in i18n/translations.json;
// the bot leaves codes such as NCT numbers and gene markers alone), minus the
// ones a translator delivered: the keys in every i18n/translator/*/imported.json,
// per language. So a string reworded since the last delivery comes back, under
// its new English.
//
// HOW. Each <trans-unit> has id key(English) (scripts/i18n-hash.js), the
// English in <source> with the page's code (${…} holes, {name} placeholders)
// as <ph> tags, no <target>, and two notes: where the string appears, and the
// machine translation the page shows today, for reference.
//
// Requires Node 18+. No dependencies.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MEM = path.join(ROOT, "i18n", "translations.json");
const CONTENT = path.join(ROOT, "i18n", "content.en.json");
const RECORDS = path.join(ROOT, "i18n", "translator");
// memory locale → XLIFF target-language and file suffix, as the translators' own files
const FILES = { fr: { language: "fr", suffix: "FRA" }, pt: { language: "pt-br", suffix: "PT-BZ" } };
const NOTE = "Do not translate: the medicine names GanLum, ALAQ, ASPY and DHA-PPQ; organisation names such as WHO, EMA, MMV and the Global Fund; trial or register codes such as NCT05842954. 'TBC' means 'to be confirmed' and should be translated. Tags (placeholders) are filled in by the page with numbers, names or dates: keep every tag, you may move it within the sentence.";

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The page's code inside a string: ${…} (balanced braces) and {name}.
function holes(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "$" && text[i + 1] === "{") {
      let depth = 0, j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}" && --depth === 0) break;
      }
      if (j < text.length) { out.push([i, j + 1]); i = j; }
    } else if (text[i] === "{") {
      const m = text.slice(i).match(/^\{[A-Za-z_][A-Za-z0-9_]*\}/);
      if (m) { out.push([i, i + m[0].length]); i += m[0].length - 1; }
    }
  }
  return out;
}

// "Reached in ${y}" → "Reached in <ph id="1">${y}</ph>"
function sourceXml(text) {
  let out = "", at = 0, n = 0;
  for (const [a, b] of holes(text)) {
    out += escapeXml(text.slice(at, a)) + `<ph id="${++n}">${escapeXml(text.slice(a, b))}</ph>`;
    at = b;
  }
  return out + escapeXml(text.slice(at));
}

// keys a translator delivered, per locale, from every record
function delivered(recordsDir) {
  const done = { fr: new Set(), pt: new Set() };
  if (!fs.existsSync(recordsDir)) return done;
  for (const d of fs.readdirSync(recordsDir)) {
    const f = path.join(recordsDir, d, "imported.json");
    if (!fs.existsSync(f)) continue;
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(f, "utf8")).entries || {})) {
      for (const loc of Object.keys(done)) if (v[loc]) done[loc].add(k);
    }
  }
  return done;
}

// The area a string belongs to, for the file's groups: the first part of `where`.
const area = (e) => (e.bucket === "data" ? `Data: ${String(e.where).split(/[.[]/)[0]}` : "Website interface text");

function pending(content, memory, done, loc) {
  const seen = new Set();
  return content.text.filter((e) => {
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    const m = memory.entries[e.key];
    return m && m[loc] && m[loc] !== "" && !done[loc].has(e.key);
  });
}

function xliff(entries, memory, loc) {
  const byArea = new Map();
  for (const e of entries) {
    const a = area(e);
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a).push(e);
  }
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">',
    `  <file original="i18n/content.en.json" source-language="en" datatype="plaintext" target-language="${FILES[loc].language}">`,
    `    <header><note>${escapeXml(NOTE)}</note></header>`,
    "    <body>",
  ];
  for (const [a, list] of byArea) {
    lines.push(`      <group resname="${escapeXml(a)}">`);
    for (const e of list) {
      lines.push(`        <trans-unit id="${e.key}" resname="${e.key}" xml:space="preserve">`);
      lines.push(`          <source>${sourceXml(e.en)}</source>`);
      lines.push(`          <note>Where it appears: ${escapeXml(String(e.where))}</note>`);
      lines.push(`          <note>Machine translation shown today: ${escapeXml(memory.entries[e.key][loc])}</note>`);
      lines.push("        </trans-unit>");
    }
    lines.push("      </group>");
  }
  lines.push("    </body>", "  </file>", "</xliff>", "");
  return lines.join("\n");
}

const today = () => new Date().toISOString().slice(0, 10);

function main(args = process.argv.slice(2), paths = { MEM, CONTENT, RECORDS }) {
  const outAt = args.indexOf("--out");
  const out = outAt >= 0 ? args[outAt + 1] : null;
  const check = args.includes("--check");
  if (!out) { console.error("\n  usage: node scripts/export-xliff.js --out <folder> [--check]\n"); return 1; }
  const content = JSON.parse(fs.readFileSync(paths.CONTENT, "utf8"));
  const memory = JSON.parse(fs.readFileSync(paths.MEM, "utf8"));
  const done = delivered(paths.RECORDS);
  console.log("");
  for (const loc of Object.keys(FILES)) {
    const list = pending(content, memory, done, loc);
    const name = `LAUNCH-Dashboard-followup_${today()}_${FILES[loc].suffix}.xlf`;
    const words = list.reduce((n, e) => n + e.en.split(/\s+/).filter(Boolean).length, 0);
    console.log(`  ${loc}: ${list.length} strings (${words} English words) not yet from a translator${check ? "" : ` → ${path.join(out, name)}`}`);
    if (!check && list.length) {
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, name), xliff(list, memory, loc), "utf8");
    }
  }
  console.log(check ? "\n  --check: nothing written.\n" : "");
  return 0;
}

module.exports = { holes, sourceXml, delivered, pending, xliff, main, FILES };
if (require.main === module) process.exitCode = main();
