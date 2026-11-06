#!/usr/bin/env node
/**
 * scripts/translate-strings.js
 *
 * Translates the TEXT section of i18n/content.en.json into French and
 * Portuguese using Google Cloud Translation, and saves the results in a
 * translation memory at i18n/translations.json.
 *
 * It never reads the page or data/*.js, and never opens the VALUES section of
 * content.en.json, so figures, URLs and citations cannot reach the engine. It
 * does no hashing either: each string's key was computed once, by
 * scripts/assemble-content.js, and is read from content.en.json.
 *
 *   node scripts/translate-strings.js --dry-run          # cost, no API calls
 *   node scripts/translate-strings.js --locale=fr
 *   node scripts/translate-strings.js --locale=pt
 *
 * Two rules govern everything here:
 *
 *   1. EMPTY-LOCALE-ONLY. A locale that already holds text is never touched,
 *      whether the engine wrote it last month or a person corrected it five
 *      minutes ago. That is what makes "fix it in the source file" work with
 *      no lock flags and no state to maintain. Professional translators' text
 *      comes in the same way (scripts/import-xliff.js, recorded in
 *      i18n/translator/); a new TARGET below clears it with the rest, so
 *      import the recorded files again after one.
 *
 *   2. CONTENT-ADDRESSED. Each entry is keyed by a fingerprint of the ENGLISH,
 *      key(text) in scripts/i18n-hash.js. Edit the English and its fingerprint changes,
 *      nothing matches, and it re-translates by itself. Nobody has to keep a
 *      list of translations that went stale.
 *
 * GOOGLE_API_KEY comes from the environment. It is never committed, never read
 * from a file, and never reaches the browser.
 *
 * APPROVED_CONTENT_HASH must name the content being translated — see
 * approvalGate() below. The approval job and the translate bot set it; by hand:
 *
 *   APPROVED_CONTENT_HASH=<contentHash of i18n/content.en.json> \
 *     node scripts/translate-strings.js --locale=fr
 *
 * TRANSLATE_ENGINE=stub replaces Google with a stand-in that returns
 * "[stub-fr] <the English>", so the whole route can be exercised with no key and
 * nothing sent anywhere. A later real run overwrites stub values — the one
 * exception to rule 1, since a stub value is test output, not a translation.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { requireFresh } = require("./assemble-content");

const ROOT = path.resolve(__dirname, "..");
const MEM = path.join(ROOT, "i18n", "translations.json");
// Google's target code for each locale (Spanish, "es", was removed on 27 Oct 2026).
// Portuguese is Brazilian ("pt") since 28 Oct 2026: RBM's own Portuguese is
// Brazilian (its sample message files). It was European ("pt-PT") before.
const TARGET = { fr: "fr", pt: "pt" };
// What the memory's values were made with, until the memory records it
// itself (mem.targets, written on every save).
const MADE_WITH_BEFORE = { fr: "fr", pt: "pt-PT" };

// ---------------------------------------------------------------------------
// Never send these, whatever bucket they turn up in.
// ---------------------------------------------------------------------------
const DENY_EXACT = new Set([
  "P. falciparum", "P. vivax", "P. malariae", "P. ovale", "P. knowlesi",
  "application/ld+json", "repeatCount=", "(prefers-color-scheme: dark)",
]);
// gene markers, amplifications and mutation codes — identifiers, not prose
const DENY_PATTERN = [
  /^Pf[A-Za-z]/,                 // Pfkelch13, Pfcrt, Pfplasmepsin 2-3 amplifications
  /^[A-Z]\d{2,4}[A-Z]$/,         // K76T, A675V
  /^NCT\d+$/,                    // trial registry IDs
  /^[a-z-]+\[[^\]]*\]/,          // css attribute selectors
];
const denied = (t) => DENY_EXACT.has(t) || DENY_PATTERN.some((r) => r.test(t));

// ---------------------------------------------------------------------------
// inventory — the text section of content.en.json, nothing else
// ---------------------------------------------------------------------------
// requireFresh() re-hashes the source first and exits if content.en.json is
// stale or was edited by hand, so nothing is ever translated from an old file.
function inventory(content) {
  return content.text.map((e) => ({ key: e.key, text: e.en, where: e.where, bucket: e.bucket }));
}

// CP-4 — the approval gate. Nothing may reach a translation engine before the
// English is approved, so this exits unless APPROVED_CONTENT_HASH is exactly
// the contentHash of the content about to be translated. Where the approval
// comes from (docs/translation-notes.md):
//
//   proposal-decision.yml  the contentHash of the proposal a reviewer labelled
//                          `approved`, rebuilt on main as it is now; recorded
//                          in data/decisions.js
//   translate.yml          the contentHash now on main — a push to main is
//                          already live in English, and the push is its approval
//
// A dry run sends nothing and needs no approval.
function approvalGate(content, dryRun) {
  const short = `${content.contentHash.slice(0, 12)}…`;
  if (dryRun) return `${short}  (dry run — sends nothing, no approval needed)`;
  const approved = process.env.APPROVED_CONTENT_HASH || "";
  if (approved !== content.contentHash) {
    console.error(`\n  Not approved: contentHash ${short} is ${approved ? `not the approved ${approved.slice(0, 12)}…` : "not approved (APPROVED_CONTENT_HASH is not set)"}.`);
    console.error("  Nothing is sent to a translation engine before the English is approved.");
    console.error("  The approval job and the translate bot set APPROVED_CONTENT_HASH; see the header.\n");
    process.exit(1);
  }
  return `${short}  approved`;
}

function loadMemory() {
  if (!fs.existsSync(MEM)) return { schema: 1, entries: {} };
  return JSON.parse(fs.readFileSync(MEM, "utf8"));
}

function saveMemory(mem) {
  fs.mkdirSync(path.dirname(MEM), { recursive: true });
  // stable key order so a rerun that changes nothing produces no diff
  const ordered = {};
  for (const k of Object.keys(mem.entries).sort()) ordered[k] = mem.entries[k];
  // targets: the engine target each locale's values were made with
  const { schema, targets, entries, ...rest } = mem;
  const out = { schema, ...(targets ? { targets } : {}), ...rest, entries: ordered };
  fs.writeFileSync(MEM, JSON.stringify(out, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Placeholder protection.
//
// About ten of these strings are template literals carrying ${...} holes:
//
//   "${esc(STAGES[b])} was reached ${yrs} yr${yrs === 1 ? "" : "s"} before ..."
//
// Sent raw, the engine translates the code inside the braces and the page
// breaks. Each hole is swapped for a rare bracketed token that engines leave
// alone, then restored. If a token does not survive the round trip the
// translation is REJECTED and the English is kept — a missing placeholder is
// a broken page, which is worse than an untranslated string.
//
// The React version's messages (the "ui" bucket, i18n/ui.en.json, since
// 28 Oct 2026) carry ICU placeholders instead: "Stage {n} of {total}". They
// are holes too, protected the same way; the ${...} form is tried first so
// its inner braces are never taken for one.
// ---------------------------------------------------------------------------
const HOLE = /\$\{(?:[^{}]|\{[^{}]*\})*\}|\{[A-Za-z][A-Za-z0-9]*\}/g;

// ---------------------------------------------------------------------------
// Protected terms — the glossary Google's API-key endpoint does not give us.
//
// Google Translation v2 has no glossary support; that needs v3 Advanced with a
// service account. Masking the terms here does the same job for the cost of a
// regex, and keeps the whole pipeline on a simple API key that nobody has to
// own after handover.
//
// Without this the engine produced, in the first real build:
//   "LAUNCH Transparency Dashboard" -> "LANCEMENT Tableau de bord"
//   "WHO PQ listing"                -> "Liste des questions periodiques"
// Both are the project's own vocabulary, and both are wrong in any language.
//
// Longest first, so "ACTs" masks before "ACT" and "Pfkelch13" before "Pf".
// ---------------------------------------------------------------------------
const PROTECT = [
  // project and product names
  "LAUNCH", "GanLum", "Ganaplacide–lumefantrine", "Pyramax", "Eurartesim", "Coartem", "KALUMA", "ALAQ",
  // organisations whose names do not localise
  "Unitaid", "Novartis", "NAFDAC", "TMDA", "MMV", "RBM",
  // domain acronyms that are read as words if translated
  "ACTs", "ACT", "MFT", "PQ", "SRA", "TES", "PCR", "INN",
  // species and gene markers
  "P. falciparum", "P. vivax", "Pfplasmepsin", "Pfkelch13", "Pfcrt", "Pfmdr1",
].sort((a, b) => b.length - a.length);

const TERM = new RegExp(
  "(?<![\\p{L}\\d])(" + PROTECT.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") +
  ")(?![\\p{L}\\d])", "gu");

function protect(text) {
  const holes = [];
  const take = (m) => { holes.push(m); return `\u27e6${holes.length - 1}\u27e7`; };
  // ${...} first, then protected terms — a term inside a hole must not double-mask
  return { masked: text.replace(HOLE, take).replace(TERM, take), holes };
}

function restore(masked, holes) {
  let out = masked;
  for (let i = 0; i < holes.length; i++) {
    const tok = new RegExp(`\u27e6\\s*${i}\\s*\u27e7`);
    if (!tok.test(out)) return null;            // placeholder lost — reject
    out = out.replace(tok, () => holes[i]);
  }
  if (/[\u27e6\u27e7]/.test(out)) return null;   // stray token left behind
  return out;
}

// ---------------------------------------------------------------------------
// Second try for what the tokens above lose.
//
// Google drops or garbles a \u27e6n\u27e7 token in a few strings every run \u2014 "two or
// more effective \u27e60\u27e7" came back with the token gone, "and \u27e60\u27e7 studies" as
// "\u27e6\ufffd\u27e7" (Oct 2026: 11 of 517 across fr/pt/es). Those strings are sent again as
// HTML, each hole and term inside <span translate="no">, which the engine is
// built to leave alone. The span holds the original text, so it is restored by
// matching content, not position, and the result is still rejected unless
// every hole comes back exactly once.
// ---------------------------------------------------------------------------
const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unescHtml = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const SPAN_OPEN = '<span translate="no">';
const SPAN = /<span translate="no">([\s\S]*?)<\/span>/g;

function protectHtml(text) {
  const holes = [];
  const take = (m) => { holes.push(m); return `\u27e6${holes.length - 1}\u27e7`; };
  const masked = escHtml(text.replace(HOLE, take).replace(TERM, take))
    .replace(/\u27e6(\d+)\u27e7/g, (_, i) => `${SPAN_OPEN}${escHtml(holes[+i])}</span>`);
  return { masked, holes };
}

function restoreHtml(html, want) {
  const got = [];
  // the engine pads spans with spaces inside brackets: "MFT )", "( Coartem"
  let out = html.replace(/(<\/span>) +([),.])/g, "$1$2").replace(/\( +(<span )/g, "($1").replace(SPAN, (_, inner) => {
    const hole = unescHtml(inner);
    got.push(hole);
    return `\u27e6${got.length - 1}\u27e7`;
  });
  if (/<[a-z/][^>]*>/i.test(out)) return null;   // a tag the engine invented
  if ([...got].sort().join("\u0000") !== [...want].sort().join("\u0000")) return null;
  out = unescHtml(out);
  return out.replace(/\u27e6(\d+)\u27e7/g, (_, i) => got[+i]);
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------
const ENGINE = process.env.TRANSLATE_ENGINE || "google";
const isStub = (v) => typeof v === "string" && /^\[stub-[a-z]+\] /.test(v);
// A locale slot is empty if it holds nothing — or, for a real engine, only a
// stub value left behind by a test run.
const isEmpty = (v) => !v || (ENGINE !== "stub" && isStub(v));

async function engineTranslate(texts, locale, format = "text") {
  if (ENGINE === "stub") return texts.map((t) => `[stub-${locale}] ${t}`);
  if (ENGINE === "google") return googleTranslate(texts, locale, format);
  throw new Error(`TRANSLATE_ENGINE must be "google" or "stub", not "${ENGINE}"`);
}

// Google Cloud Translation v2
async function googleTranslate(texts, locale, format) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is not set");
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: texts, source: "en", target: TARGET[locale], format }),
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data.translations.map((t) => t.translatedText);
}

// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const arg = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split("=")[1] : d; };
  const locale = arg("locale", null);

  if (!dryRun && !TARGET[locale]) {
    console.error(`usage: ${Object.keys(TARGET).map((l) => `--locale=${l}`).join(" | ")}   (or --dry-run)`);
    process.exit(1);
  }

  const content = requireFresh();
  const all = inventory(content);
  const mem = loadMemory();

  const kept = all.filter((s) => !denied(s.text));
  const skipped = all.length - kept.length;

  const locales = locale ? [locale] : Object.keys(TARGET);

  // A locale whose values were made with another target (Portuguese: European
  // until 28 Oct 2026, Brazilian since) is translated again, once, the one
  // exception to the empty-locale-only rule. Its values are cleared in every
  // entry, so everything in use is "to translate" and nothing out of use can
  // come back in the old variety; mem.targets then records the new target. A
  // string the engine rejects stays empty (English) and is retried by the next
  // run, like any other empty slot. Nothing is written before the run ends.
  mem.targets = { ...MADE_WITH_BEFORE, ...(mem.targets || {}) };
  const retarget = {};
  for (const loc of locales) {
    if (mem.targets[loc] === TARGET[loc]) continue;
    retarget[loc] = mem.targets[loc];
    for (const e of Object.values(mem.entries)) delete e[loc];
    mem.targets[loc] = TARGET[loc];
  }

  // what is actually missing for this locale — the empty-locale-only rule
  const report = {};
  for (const loc of locales) {
    const todo = kept.filter((s) => {
      const e = mem.entries[s.key];
      return !e || isEmpty(e[loc]);
    });
    report[loc] = todo;
  }

  console.log("");
  console.log(`  contentHash      ${approvalGate(content, dryRun)}`);
  console.log(`  engine           ${ENGINE}`);
  console.log(`  content.en.json  ${all.length} strings`);
  console.log(`  deny-listed      ${skipped} skipped (species, gene markers, selectors)`);
  console.log(`  translatable     ${kept.length}`);
  for (const loc of locales) {
    const t = report[loc];
    const chars = t.reduce((n, s) => n + s.text.length, 0);
    const have = kept.length - t.length;
    console.log(`  ${loc}: ${have} already in memory · ${t.length} to translate · ${chars.toLocaleString()} characters`);
    if (retarget[loc]) console.log(`  ${loc}: the memory was made with "${retarget[loc]}", the target is now "${TARGET[loc]}": translating it all again`);
  }
  console.log("");

  if (dryRun) { console.log("  --dry-run: no API calls made.\n"); return; }

  const todo = report[locale];
  if (!todo.length) { console.log("  nothing to do — every string already has this locale.\n"); return; }

  // batch by payload size; Google takes an array of q values per call
  const BATCH = 80;
  let done = 0;
  let rejected = [];
  const save = (s, back) => {
    const e = (mem.entries[s.key] ||= { en: s.text, where: s.where, bucket: s.bucket });
    if (isEmpty(e[locale])) e[locale] = back;  // empty-locale-only, enforced here too
  };
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const masked = slice.map((s) => protect(s.text));
    const outs = await engineTranslate(masked.map((m) => m.masked), locale);
    slice.forEach((s, j) => {
      const back = restore(outs[j], masked[j].holes);
      if (back === null) { rejected.push(s); return; }   // second try below
      save(s, back);
    });
    done += slice.length;
    process.stdout.write(`\r  ${ENGINE} → ${locale} … ${done}/${todo.length}`);
  }
  console.log("");
  if (rejected.length && ENGINE === "google") {
    const retry = rejected;
    rejected = [];
    for (let i = 0; i < retry.length; i += BATCH) {
      const slice = retry.slice(i, i + BATCH);
      const masked = slice.map((s) => protectHtml(s.text));
      const outs = await engineTranslate(masked.map((m) => m.masked), locale, "html");
      slice.forEach((s, j) => {
        const back = restoreHtml(outs[j], masked[j].holes);
        if (back === null) { rejected.push(s); return; }   // keep English
        save(s, back);
      });
    }
    console.log(`  second try as HTML: ${retry.length - rejected.length} of ${retry.length} saved`);
  }
  rejected = rejected.map((s) => s.text);
  saveMemory(mem);
  console.log(`  wrote ${path.relative(ROOT, MEM)} — ${Object.keys(mem.entries).length} entries`);
  if (rejected.length) {
    console.log(`\n  ${rejected.length} REJECTED — placeholders did not survive, English kept:`);
    rejected.forEach((t) => console.log(`    ${t.slice(0, 90)}`));
    console.log("  Re-run to retry them, or translate those by hand in i18n/translations.json.");
  }
  console.log("");
}

main().catch((e) => { console.error("\n  " + e.message + "\n"); process.exit(1); });
