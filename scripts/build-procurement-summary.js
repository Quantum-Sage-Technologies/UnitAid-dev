#!/usr/bin/env node
// Procurement figures for the dashboard, built from the Global Fund PQR
// extract (sourcing/staging/procurement_transactions.csv) into
// data/products.js detail.volume: transactions, total value, and packs listed
// by presentation, with treatment courses only where the product name says
// how many tablets one course takes.
//
//   node scripts/build-procurement-summary.js          rewrite data/products.js
//   node scripts/build-procurement-summary.js --check  exit 1 if it is out of date
//
// Why (partner feedback, 15 Oct 2026, row 52): the one "packs" total added a
// 3-tablet blister and a box of 225 tablets as one pack each, under a heading
// that said "treatments". Notes: docs/illustrated-journey-ui-notes.md §3.44.
//
// The course rule. Global Fund's product names give the tablets in one
// treatment course after a dash: artemether–lumefantrine's adult course is
// "20mg+120mg - 24" (24 tablets), DHA–PPQ's largest is "40mg+320mg - 9". So
// courses = packs × (tablets in the pack ÷ tablets per course). A name without
// the dash, or a pack that does not divide evenly ("- 3" in a blister of 8),
// gets no estimate: null, shown as "not estimated".
"use strict";
const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./fetch-regulatory.js");
const { serializeProducts } = require("./serialize-products.js");
const lib = require("./proposal-lib.js");

const ROOT = path.join(__dirname, "..");
const CSV = "sourcing/staging/procurement_transactions.csv";

// The products with PQR transactions, by their id in both files.
const PRODUCTS = ["pyramax", "dhappq"];

// Every presentation the extract holds for them, with a reader's label.
// Keyed on the PQR's own description and pack text, exactly. A new one in a
// later extract stops the script, so its label is written by a person.
const LABELS = {
  pyramax: {
    "60mg+180mg | Tablet.\u0000Blister-90": "60/180 mg tablets · pack of 90",
    "20mg+60mg | Granule for oral suspension\u0000Sachet - 90*1g": "20/60 mg granules · 90 sachets",
  },
  dhappq: {
    "40mg+320mg - 9 | tab\u0000Blister-9": "40/320 mg tablets · blister of 9",
    "40mg+320mg | dispers tab\u0000Blister-3": "40/320 mg dispersible tablets · blister of 3",
    "40mg+320mg | dispers tab\u0000Box of 6 tablet(2 Blisters of 3 tablet)": "40/320 mg dispersible tablets · box of 2 blisters of 3",
    "20mg+160mg - 3 | dispers tab\u0000Box of 75 tab(25 Blister of of 3 tab)": "20/160 mg dispersible tablets · box of 25 blisters of 3",
    "40mg+320mg - 9 | tab\u0000Box of 225 tablet(25 Blisters of 9 tablet)": "40/320 mg tablets · box of 25 blisters of 9",
    "20mg+160mg - 3 | dispers tab\u0000Box of 6 tablet(2 Blisters of 3 tablet)": "20/160 mg dispersible tablets · box of 2 blisters of 3",
    "40mg+320mg - 3 | tab\u0000Blister-3": "40/320 mg tablets · blister of 3",
    "40mg+320mg - 6 | tab\u0000Blister-6": "40/320 mg tablets · blister of 6",
    "40mg+320mg - 3 | tab\u0000Blister-8": "40/320 mg tablets · recorded as 3 per course, in a blister of 8",
    "20mg+160mg - 3 | dispers tab\u0000Blister-3": "20/160 mg dispersible tablets · blister of 3",
    "20mg+160mg - 3 | tab\u0000Blister-3": "20/160 mg tablets · blister of 3",
    "40mg+320mg | dispers tab\u0000Box of 75 tab(25 Blister of of 3 tab)": "40/320 mg dispersible tablets · box of 25 blisters of 3",
  },
};

// Shown under each product's table: how its course column was worked out.
const COURSES_RULE = {
  pyramax: "Treatment courses are not estimated: the Global Fund's product names for ASPY do not state how many tablets or sachets make one course, and the number depends on body weight.",
  dhappq: "Treatment courses are estimated only where the Global Fund's product name states the tablets in one course (\"40mg+320mg - 9\" is 9 tablets): courses = tablets in the pack ÷ tablets per course. Packs whose name does not state it, or does not divide evenly, are not estimated.",
};

const num = (s) => Number(String(s == null ? "" : s).replace(/,/g, "")) || 0;
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
// "11-Apr-24" -> 2024. The extract has no other date format; anything else stops the run.
function yearOf(d) {
  const m = /^(\d{1,2})-([A-Z][a-z]{2})-(\d{2})$/.exec(String(d || "").trim());
  if (!m || !MON[m[2]]) throw new Error(`unreadable purchaseOrderDate "${d}"`);
  return 2000 + Number(m[3]);
}
const money = (usd) => "US$" + (usd / 1e6).toFixed(1) + "m";
const thousands = (n) => Math.round(n).toLocaleString("en-GB");

// Tablets per course from the name ("40mg+320mg - 9 | tab" -> 9), or null.
function perCourse(description) {
  const m = /^\S+\s+-\s+(\d+)\s*\|/.exec(description);
  return m ? Number(m[1]) : null;
}

function summarise(pid, rows) {
  const rs = rows.filter((r) => r.productId === pid);
  if (!rs.length) throw new Error(`${pid}: no transactions in ${CSV}`);
  const groups = new Map();
  const byYear = {}, byCountry = {};
  let value = 0;
  for (const r of rs) {
    const key = r.description + "\u0000" + r.productPack;
    const label = LABELS[pid][key];
    if (!label) throw new Error(`${pid}: new presentation in the extract, give it a label in LABELS: ${JSON.stringify(r.description)} / ${JSON.stringify(r.productPack)}`);
    const g = groups.get(key) || { label, transactions: 0, packs: 0, unitsPerPack: num(r.nbOfSuomInPack), description: r.description };
    g.transactions += 1;
    g.packs += num(r.packQuantity);
    groups.set(key, g);
    const usd = num(r.totalProductCostUsd);
    value += usd;
    const y = yearOf(r.purchaseOrderDate);
    byYear[y] = (byYear[y] || 0) + usd;
    byCountry[r.countryTeritorry] = (byCountry[r.countryTeritorry] || 0) + usd;
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const first = years[0], last = years[years.length - 1];
  const top = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
  const byPresentation = [...groups.values()]
    .sort((a, b) => b.packs - a.packs)
    .map((g) => {
      const n = perCourse(g.description);
      const courses = n && g.unitsPerPack && g.unitsPerPack % n === 0 ? Math.round(g.packs * (g.unitsPerPack / n)) : null;
      return { label: g.label, transactions: g.transactions, packs: Math.round(g.packs), courses };
    });
  const estimated = byPresentation.filter((b) => b.courses != null);
  return {
    total: `${rs.length} transactions · ${money(value)} (${first}–${last})`,
    period: `Global Fund PQR, ${first}–${last} · ${money(byYear[2025] || 0)} in 2025 · top buyers ${top.join(", ")}`,
    byPresentation,
    coursesRule: COURSES_RULE[pid],
    // for the console only
    _check: { packs: byPresentation.reduce((a, b) => a + b.packs, 0), courses: estimated.reduce((a, b) => a + b.courses, 0), estimatedPacks: estimated.reduce((a, b) => a + b.packs, 0) },
  };
}

function main() {
  const check = process.argv.includes("--check");
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, CSV), "utf8"));
  const { raw, data } = lib.readData();
  const next = JSON.parse(JSON.stringify(data));
  for (const pid of PRODUCTS) {
    const p = next.products.find((x) => x.id === pid);
    if (p && p.detail && !p.detail.volume && p.detail.procurement)
      throw new Error(`${pid}: its procurement figures are parked (data/parked/2026-11-05-procurement.json) until Unitaid confirms them; see docs/unitaid-feedback-nov5-notes.md before restoring detail.volume`);
    if (!p || !p.detail || !p.detail.volume) throw new Error(`${pid}: no detail.volume in data/products.js to fill`);
    const s = summarise(pid, rows);
    const { _check, ...fields } = s;
    // split and source are kept: the validator requires split, and the page
    // turns a single 100% Global Fund channel into a sentence (row 53).
    Object.assign(p.detail.volume, fields);
    console.log(`${p.name}: ${fields.total}; ${thousands(_check.packs)} packs in ${fields.byPresentation.length} presentations` +
      (_check.courses ? `; ${thousands(_check.courses)} courses estimated from ${thousands(_check.estimatedPacks)} packs` : "; courses not estimated"));
  }
  const out = serializeProducts(next, raw);
  if (check) {
    if (out !== raw) { console.error("data/products.js is out of date: run node scripts/build-procurement-summary.js"); process.exit(1); }
    console.log("data/products.js matches the PQR extract.");
    return;
  }
  if (out === raw) { console.log("No change."); return; }
  fs.writeFileSync(path.join(ROOT, "data", "products.js"), out);
  console.log("Wrote data/products.js.");
}

main();
