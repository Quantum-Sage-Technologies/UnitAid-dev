#!/usr/bin/env node
// Tests for the source watchers that turn a public source into proposals:
// scripts/propose-trials.js (ClinicalTrials.gov) and scripts/propose-registers.js
// (Nigeria's NAFDAC Green Book, Tanzania's TMDA register). No network: each
// watcher runs on the staged lists and the files in test-data/, writing into a
// temporary folder, and every proposal it writes is put through the same
// library and rules intake uses.
//
//   node scripts/test-source-watchers.js

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const lib = require("./proposal-lib.js");
const T = require("./propose-trials.js");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32mok\x1b[0m   " + label); }
  else { fail++; failures.push(label); console.log("  \x1b[31mFAIL\x1b[0m " + label + (detail !== undefined ? "\n         got " + JSON.stringify(detail).slice(0, 400) : "")); }
}
const group = (name) => console.log("\n\x1b[1m" + name + "\x1b[0m");
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), name + "-"));

// Runs a watcher; returns its exit code, its printed lines, and what it wrote.
function watcher(script, args) {
  const out = tmp("watch");
  let code = 0, stdout = "";
  try {
    stdout = execFileSync(process.execPath, [path.join(__dirname, script), ...args, "--out", out], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { code = e.status; stdout = String(e.stdout || "") + String(e.stderr || ""); }
  const mf = path.join(out, "manifest.json");
  const manifest = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : null;
  return { code, stdout, manifest, bodies: (manifest || []).map((m) => fs.readFileSync(m.bodyFile, "utf8")) };
}

// What intake does with a filed body, and the data with it applied.
function intake(body, dataFile) {
  const { data } = lib.readData(dataFile);
  const built = lib.buildProposal(lib.parseIssueBody(body), { data, sources: lib.readSources(), issue: { number: 77, user: lib.BOT } });
  if (!built.ok) return { built };
  return { built, res: lib.checkApplied(data, built.proposal, "2026-10-05"), data };
}

function dataWith(mutate) {
  const { raw, data } = lib.readData();
  const next = JSON.parse(JSON.stringify(data));
  mutate(next);
  const f = path.join(tmp("data"), "products.js");
  fs.writeFileSync(f, require("./serialize-products.js").serializeProducts(next, raw));
  return f;
}

function csvWith(file, mutate) {
  const { parseCsv } = require("./fetch-regulatory.js");
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, file), "utf8"));
  const cols = Object.keys(rows[0]);
  const kept = mutate(rows) || rows;
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const f = path.join(tmp("csv"), path.basename(file));
  fs.writeFileSync(f, [cols.join(","), ...kept.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n");
  return f;
}

// ---- ClinicalTrials.gov ------------------------------------------------------

group("Trials: reading one registry record");
const row = (over) => ({ nctId: "NCT05951595", acronym: "FD-TACT", phase: "PHASE3", overallStatus: "RECRUITING",
  primaryCompletionDate: "2027-06-30", primaryCompletionType: "ESTIMATED", lastUpdatePostDate: "2026-09-30", ...over });
const today = "2026-10-05";
ok("an actual primary completion is a date line", /reached primary completion on 15 Sep 2026/.test(T.readTrial(row({ overallStatus: "ACTIVE_NOT_RECRUITING", primaryCompletionDate: "2026-09-15", primaryCompletionType: "ACTUAL" }), today).date || ""));
ok("an estimate still ahead is a date line", T.readTrial(row({}), today).date === "Phase III FD-TACT (NCT05951595): primary completion expected 30 Jun 2027 (ClinicalTrials.gov estimate)");
ok("a month-only estimate reads as the month", /expected Jun 2027/.test(T.readTrial(row({ primaryCompletionDate: "2027-06" }), today).date || ""));
ok("an estimate in this month is not yet past", !!T.readTrial(row({ primaryCompletionDate: "2026-10" }), today).date);
const stale = T.readTrial(row({ primaryCompletionDate: "2026-07-31", lastUpdatePostDate: "2025-11-18" }), today);
ok("an estimate already passed is left for a person, naming the last update", !stale.date && /has passed/.test(stale.person) && /18 Nov 2025/.test(stale.person));
for (const st of ["TERMINATED", "WITHDRAWN", "SUSPENDED", "UNKNOWN"])
  ok(`a ${st.toLowerCase()} trial is left for a person, even with an actual date`, !T.readTrial(row({ overallStatus: st, primaryCompletionType: "ACTUAL" }), today).date);
ok("staging from before the type column: a completed trial counts as actual",
  !!T.readTrial(row({ overallStatus: "COMPLETED", primaryCompletionDate: "2026-09-15", primaryCompletionType: "" }), today).date);
ok("staging from before the type column: no estimate is proposed",
  !T.readTrial(row({ primaryCompletionType: "" }), today).date);
ok("phases read as the registry's, in roman numerals", T.phaseWords("PHASE2|PHASE3") === "Phase II/III" && T.phaseWords("PHASE3") === "Phase III" && T.phaseWords("") === "Trial");
ok("without an acronym the trial is named by its number", /^Phase III NCT05951595:/.test(T.readTrial(row({ acronym: "" }), today).date));

group("Trials: which trials are followed");
ok("a trial the stage cites by number", T.followed({ id: "x" }, { note: "Phase III (KALUMA, NCT05842954) met …", source: "" }).includes("NCT05842954"));
ok("ALAQ's pivotal trial, from the table", T.followed({ id: "alaq" }, { note: "FD-TACT …" }).includes("NCT05951595"));
ok("none for a medicine that cites none and is not in the table", T.followed({ id: "x" }, { note: "no number here" }).length === 0);

group("Trials: the real staged list");
const real = watcher("propose-trials.js", ["--today", today]);
ok("exits 0 and proposes nothing", real.code === 0 && real.manifest && real.manifest.length === 0, real.stdout);
ok("leaves FD-TACT's passed estimate for a person", /ALAQ: left for a person — FD-TACT \(NCT05951595\): the registry's estimated primary completion, 31 Jul 2026, has passed/.test(real.stdout), real.stdout);
ok("follows no trial for a medicine whose development is done", (real.stdout.match(/development already shown as done/g) || []).length === 3);

for (const [file, want] of [
  ["alaq-primary-completion.csv", "Phase III FD-TACT-TEST (NCT05951595) reached primary completion on 15 Sep 2026 (ClinicalTrials.gov)"],
  ["alaq-estimate-moved.csv", "Phase III FD-TACT-TEST (NCT05951595): primary completion expected Jun 2027 (ClinicalTrials.gov estimate)"],
]) {
  group("Trials: test-data/trials/" + file);
  const w = watcher("propose-trials.js", ["--staging", "test-data/trials/" + file, "--today", today]);
  ok("exits 0 with one proposal, for ALAQ's trial stage", w.code === 0 && w.manifest.length === 1 && w.manifest[0].title === "Proposal: ALAQ · R&D and Clinical", w.stdout);
  const { built, res } = intake(w.bodies[0] || "");
  ok("intake reads it as a one-field proposal, from the watcher", built.ok && built.proposal.target.field === "date" && /^watcher:/.test(built.proposal.origin), built.errors);
  if (built.ok) {
    const s = res.applied.products.find((p) => p.id === "alaq").stages[0];
    const was = lib.readData().data.products.find((p) => p.id === "alaq").stages[0];
    ok("it sets the date line to the registry's", s.date === want, s.date);
    ok("and leaves the status and the sentence alone", s.status === was.status && s.note === was.note);
    ok("cites ClinicalTrials.gov and the trial", /^ClinicalTrials\.gov \(NCT05951595/.test(s.source) && s.asOf === "2026-09-28", s.source);
    ok("the applied data passes the rules", res.errors.length === 0, res.errors);
    ok("the reviewer is told it is test data", /\*\*Test data\*\*/.test(w.bodies[0]));
    ok("the fingerprint in the manifest is intake's", w.manifest[0].fingerprint === built.proposal.fingerprint);

    // Once approved, the same list proposes nothing.
    const after = dataWith((d) => { d.products.find((p) => p.id === "alaq").stages[0].date = want; });
    const again = watcher("propose-trials.js", ["--staging", "test-data/trials/" + file, "--today", today, "--data", after]);
    ok("after approval, the same list proposes nothing", again.code === 0 && again.manifest.length === 0 && /already says this/.test(again.stdout), again.stdout);
  }
}

group("Trials: guards");
const shrunk = csvWith("sourcing/staging/trials.csv", (rows) => rows.filter((r) => r.productId !== "alaq" || r.nctId === "NCT05951595"));
const g = watcher("propose-trials.js", ["--staging", "test-data/trials/alaq-primary-completion.csv", "--previous", "sourcing/staging/trials.csv", "--today", today]);
ok("a list that kept its rows is not blocked", g.code === 0 && g.manifest.length === 1, g.stdout);
const b = watcher("propose-trials.js", ["--staging", shrunk, "--previous", "sourcing/staging/trials.csv", "--today", today]);
// the counts come from the staged files, which the scheduled fetch rewrites
const stagedRows = (file, keep = () => true) => require("./fetch-regulatory.js").parseCsv(fs.readFileSync(path.join(ROOT, file), "utf8")).filter(keep).length;
const alaqTrials = stagedRows("sourcing/staging/trials.csv", (r) => r.productId === "alaq");
ok("a medicine whose staged trials fell by more than a fifth is blocked, and the run fails", b.code === 1 && b.stdout.includes(`BLOCKED ClinicalTrials.gov · ALAQ: staged trials fell from ${alaqTrials} to 1`), b.stdout);
const gone = csvWith("sourcing/staging/trials.csv", (rows) => rows.filter((r) => r.nctId !== "NCT05951595"));
const m = watcher("propose-trials.js", ["--staging", gone, "--today", today]);
ok("a followed trial missing from the list is left for a person", m.code === 0 && m.manifest.length === 0 && /NCT05951595 is not in the staged list/.test(m.stdout), m.stdout);
const results = csvWith("test-data/trials/alaq-primary-completion.csv", (rows) => { rows.find((r) => r.nctId === "NCT05951595").hasResults = "true"; });
const r = watcher("propose-trials.js", ["--staging", results, "--today", today]);
ok("results posted are flagged for a person, beside the proposal", /has results posted — for a person to read/.test(r.stdout) && r.manifest.length === 1, r.stdout);
const done = dataWith((d) => { d.products.find((p) => p.id === "alaq").stages[0].status = "done"; });
const dn = watcher("propose-trials.js", ["--staging", "test-data/trials/alaq-primary-completion.csv", "--today", today, "--data", done]);
ok("a medicine shown as developed follows no trial", dn.manifest.length === 0 && /ALAQ: development already shown as done/.test(dn.stdout), dn.stdout);

// ---- national registers ------------------------------------------------------

group("Registers: the real NAFDAC and TMDA lists");
const regs = watcher("propose-registers.js", []);
ok("exits 0 and proposes nothing", regs.code === 0 && regs.manifest && regs.manifest.length === 0, regs.stdout);
ok("Nigeria and Tanzania are already on the map for ASPY and DHA–PPQ",
  (regs.stdout.match(/(NAFDAC|TMDA) · [^:]+: \S+ already on the map/g) || []).length === 4, regs.stdout);
// Zambia, Zimbabwe, Viet Nam and Rwanda (19 Oct 2026): each register is read
// (or, before its first monthly fetch, skipped), and none proposes anything
// the map already shows.
for (const n of ["ZAMRA", "MCAZ", "DAV", "RWANDA"])
  ok(n + " is read, or skipped until its first fetch", new RegExp("- " + n + ": (\\d+ portfolio rows|not fetched yet)").test(regs.stdout), regs.stdout);

group("Registers: test-data/registers/nafdac-ganlum-registered.csv");
const nf = watcher("propose-registers.js", ["--only", "NAFDAC", "--nafdac", "test-data/registers/nafdac-ganlum-registered.csv"]);
ok("exits 0 with one proposal, GanLum in Nigeria", nf.code === 0 && nf.manifest.length === 1 && nf.manifest[0].title === "Proposal: GanLum · Country registration · Nigeria", nf.stdout);
ok("the lapsed ALAQ row is not proposed", !/ALAQ: PROPOSED/.test(nf.stdout));
{
  const { built, res } = intake(nf.bodies[0] || "");
  ok("intake reads it, from the watcher", built.ok && /^watcher:/.test(built.proposal.origin), built.errors);
  if (built.ok) {
    const g = res.applied.products.find((p) => p.id === "ganlum");
    ok("it draws Nigeria, citing the register and its date, on a new draft map with its warning",
      JSON.stringify(g.detail.countries.list) === JSON.stringify([{ iso3: "NGA", level: "registered", sources: ["nafdac"], checked: "2026-09-30" }]) &&
      g.detail.countries.status === "draft" && g.detail.countries.note === lib.NEW_MAP_NOTE, g.detail.countries);
    ok("it starts the stage: in progress, dated, with the references", g.stages[4].status === "prog" && g.stages[4].date === "First registered 20 Sep 2026 (Nigeria)" && /NAFDAC TEST-A4-0001/.test(g.stages[4].note), g.stages[4]);
    ok("it raises the registered count from 0 to 1", g.detail.country.registered === 1);
    ok("the applied data passes the rules", res.errors.length === 0, res.errors);
    ok("the reviewer is told it is test data", /\*\*Test data\*\*/.test(nf.bodies[0]));
    const after = dataWith((d) => { const x = d.products.find((p) => p.id === "ganlum"); x.detail.countries = g.detail.countries; x.stages[4] = g.stages[4]; x.detail.country = g.detail.country; });
    const again = watcher("propose-registers.js", ["--only", "NAFDAC", "--nafdac", "test-data/registers/nafdac-ganlum-registered.csv", "--data", after]);
    ok("after approval, the same register proposes nothing", again.code === 0 && again.manifest.length === 0 && /GanLum: Nigeria already on the map/.test(again.stdout), again.stdout);
  }
}

group("Registers: both test registers in one run");
const both = watcher("propose-registers.js", ["--nafdac", "test-data/registers/nafdac-ganlum-registered.csv", "--tmda", "test-data/registers/tmda-ganlum-registered.csv"]);
ok("one proposal per country", both.code === 0 && both.manifest.map((m) => m.title).join(" | ") === "Proposal: GanLum · Country registration · Nigeria | Proposal: GanLum · Country registration · Tanzania", both.manifest && both.manifest.map((m) => m.title));
const [ngaBody, tzaBody] = both.bodies;
ok("only the earlier registration (Nigeria, 20 Sep) starts the stage", /### The status of this stage/.test(ngaBody || "") && !/### The status of this stage/.test(tzaBody || ""));
{
  const t = intake(tzaBody || "");
  ok("Tanzania's only draws its country, keeping the stage's own citation", t.built.ok && t.built.proposal.changes.length === 0 &&
    JSON.stringify(t.res.applied.products.find((p) => p.id === "ganlum").stages[4]) === JSON.stringify(lib.readData().data.products.find((p) => p.id === "ganlum").stages[4]));
}
const tz = watcher("propose-registers.js", ["--only", "TMDA", "--tmda", "test-data/registers/tmda-ganlum-registered.csv"]);
ok("run alone, Tanzania's starts the stage itself", tz.manifest.length === 1 && /### The status of this stage/.test(tz.bodies[0]), tz.stdout);

group("Registers: guards and what is left for a person");
const lapsed = csvWith("sourcing/staging/nafdac_registrations.csv", (rows) => { rows.filter((r) => r.productId === "pyramax").forEach((r) => { r.status = "Inactive"; }); });
const lp = watcher("propose-registers.js", ["--only", "NAFDAC", "--nafdac", lapsed]);
ok("a country the map shows, with nothing current in the register, is left for a person",
  lp.manifest.length === 0 && /ASPY: left for a person — the map shows Nigeria \((registered|guidelines|mft)\), but the register lists no current registration \(1 lapsed or inactive\)/.test(lp.stdout), lp.stdout);
const expiredRow = csvWith("test-data/registers/nafdac-ganlum-registered.csv", (rows) => { rows.find((r) => r.nafdacNo === "TEST-A4-0001").expiryDate = "2026-09-29"; });
const st = watcher("propose-registers.js", ["--only", "NAFDAC", "--nafdac", expiredRow]);
ok("a registration still called active after its expiry is left for a person, not proposed",
  st.manifest.length === 0 && /GanLum: left for a person — 1 registration\(s\) the register calls current past their expiry date \(TEST-A4-0001\)/.test(st.stdout), st.stdout);
const cut = csvWith("sourcing/staging/nafdac_registrations.csv", (rows) => rows.slice(0, 10));
const sh = watcher("propose-registers.js", ["--nafdac", cut, "--previous-nafdac", "sourcing/staging/nafdac_registrations.csv", "--tmda", "test-data/registers/tmda-ganlum-registered.csv"]);
ok("a register whose rows fell by more than a fifth is blocked, the other still proposes, and the run fails",
  sh.code === 1 && sh.stdout.includes(`BLOCKED NAFDAC: rows fell from ${stagedRows("sourcing/staging/nafdac_registrations.csv")} to 10`) && sh.manifest.length === 1 && /Tanzania/.test(sh.manifest[0].title), sh.stdout);
const started = dataWith((d) => { const x = d.products.find((p) => p.id === "ganlum"); x.stages[4].status = "prog"; x.stages[4].note = "Filed in several countries"; x.stages[4].asOf = "2026-09-01"; });
const sp = watcher("propose-registers.js", ["--only", "NAFDAC", "--nafdac", "test-data/registers/nafdac-ganlum-registered.csv", "--data", started]);
ok("a stage already under way keeps its wording: the proposal only draws the country",
  sp.manifest.length === 1 && !/### The status of this stage/.test(sp.bodies[0]) && /### Country map\n\nNGA: registered/.test(sp.bodies[0]), sp.stdout);

// Intake finds the stage by its name, so the form's list must be the data's
// list. It drifted once: from 2 Oct 2026 the form offered "Procurement" after
// the data had renamed it "Procurement (public channels)", and every such
// proposal was refused. Found and fixed with the 15 Oct stage renames.
group("The proposal form");
const formYml = fs.readFileSync(path.join(ROOT, ".github/ISSUE_TEMPLATE/propose-change.yml"), "utf8");
const formStages = [...formYml.split("id: stage")[1].split("validations:")[0].matchAll(/- "([^"]+)"/g)].map((m) => m[1]);
ok("its \"Which stage\" options are the data's stages, in order",
  JSON.stringify(formStages) === JSON.stringify(lib.readData().data.stages), formStages);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("Failed:\n  " + failures.join("\n  ")); process.exit(1); }
