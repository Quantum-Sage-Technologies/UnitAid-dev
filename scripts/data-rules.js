// Governance rules for the LAUNCH dashboard data, as pure functions.
//
// This file holds the rules themselves and nothing else: no file reads, no
// argv, no process.exit, no output. That is what lets the same rules run in
// two places — scripts/validate-data.js (the CLI gate, used by CI) and the
// browser-based data editor — without a second copy that can drift.
//
// Loads both ways:
//   const rules = require("./data-rules.js");        // Node
//   <script src="scripts/data-rules.js">             // browser -> window.LAUNCH_RULES
//
// Two rule sets, deliberately separate:
//   checkData(data)          the product data contract. Pure — takes the
//                            parsed object, returns findings. The editor uses
//                            this one.
//   checkTreatmentPolicy(src) the WHO national treatment policy file behind
//                            the map's MFT policy switch. Takes already-read
//                            file *contents* as strings, so it stays pure, but
//                            only the CLI calls it.
//
// Changing a rule here means changing its SHACL twin in
// ontology/launch-shapes.ttl too — they are the same governance, expressed
// twice, and they are expected to agree.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LAUNCH_RULES = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STATUSES = ["done", "prog", "late", "idle"];
  const DATA_STATUSES = ["illustrative", "draft", "live"];
  const PHASES = ["preclinical", "phase1", "phase2", "phase3", "regulatory", "access"];

  const SOURCE_GROUPS = ["data", "document"];
  const SOURCE_COLLECTION = ["automated", "manual", "static", "blocked", "none"];

  // ---- extraction ----------------------------------------------------------
  // The data file is a comment header, then `window.LAUNCH_DATA = ` at a line
  // start, then strict JSON. Anchored to a line start so the mention of the
  // marker inside the comment header cannot match.
  //
  // `global` names which window.* assignment to read, so the same extractor
  // serves data/sources.js (LAUNCH_SOURCES). Defaulted, so every existing
  // caller keeps working unchanged.
  function extractData(raw, global) {
    const m = raw.match(new RegExp("^window\\." + (global || "LAUNCH_DATA") + "\\s*=\\s*", "m"));
    if (!m) return { ok: false, reason: "no-marker" };
    const body = raw.slice(m.index + m[0].length).replace(/;?\s*$/, "");
    try {
      return { ok: true, data: JSON.parse(body) };
    } catch (e) {
      return { ok: false, reason: "bad-json", message: e.message };
    }
  }

  // ---- the product data contract -------------------------------------------
  function checkData(data) {
    const errors = [];
    const warnings = [];
    const err = (m) => errors.push(m);
    const warn = (m) => warnings.push(m);

    // ---- meta --------------------------------------------------------------
    if (!data.meta) err("meta: missing");
    else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.meta.lastUpdated || ""))
        err(`meta.lastUpdated: must be YYYY-MM-DD, got "${data.meta.lastUpdated}"`);
      if (!DATA_STATUSES.includes(data.meta.dataStatus))
        err(`meta.dataStatus: must be one of ${DATA_STATUSES.join("/")} (controls the on-page banner), got "${data.meta.dataStatus}"`);
    }

    // ---- glossary ----------------------------------------------------------
    if (data.glossary !== undefined) {
      if (typeof data.glossary !== "object" || Array.isArray(data.glossary)) err("glossary: must be an object of term → definition");
      else for (const [term, def] of Object.entries(data.glossary)) {
        if (!term.trim()) err("glossary: empty term key");
        if (typeof def !== "string" || def.trim().length < 20) err(`glossary["${term}"]: definition must be a real sentence`);
      }
    }

    // ---- changelog ---------------------------------------------------------
    if (data.changelog !== undefined) {
      if (!Array.isArray(data.changelog)) err("changelog: must be an array");
      else {
        data.changelog.forEach((c, ci) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || "")) err(`changelog[${ci}]: date must be YYYY-MM-DD`);
          if (!c.product) err(`changelog[${ci}]: "product" is required (product name or "All")`);
          if (!c.change || c.change.trim().length < 10) err(`changelog[${ci}]: "change" must describe what changed`);
          // The RSS feed takes the first N entries as the newest — order matters.
          if (ci > 0 && (data.changelog[ci - 1].date || "") < (c.date || ""))
            warn(`changelog[${ci}]: dates not newest-first ("${data.changelog[ci - 1].date}" before "${c.date}") — the feed would drop the newest entries`);
        });
      }
    }

    // ---- stages ------------------------------------------------------------
    if (!Array.isArray(data.stages) || data.stages.length < 2)
      err("stages: must be an array of stage names");
    else if (data.stages.some((s) => typeof s !== "string" || !s.trim()))
      err("stages: every entry must be a non-empty string");
    const nStages = Array.isArray(data.stages) ? data.stages.length : 0;

    // ---- stageColumns ------------------------------------------------------
    // How stages[] is grouped into display columns. A column listing more than
    // one index is a parallel pair (no arrow, no implied order, shown side by
    // side) — currently [2, 3], WHO recommendation and WHO PQ listing. Optional:
    // its absence just means every stage gets its own column, as before.
    if (data.stageColumns !== undefined) {
      if (!Array.isArray(data.stageColumns) || data.stageColumns.length === 0) {
        err("stageColumns: must be a non-empty array of { stages: [...] } columns");
      } else {
        const seen = [];
        data.stageColumns.forEach((col, ci) => {
          const ctag = `stageColumns[${ci}]`;
          if (!col || !Array.isArray(col.stages) || col.stages.length === 0) {
            err(`${ctag}: "stages" must be a non-empty array of stage indices`);
            return;
          }
          if (col.stages.length > 3)
            warn(`${ctag}: ${col.stages.length} stages sharing one column — check this renders legibly`);
          col.stages.forEach((idx) => {
            if (!Number.isInteger(idx) || idx < 0 || idx >= nStages)
              err(`${ctag}: stage index ${JSON.stringify(idx)} is out of range for ${nStages} stages`);
            seen.push(idx);
          });
        });
        // flattened in column order, stageColumns must be exactly 0..nStages-1
        // ascending — grouping may merge adjacent indices but never reorder or
        // drop them, so every other consumer (currentStage, milestones,
        // stageIndex-keyed maps) keeps meaning what it already means.
        const expected = Array.from({ length: nStages }, (_, i) => i);
        if (JSON.stringify(seen) !== JSON.stringify(expected)) {
          err(`stageColumns: flattened in order must be exactly [${expected.join(", ")}], got [${seen.join(", ")}]`);
        }
      }
    }

    // ---- stageInfo ---------------------------------------------------------
    // Optional plain-language explainer per stage, same order as stages[]. Shown in
    // the panel a click on a pathway step opens. Every entry needs its four strings
    // so the panel never renders a half-empty block.
    if (data.stageInfo !== undefined) {
      if (!Array.isArray(data.stageInfo) || data.stageInfo.length !== nStages) {
        err(`stageInfo: must be an array with one entry per stage (${nStages}), got ${Array.isArray(data.stageInfo) ? data.stageInfo.length : typeof data.stageInfo}`);
      } else {
        data.stageInfo.forEach((si, i) => {
          ["what", "who", "stall", "source"].forEach((k) => {
            if (!si || typeof si[k] !== "string" || !si[k].trim())
              err(`stageInfo[${i}] (${data.stages[i]}): "${k}" must be a non-empty string`);
          });
          // optional: the step's name on a medicine that has not completed it
          if (si && si.pendingName !== undefined && (typeof si.pendingName !== "string" || !si.pendingName.trim()))
            err(`stageInfo[${i}] (${data.stages[i]}): "pendingName" must be a non-empty string when given`);
        });
      }
    }

    // ---- yardstick ---------------------------------------------------------
    // Optional expected time per stage, same order as stages[], plus the whole
    // journey. null means the stage is not measured. "basis" says whether the
    // number is a published timeline or LAUNCH's own working estimate; the page
    // says which in its footnote, so it must be one of the two.
    if (data.yardstick !== undefined) {
      const y = data.yardstick;
      const isYears = (v) => typeof v === "number" && isFinite(v) && v > 0 && v <= 50;
      if (!y || typeof y !== "object" || Array.isArray(y)) err("yardstick: must be an object");
      else {
        if (!isYears(y.wholeYears)) err(`yardstick.wholeYears: must be a number of years above 0, got ${JSON.stringify(y.wholeYears)}`);
        if (!Array.isArray(y.expected) || y.expected.length !== nStages) {
          err(`yardstick.expected: must be an array with one entry per stage (${nStages}), got ${Array.isArray(y.expected) ? y.expected.length : typeof y.expected}`);
        } else {
          y.expected.forEach((e, i) => {
            if (e === null) return;
            const t = `yardstick.expected[${i}] (${data.stages[i]})`;
            if (!e || typeof e !== "object") { err(`${t}: must be null or { "years", "basis" }`); return; }
            if (!isYears(e.years)) err(`${t}: "years" must be a number above 0, got ${JSON.stringify(e.years)}`);
            if (!["published", "estimate"].includes(e.basis)) err(`${t}: "basis" must be "published" or "estimate", got ${JSON.stringify(e.basis)}`);
          });
        }
      }
    }

    // ---- products ----------------------------------------------------------
    if (!Array.isArray(data.products) || data.products.length === 0) {
      err("products: must be a non-empty array");
    } else {
      const ids = new Set();
      data.products.forEach((p, pi) => {
        const tag = `products[${pi}] (${p.id || p.name || "?"})`;
        if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) err(`${tag}: id required (lowercase letters/digits/hyphens)`);
        if (ids.has(p.id)) err(`${tag}: duplicate id "${p.id}"`);
        ids.add(p.id);
        for (const k of ["name", "inn", "manufacturer", "classLabel"])
          if (!p[k]) err(`${tag}: "${k}" is required`);
        // Optional: a legal acknowledgement a partner has asked to be shown with the medicine.
        if (p.acknowledgement !== undefined && (typeof p.acknowledgement !== "string" || !p.acknowledgement.trim()))
          err(`${tag}: "acknowledgement" must be a non-empty string when present`);

        // Placeholder rows (e.g. spatial emanators) only need identity + note.
        if (p.placeholder) {
          if (!p.note) err(`${tag}: placeholder products need a "note"`);
          return;
        }

        if (!["pipeline", "market"].includes(p.class))
          err(`${tag}: class must be "pipeline" or "market", got "${p.class}"`);
        if (p.phase !== undefined && !PHASES.includes(p.phase))
          err(`${tag}: phase must be one of ${PHASES.join("/")}, got "${p.phase}"`);
        if (p.phase === undefined)
          warn(`${tag}: no "phase" — the product will not appear on the pipeline poster view`);

        // stage track
        if (!Array.isArray(p.stages) || p.stages.length !== nStages) {
          err(`${tag}: stages must have exactly ${nStages} entries (one per stage), got ${p.stages ? p.stages.length : 0}`);
        } else {
          let hasLate = false;
          p.stages.forEach((s, si) => {
            const stag = `${tag} stage "${data.stages[si]}"`;
            if (!STATUSES.includes(s.status)) err(`${stag}: status must be one of ${STATUSES.join("/")}, got "${s.status}"`);
            if (s.status === "late") {
              hasLate = true;
              if (!s.note || s.note.trim().length < 15)
                err(`${stag}: a delayed stage must carry a substantive reason in "note"`);
            }
            // optional: this medicine's own name for the step until it completes it
            if (s.pendingName !== undefined && (typeof s.pendingName !== "string" || !s.pendingName.trim()))
              err(`${stag}: "pendingName" must be a non-empty string when given`);
            if (s.status !== "idle" && !s.asOf)
              warn(`${stag}: no "asOf" verification date`);
            if (s.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(s.asOf))
              err(`${stag}: asOf must be YYYY-MM-DD, got "${s.asOf}"`);
          });
          if (hasLate && !p.flag)
            err(`${tag}: has a delayed stage but no top-level "flag" sentence explaining the bottleneck`);
          if (!hasLate && p.flag)
            warn(`${tag}: has a "flag" but no stage is marked late — flag will show without a red light`);
        }
        if (!Number.isInteger(p.currentStage) || p.currentStage < 0 || p.currentStage >= nStages)
          err(`${tag}: currentStage must be an integer 0–${nStages - 1}`);

        // detail
        const d = p.detail;
        if (!d) { err(`${tag}: "detail" is required`); return; }
        // == null also catches JSON null — a null shape must not slip past the
        // governance rules below (a null price would skip the price rule entirely).
        for (const k of ["price", "useCase", "access", "adoption", "research", "country", "milestones"])
          if (d[k] == null) err(`${tag}: detail.${k} is required (and must not be null)`);

        if (d.price != null && (typeof d.price !== "object" || Array.isArray(d.price)))
          err(`${tag}: detail.price must be an object`);
        else if (d.price) {
          if (typeof d.price.confirmedInWriting !== "boolean")
            err(`${tag}: detail.price.confirmedInWriting must be true or false`);
          const shown = d.price.value && !["TBC", "TBD", "—", "-"].includes(d.price.value.trim());
          if (shown && !d.price.confirmedInWriting && !d.price.source)
            err(`${tag}: a displayed price needs confirmedInWriting=true or a public "source" — governance rule`);
          if (shown && !d.price.asOf) warn(`${tag}: detail.price has no "asOf" date`);
        }
        if (d.country != null && (typeof d.country !== "object" || Array.isArray(d.country)))
          err(`${tag}: detail.country must be an object`);
        else if (d.country) {
          for (const k of ["registered", "inGuidelines", "inMft"]) {
            const v = d.country[k];
            // "TBC" is the honest value for a count we haven't verified yet —
            // an invented number is worse than an admitted gap.
            if (v !== "TBC" && (!Number.isInteger(v) || v < 0))
              err(`${tag}: detail.country.${k} must be a non-negative integer or "TBC"`);
          }
        }
        if (d.countries !== undefined) {
          const c = d.countries;
          if (!["illustrative", "draft", "verified"].includes(c.status))
            err(`${tag}: detail.countries.status must be illustrative/draft/verified`);
          if (c.status !== "verified" && (!c.note || c.note.trim().length < 20))
            err(`${tag}: unverified detail.countries needs a substantive "note" (shown as the map warning)`);
          if (!Array.isArray(c.list) || !c.list.length) err(`${tag}: detail.countries.list must be a non-empty array`);
          else {
            const seenIso = new Set();
            c.list.forEach((e, ei) => {
              if (!/^[A-Z]{3}$/.test(e.iso3 || "")) err(`${tag}: countries.list[${ei}].iso3 must be a 3-letter uppercase ISO code`);
              if (seenIso.has(e.iso3)) err(`${tag}: countries.list has duplicate iso3 "${e.iso3}"`);
              seenIso.add(e.iso3);
              if (!["registered", "guidelines", "mft"].includes(e.level))
                err(`${tag}: countries.list[${ei}].level must be registered/guidelines/mft`);
              // Citation fields. Optional on illustrative/draft lists; a verified
              // list must cite every entry, because "verified" is what removes the
              // map warning. Source ids are checked against data/sources.js by
              // scripts/validate-data.js, which has both files.
              const at = `${tag}: countries.list[${ei}] (${e.iso3})`;
              if (e.sources !== undefined && (!Array.isArray(e.sources) || !e.sources.length
                  || e.sources.some((s) => !/^[a-z0-9][a-z0-9-]*$/.test(s || ""))))
                err(`${at}: "sources" must be a non-empty array of data/sources.js ids`);
              if (e.checked !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(e.checked))
                err(`${at}: "checked" must be YYYY-MM-DD`);
              if (e.mft !== undefined && (e.level !== "mft" || !["pilot", "planned", "national"].includes(e.mft)))
                err(`${at}: "mft" is pilot/planned/national, and only on level "mft"`);
              if (c.status === "verified") {
                if (e.sources === undefined || e.checked === undefined)
                  err(`${at}: a verified list needs "sources" and "checked" on every entry`);
                if (e.level === "mft" && e.mft === undefined)
                  err(`${at}: a verified MFT entry needs "mft" (pilot/planned/national)`);
              }
            });
          }
        }
        if (d.journey !== undefined) {
          if (!Array.isArray(d.journey) || d.journey.length < 2) err(`${tag}: detail.journey must be an array of at least 2 gates`);
          else {
            let prev = null;
            d.journey.forEach((g, gi) => {
              if (!g.label || !g.label.trim()) err(`${tag}: journey[${gi}] needs a "label"`);
              const y = g.year;
              if (y !== "TBC" && (!Number.isInteger(y) || y < 1990 || y > 2100))
                err(`${tag}: journey[${gi}].year must be a year (1990–2100) or "TBC"`);
              if (Number.isInteger(y) && Number.isInteger(prev) && y < prev)
                warn(`${tag}: journey[${gi}] year ${y} is earlier than the previous gate (${prev}) — check the order`);
              if (Number.isInteger(y)) prev = y;
            });
          }
        }
        if (d.volume == null && !d.volumeNote)
          warn(`${tag}: no volume data and no "volumeNote" explaining why`);
        if (d.volume) {
          if (!d.volume.total || !d.volume.period || !Array.isArray(d.volume.split))
            err(`${tag}: detail.volume needs total, period and split[]`);
          else {
            const sum = d.volume.split.reduce((a, s) => a + (s.pct || 0), 0);
            if (Math.abs(sum - 100) > 1) err(`${tag}: detail.volume.split percentages sum to ${sum}, expected 100`);
            d.volume.split.forEach((s) => { if (!s.channel) err(`${tag}: every volume split entry needs a "channel"`); });
          }
          // Packs by presentation (15 Oct 2026), written by
          // scripts/build-procurement-summary.js. Courses are a count or null
          // ("not estimated"), never a guess filled in by hand.
          if (d.volume.byPresentation !== undefined) {
            if (!Array.isArray(d.volume.byPresentation)) err(`${tag}: detail.volume.byPresentation must be an array`);
            else d.volume.byPresentation.forEach((b, j) => {
              const at = `${tag}: detail.volume.byPresentation[${j}]`;
              if (!b || typeof b.label !== "string" || !b.label.trim()) { err(`${at} needs a "label"`); return; }
              ["transactions", "packs"].forEach((k) => { if (!Number.isInteger(b[k]) || b[k] < 0) err(`${at}.${k} must be a whole number ≥ 0`); });
              if (b.courses !== null && (!Number.isInteger(b.courses) || b.courses < 0)) err(`${at}.courses must be a whole number or null`);
            });
            if (Array.isArray(d.volume.byPresentation) && d.volume.byPresentation.length && !d.volume.coursesRule)
              err(`${tag}: detail.volume.byPresentation needs a "coursesRule" saying how courses were counted`);
          }
        }
        // The presentations bought, with no figures (Unitaid, 5 Nov 2026): the
        // page lists them while detail.volume is parked, and only then.
        // See docs/unitaid-feedback-nov5-notes.md.
        if (d.procurement !== undefined) {
          const pr = d.procurement;
          if (!pr || typeof pr !== "object" || Array.isArray(pr)) err(`${tag}: detail.procurement must be an object`);
          else {
            const list = pr.presentations;
            if (!Array.isArray(list) || !list.length || list.some((x) => typeof x !== "string" || !x.trim()))
              err(`${tag}: detail.procurement.presentations must be a non-empty list of presentation names`);
            else if (new Set(list).size !== list.length)
              err(`${tag}: detail.procurement.presentations names a presentation twice`);
            if (!pr.source && !(pr.sources || []).length) warn(`${tag}: detail.procurement has no "source"`);
            if (d.volume) warn(`${tag}: detail.procurement is not shown while detail.volume has figures; remove one of them`);
          }
        }
        if (d.milestones != null && !Array.isArray(d.milestones)) {
          err(`${tag}: detail.milestones must be an array`);
        } else if (Array.isArray(d.milestones)) {
          d.milestones.forEach((mrow, mi) => {
            const mtag = `${tag} milestone[${mi}]`;
            for (const k of ["milestone", "status", "label", "date", "next", "anticipated"])
              if (mrow[k] === undefined) err(`${mtag}: "${k}" is required`);
            if (!STATUSES.includes(mrow.status)) err(`${mtag}: bad status "${mrow.status}"`);
            if (mrow.status === "done" && (!mrow.source || !mrow.source.trim()))
              warn(`${mtag}: completed milestone "${mrow.milestone}" has no source citation`);
          });
        }
      });
    }

    return { errors, warnings };
  }

  // ---- WHO national treatment policy (the "Show MFT policy" switch) --------
  // One record per country for the four dashboard products. Error = the
  // switch would draw something the WHO table does not say; warning = data
  // that exists but cannot be seen on the map. Takes file contents, not
  // paths, so the rules stay free of I/O:
  //
  //   checkTreatmentPolicy({
  //     worldMap: "<contents of data/world-map.js>",
  //     source: "<contents of data/treatment-policy.js>" | missing: true,
  //     productIds: ["<id from data/products.js>", ...]
  //   })
  function checkTreatmentPolicy(sources) {
    const errors = [];
    const warnings = [];
    const err = (m) => errors.push(m);
    const warn = (m) => warnings.push(m);
    const tag = "treatment policy";

    if (sources.missing) {
      warn(`data/treatment-policy.js is missing — run "node scripts/normalize-treatment-policy.js"`);
      return { errors, warnings };
    }
    const evaluate = (source) => {
      const box = {};
      new Function("window", source)(box);
      return box;
    };
    // A basemap that will not evaluate is an error, and skips the undrawn check.
    let drawn = null;
    try {
      const mapBox = evaluate(sources.worldMap);
      drawn = (mapBox.LAUNCH_MAP && mapBox.LAUNCH_MAP.countries) || {};
    } catch (e) {
      err("data/world-map.js could not be evaluated: " + e.message);
    }

    let box;
    try {
      box = evaluate(sources.source);
    } catch (e) {
      err("data/treatment-policy.js could not be evaluated: " + e.message);
      return { errors, warnings };
    }
    const T = box.LAUNCH_TREATMENT_POLICY;
    if (!T || typeof T !== "object") { err("data/treatment-policy.js did not define window.LAUNCH_TREATMENT_POLICY"); return { errors, warnings }; }
    const m = T.meta || {};
    for (const k of ["source", "sourceUrl", "extract", "edition", "dataAsOf", "lastVerified", "licence", "rule", "status"])
      if (!m[k] || !String(m[k]).trim()) err(`${tag} meta: "${k}" is required`);
    if (m.status && !["illustrative", "draft", "verified"].includes(m.status))
      err(`${tag} meta.status must be illustrative/draft/verified (got "${m.status}")`);
    for (const k of ["dataAsOf", "lastVerified"])
      if (m[k] && !/^\d{4}-\d{2}-\d{2}$/.test(m[k])) err(`${tag} meta.${k} must be YYYY-MM-DD (got "${m[k]}")`);
    if (m.lastVerified && m.dataAsOf && m.lastVerified < m.dataAsOf)
      err(`${tag} meta.lastVerified (${m.lastVerified}) is before the data it verifies (${m.dataAsOf})`);
    if (m.rule && String(m.rule).trim().length < 40)
      err(`${tag} meta.rule must spell out how a country is placed in a patient group — it is printed under the legend`);

    // Product keys must be the dashboard's own product ids: the page looks
    // them up by id, so a typo here is a drug that silently never draws.
    const productIds = new Set(sources.productIds || []);
    const policyProducts = Object.keys(m.products || {});
    if (!policyProducts.length) err(`${tag} meta.products is empty — the switch would have nothing to draw`);
    for (const id of policyProducts)
      if (!productIds.has(id)) err(`${tag} meta.products: "${id}" is not a product id in data/products.js`);
    const GROUPS = Object.keys(m.groups || {});
    for (const g of ["tested", "untested", "severe", "pregnancy", "vivax"])
      if (!GROUPS.includes(g)) err(`${tag} meta.groups is missing "${g}"`);

    const REGIONS = ["AFRO", "AMRO", "EMRO", "EURO", "SEARO", "WPRO"];
    const checkProducts = (where, prods) => {
      for (const [id, groups] of Object.entries(prods || {})) {
        if (!policyProducts.includes(id)) err(`${where}: product "${id}" is not in meta.products`);
        if (!Array.isArray(groups) || !groups.length) { err(`${where} ${id}: needs at least one patient group`); continue; }
        if (new Set(groups).size !== groups.length) err(`${where} ${id}: a patient group is listed twice`);
        for (const g of groups) if (!GROUPS.includes(g)) err(`${where} ${id}: "${g}" is not a patient group in meta.groups`);
      }
    };
    const entries = Object.entries(T.countries || {});
    if (!entries.length) err(`${tag}: countries is empty`);
    const undrawn = [];
    for (const [iso3, c] of entries) {
      const where = `${tag} ${iso3}`;
      if (!/^[A-Z]{3}$/.test(iso3)) err(`${where}: iso3 must be 3 uppercase letters`);
      if (!c || !c.name || !String(c.name).trim()) err(`${where}: name is required`);
      if (!REGIONS.includes(c && c.region)) err(`${where}: region must be a WHO region code (got "${c && c.region}")`);
      checkProducts(where, c && c.products);
      for (const [part, v] of Object.entries((c && c.parts) || {})) checkProducts(`${where} (${part})`, v && v.products);
      if (drawn && c && Object.keys(c.products || {}).length && !(iso3 in drawn)) undrawn.push(iso3);
    }
    if (Number.isInteger(m.countryCount) && m.countryCount !== entries.length)
      err(`${tag} meta.countryCount says ${m.countryCount} but ${entries.length} countries were found — rerun the normalizer`);
    if (undrawn.length)
      warn(`${tag}: ${undrawn.length} country value(s) with a dashboard product in policy fall outside the drawn basemap and are invisible on the map (${undrawn.join(", ")})`);

    return { errors, warnings };
  }

  // ---- the source registry contract ----------------------------------------
  // data/sources.js is what the public Sources footer is drawn from, so a
  // malformed entry is a footer that silently loses a source rather than a
  // page that fails loudly. Errors only, deliberately: a warning here would
  // be read as "the data is fine", and every rule below is a broken link or
  // a missing credit.
  //
  // `productIds` is optional; pass it and every "products" entry is checked
  // against the real portfolio, so renaming a product cannot orphan a
  // citation.
  function checkSources(data, productIds) {
    const errors = [];
    const err = (m) => errors.push(m);
    const DATE = /^\d{4}-\d{2}-\d{2}$/;

    if (!data || typeof data !== "object") { err("sources: file body is not an object"); return { errors, warnings: [] }; }
    if (!data.meta || !DATE.test(data.meta.lastUpdated || ""))
      err(`sources meta.lastUpdated: must be YYYY-MM-DD, got "${data.meta && data.meta.lastUpdated}"`);
    if (!Array.isArray(data.sources) || !data.sources.length) {
      err("sources: must be a non-empty array");
      return { errors, warnings: [] };
    }

    const seen = new Set();
    data.sources.forEach((s, i) => {
      const at = `sources[${i}]${s && s.id ? ` (${s.id})` : ""}`;
      if (!s || typeof s !== "object") { err(`${at}: not an object`); return; }

      if (!/^[a-z0-9][a-z0-9-]*$/.test(s.id || ""))
        err(`${at}: "id" must be lower-case kebab-case, got "${s.id}"`);
      else if (seen.has(s.id)) err(`${at}: duplicate id — ids are what citations point at`);
      else seen.add(s.id);

      for (const f of ["title", "org", "category", "plain"])
        if (!s[f] || !String(s[f]).trim()) err(`${at}: "${f}" is required`);

      if (!SOURCE_GROUPS.includes(s.group))
        err(`${at}: "group" must be one of ${SOURCE_GROUPS.join("/")}, got "${s.group}"`);
      if (!SOURCE_COLLECTION.includes(s.collection))
        err(`${at}: "collection" must be one of ${SOURCE_COLLECTION.join("/")}, got "${s.collection}"`);
      if (typeof s.public !== "boolean") err(`${at}: "public" must be true or false`);
      if (!DATE.test(s.checked || "")) err(`${at}: "checked" must be YYYY-MM-DD, got "${s.checked}"`);

      // null is a real answer here — PMI's portal closed and manufacturer
      // communications have no public register. An empty string is not.
      if (s.url !== null && !/^https?:\/\/\S+$/.test(s.url || ""))
        err(`${at}: "url" must be an http(s) URL, or null where none exists`);

      // optional: the address a fetcher reads, shown as plain text (never a
      // link). Absent is fine; present, it must be a real address.
      if (s.dataUrl !== undefined && (typeof s.dataUrl !== "string" || !/^https?:\/\/\S+$/.test(s.dataUrl)))
        err(`${at}: "dataUrl" must be an http(s) URL with no spaces, or left out`);

      (s.alsoSee || []).forEach((a, j) => {
        if (!a || !a.label || !/^https?:\/\/\S+$/.test(a.url || ""))
          err(`${at}: alsoSee[${j}] needs a label and an http(s) url`);
      });

      if (!Array.isArray(s.products) || !s.products.length)
        err(`${at}: "products" must list product ids, or ["all"]`);
      else if (productIds)
        s.products.filter((p) => p !== "all" && !productIds.includes(p))
          .forEach((p) => err(`${at}: products lists "${p}", which is not a product in data/products.js`));
    });

    return { errors, warnings: [] };
  }

  return {
    STATUSES, DATA_STATUSES, PHASES, SOURCE_GROUPS, SOURCE_COLLECTION,
    extractData, checkData, checkTreatmentPolicy, checkSources
  };
});
