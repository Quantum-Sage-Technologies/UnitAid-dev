# LAUNCH Dashboard — Data Analyst Guide

*For the person who keeps the data current. No web-development knowledge needed.*

You maintain exactly **one file**: [`data/products.js`](../data/products.js).
Everything on the dashboard — statuses, flags, counts, the summary numbers, the
Recent updates panel — is rendered from it. You never edit HTML.

While two design options are live for client review (`index.html` and
`option-b.html`), **both read this same data file** — one edit updates both
pages at once.

---

## 1. The update loop

1. Edit `data/products.js`. Everything after the `window.LAUNCH_DATA =` line is
   **strict JSON**: double quotes only, no comments inside the object, no
   trailing commas.
2. Validate — this is not optional; CI flags pushes that fail it (the Pages
   deploy is not gated, so a red run means fix or revert immediately):

   ```bash
   node scripts/validate-data.js
   ```

3. Add a `changelog` entry (newest first) describing the change.
4. Bump `meta.lastUpdated`.
5. Commit and push. The live site updates automatically within ~2 minutes.

Four things happen automatically after your push — no action needed: a dated
snapshot of the data file is committed to `history/` (fuel for future trend
charts), `feed.xml` (the public RSS feed of updates) is rebuilt from your
changelog entries, `ontology/launch-data.jsonld` (the machine-readable
linked-data export) is regenerated, and `ontology/launch-history.jsonld`
(the temporal graph — when each traffic light changed) is extended with your
change. A GitHub issue also opens on the 1st of each month with the
milestone-scan checklist; close it when the scan is done.

**Incoming evidence arrives on its own schedule too**: the scheduled source
fetch ([sourcing/README.md](../sourcing/README.md)) pulls ClinicalTrials.gov
weekly, and monthly the Global Fund, WHO PQ + EMA lists and the Nigeria
(NAFDAC) and Tanzania (TMDA) registers into `sourcing/staging/`, opening a
**"Trial watch" / "Regulatory watch" / "NAFDAC watch" / "TMDA watch" issue**
whenever something changed. Treat those issues as inputs to this loop: verify
the change against the cited source, make the corresponding
`data/products.js` edit (or decide no change is needed), and close the issue. The staging CSVs never feed the
dashboards directly — your edit, gated by the validator, is the only path in.

The first batch of collected-data updates went through a temporary
review-edition pattern (a `v2/` preview alongside the live pages) and was
merged into `data/products.js` on 2026-08-25. Routine collection cycles now
land as ordinary sourced edits through this loop; if a future batch is large
enough to warrant side-by-side review again, the data model's "add a dataset
edition" playbook recreates the pattern.

## 1b. The platforms your edit feeds

One data file drives three platforms. Know what each does with your push:

| Platform | What it is | Effect of your push |
| --- | --- | --- |
| **Static site** (GitHub Pages) | The public flagship: journey board, comparison matrix, pipeline poster, data story, embeddable widget — plus the **Unitaid brand edition** of all four views under `/unitaid/` | Live within ~2 minutes, automatically. All pages in both brand editions read the same data file, so one push updates everything — stats, the story's computed numbers, the RSS feed included. |
| **Streamlit app** (`streamlit-app/`) | The analyst workbench — and your **pre-commit preview tool** | If deployed on Streamlit Cloud: redeploys automatically. Locally: rerun. |
| **Power BI kit** (`powerbi/`) | Report for Microsoft-stack partners, built once from the kit | Refreshes from the live site on its own schedule (set in the Power BI Service). No action for data-value changes; **schema** changes need the developer (see the developer guide's schema-change checklist). |
| **Semantic layer** (`ontology/`) | The dataset as machine-readable linked data plus a temporal graph of every traffic-light change, for integration consumers — browsable at [/ontology/](https://kochrisdev.github.io/launch-transparency-dashboard/ontology/); see the [ontology guide](ontology.md) | Both exports regenerated automatically by CI in the same bot commit as the history snapshot; CI also re-proves the governance shapes against your edit. Nothing to do for data-value changes; **schema** changes need the developer. |

**Previewing a draft before you commit** (recommended for big updates): run the
Streamlit app (`cd streamlit-app && streamlit run app.py`), choose **Upload
file** in the sidebar, and drop in your edited `products.js`. You get every
view rendered from the draft plus live governance-check results — errors caught
here never reach the public site. The sidebar's 🛡️ *Data checks* panel mirrors
the repo validator.

**Editing without touching JSON**: the Streamlit app's **✏️ Edit & save** tab
does steps 1–4 of the loop for you — forms and editable grids for every recipe
in §8, live governance checks, a required changelog description, and an
automatic `meta.lastUpdated` bump. Saving runs the real repo validator
(`scripts/validate-data.js`) first and then writes `data/products.js` in the
repo's exact formatting, so the git diff shows only your change; you still
review, commit and push yourself (step 5 never goes away — the commit is the
audit trail). On Streamlit Cloud, use the tab's **Download** button instead
and drop the file into the repo. Details in the
[Streamlit README](../streamlit-app/README.md#edit--save-in-app-data-editing).

## 2. Status vocabulary

Every stage and milestone uses one of four statuses:

| Status | Light | Use when |
| --- | --- | --- |
| `done` | green ✓ | The gate has been passed. Cite the source. |
| `prog` | amber › | Actively moving at a normal pace. |
| `late` | red ! | Stuck, slipped, or moving abnormally slowly. **Requires** a substantive reason in the stage `note` **and** a product-level `flag` sentence. |
| `idle` | grey ○ | Not yet reached. |

`late` is a judgement call — use it when the delay is the story LAUNCH should
surface, not for routine waiting. The bar you must clear: could you defend the
red light, with its written reason, to the manufacturer and to WHO?

**For the 10 Nov 2026 release, the illustrated journey hides the words "In
progress" and "Delayed" (except ALAQ's), and every `flag` and `barrier`.** The
partners asked for it on 20 Oct 2026, until a status taxonomy and barrier
definitions are agreed. Keep setting these fields exactly as above: the data,
the validator and `dashboard.json` are unchanged, the › and ! symbols still
show, and the text returns when the page's switches are turned back on
([v1-status-barriers-notes.md](v1-status-barriers-notes.md)).

## 3. Provenance — the three fields that make the dashboard trustworthy

| Field | Meaning | Rule |
| --- | --- | --- |
| `source` | Public, citable origin (WHO PQ list, EMA register, press release…) | Every `done` milestone should carry one. |
| `asOf` | `YYYY-MM-DD` you last verified the value | Every non-idle stage should carry one. |
| `confirmedInWriting` | Manufacturer confirmed release of this figure in writing | Required `true` for any displayed price without a public source. |

**Unknown values are `"TBC"` — never estimated.** This applies to country
counts, dates, prices and volumes. The validator rejects invented-looking data
where it can; where it can't, this rule is on you.

## 4. Data dictionary

*(What readers see built from these fields is described in the
[user guide](user-guide.md); which platforms consume which field is the
[developer guide](developer-guide.md)'s schema-change checklist; how the
entities relate to each other and to every derived export is the
[data model & lineage](data-model.md) doc.)*

### `meta`

| Field | Type | Notes |
| --- | --- | --- |
| `lastUpdated` | `YYYY-MM-DD` | Shown in the header. Bump on every change. |
| `dataStatus` | `"illustrative"` \| `"draft"` \| `"live"` | Controls the banner. See §6. |
| `host` | string | Informational. |

### `stages`

Array of the eight stage names, in pathway order. Every product's `stages`
array must have exactly one entry per name, same order. Changing this list is a
**developer** change (it affects every product) — see the developer guide.

### `changelog`

Array of `{ date, product, change, plain? }`, newest first. `product` is a
product name or `"All"`. Feeds the Recent updates panel (first 8 shown).

`change` is the record of what happened, written for the team — keep the source
names, register codes and figures in it; it is what `feed.xml` and the other
editions publish. `plain` is an optional retelling of the same change for a
general visitor: no acronyms, no register jargon, spell out organisations in
full. The illustrated journey page shows `plain` where it exists and falls back
to `change` where it does not, so an entry without one is still correct — just
more technical than it needs to be.

### `glossary`

Object of `term → definition`. Terms are auto-underlined at their first
occurrence in each product row (whole-word match). Definitions must be a real
sentence. Add any acronym you introduce in a note.

### Product (tracked)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | lowercase slug | Unique, stable — used as the HTML anchor. Never rename it, even if the display name changes (e.g. ASPY's id remains `pyramax`). |
| `name`, `inn`, `manufacturer` | string | Display identity. |
| `acknowledgement` | string (optional) | A legal acknowledgement a partner has asked to be shown with the medicine, word for word as they gave it. Shown in the medicine's detail and in the page footer's Acknowledgements section. Do not paraphrase it. |
| `class` | `"pipeline"` \| `"market"` | Pipeline = pre-launch; market = launched but underutilized. Feeds the "expected to market" stat. |
| `phase` | `"preclinical"` \| `"phase1"` \| `"phase2"` \| `"phase3"` \| `"regulatory"` \| `"access"` | Where the product sits on the pipeline-poster view. Move it forward when a phase gate is passed (e.g. Phase III readout → `"regulatory"`; first launches → `"access"`). A product without a phase is omitted from the poster (validator warns). |
| `classLabel` | string | The chip text under the name. |
| `currentStage` | integer 0–7 | Index of the highlighted stage. |
| `flag` | string or `null` | The red sentence under the row. Required if any stage is `late`; keep it to one factual sentence with dates. |
| `barrier` | string (optional) | A short phrase (about 8 words) for the "Main barrier" column of the illustrated journey table. Write it to stand alone without the row's other columns. Omit it when the product has no `flag`; if it is missing but a `flag` exists, the table shows the full flag sentence clipped. |
| `stages` | array[8] | See below. |
| `detail` | object | See below. |

### Stage explainers (`stageInfo`)

A top-level list, one entry per stage in the same order as `stages`, read by the
panel that opens when someone clicks a step on the pathway strip. Each entry has
four plain strings:

| Field | What to write |
| --- | --- |
| `what` | Two or three sentences on what happens at this step, in words a non-specialist follows. |
| `who` | Who runs or decides it. |
| `stall` | The usual reason it takes longer than expected. |
| `source` | Where a reader can check it (a register or publication name, not a URL). |
| `doneName` | Optional. The step's name on a medicine that has completed it. Stage 2 is "Stringent Regulatory Review (SRA)" in `stages` and "Stringent Regulatory Approval (SRA)" here, so a medicine reads "Approval" only once its SRA step is done. Translated like the stage names. |

It describes the step in general, not any one medicine; per-medicine status and
notes come from each product's `stages` entry. Optional, but if present it must
have exactly one entry per stage with all four strings (the validator checks
this). The current wording is a first draft from `docs/domain-primer.md` and needs
sign-off from LAUNCH before it is treated as final.

### Stage entry

`{ status, note, date, next, nextDate, source?, asOf? }` — `note` is the
tooltip body; `date` a date/label for what happened; `next`/`nextDate` the next
expected step. Empty strings are fine for fields that don't apply.

### `detail`

| Field | Type | Notes |
| --- | --- | --- |
| `price` | `{ value, note, source, confirmedInWriting, asOf }` | `value` is `"TBC"` until releasable. A real value needs `confirmedInWriting: true` **or** a public `source`. |
| `useCase` | string | One or two sentences. |
| `access` | string[] | Bullet list of access/supply commitments. |
| `adoption` | string[] | Bullet list of adoption prerequisites. |
| `research` | `{ lead, geographies, timeline, question }` | Operational research summary. |
| `country` | `{ registered, inGuidelines, inMft, forecastDemand }` | Counts are integers or `"TBC"`; `forecastDemand` is free text. |
| `journey` | array of `{ label, year }` (optional) | The "time between gates" timeline and the cross-product timing chart. `year` is an integer or `"TBC"`. Keep chronological. Only add gates with verifiable dates. |
| `countries` | `{ status, note, list[] }` (optional) | Feeds the country access map. `status`: `illustrative` / `draft` / `verified` — anything but `verified` renders a warning overlay on the map (and needs a `note`). `list` entries are `{ "iso3": "GHA", "level": "registered" \| "guidelines" \| "mft" }` — one entry per country, highest level wins. Replace the illustrative lists with the verified country survey and flip `status`. |
| `volume` | `{ total, period, split[], source }` or `null` | `split` entries are `{ channel, pct }` and must sum to 100. |
| `volumeNote` | string | Required when `volume` is `null` — say why (pre-launch, data being compiled, figures under review). |
| `procurement` | `{ presentations[], source, sources[] }` (optional) | The presentations bought, with no figures. Shown in the procurement card only while `volume` is `null`; ASPY and DHA–PPQ use it since 5 Nov 2026, when Unitaid asked for the procurement figures to come off the dashboard (they are parked in `data/parked/2026-11-05-procurement.json`). Keep the names sorted by strength and pack size, never by amount bought. See `docs/unitaid-feedback-nov5-notes.md`. |
| `milestones` | array | `{ milestone, status, label, date, next, anticipated, source }`. `label` is the pill text (e.g. "25+ countries", "Delayed +2 qtrs"). |

### Placeholder product (e.g. spatial emanators)

`{ id, placeholder: true, name, inn, manufacturer, classLabel, note }` — renders
as a greyed row with the note. To **activate** it into a tracked product:
remove `placeholder`, add `class`, `currentStage`, `stages[8]`, `flag`, `detail`,
and log it in the changelog.

## 5. Source hierarchy

Prefer, in order:

1. **WHO** — PQ list of prequalified medicines, PQ EOI list, Guidelines for
   malaria, GDG meeting schedules, PADO reports.
2. **Stringent regulators** — EMA (incl. Article 58 opinions and label changes),
   US FDA.
3. **Procurement databases** — Global Fund PQR (volumes, reference prices), PMI
   annual reports.
4. **National regulators / ministries** — registration databases, published
   treatment guidelines.
5. **Developer/manufacturer announcements** — Novartis, MMV, MORU/DeTACT, Shin
   Poong press releases. Fine for milestones; not sufficient alone for prices.
6. **LAUNCH's own surveys/assessments** — label the source
   `"LAUNCH assessment (draft)"` until verified.

Several of these are already collected for you on a schedule — WHO PQ lists,
EMA EU-M4all opinions, ClinicalTrials.gov records, Global Fund grants and
disbursements land in `sourcing/staging/*.csv` with per-row source URLs and
retrieval dates (see [sourcing/README.md](../sourcing/README.md)). Start
there; the full catalog of public sources per data category — including the
ones that still need manual pulls — is in
[data-sourcing-plan.md §3](data-sourcing-plan.md#3-public-source-catalog).

## 6. Data status transitions

| From → to | Checklist |
| --- | --- |
| `illustrative` → `draft` | Every value replaced with a sourced public figure or `TBC`. |
| `draft` → `live` | Every non-TBC figure verified against its source within the last quarter; every price/volume either public-sourced or covered by a written manufacturer confirmation; every product's `countries.status` either `"verified"` or the block removed; sign-off recorded (see §7); prototype badge removal agreed. |

## 7. Manufacturer confirmation register (kept OUTSIDE this repo)

`confirmedInWriting: true` may only be set when a written confirmation exists.
Keep the register in the team document store (SharePoint/Drive) — never in this
public repo. Record per entry: product, exact data point(s) covered, who
confirmed (name/org/role), date, link to the written confirmation, and any
conditions or expiry. If a confirmation is withdrawn or expires, flip the field
back to `false` **in the same commit** that removes or proxies the figure.

## 8. Recipes

**Mark a stage delayed** — set `status: "late"`, write the reason with dates in
`note` ("GDG review slipped from Q3 2026 to Q1 2027 (+2 quarters)"), set the
product `flag`, update `asOf`, add a changelog entry.

**Clear a delay** — set the stage to `done`/`prog`, remove or rewrite `flag`,
changelog it.

**Record a price** — set `price.value`, `note` (unit and basis), `source` or
`confirmedInWriting: true` (register entry first), `asOf`, changelog.

**Add a journey gate** — append `{ "label": "...", "year": 2026 }` in
chronological position; only verifiable dates. Feeds both the per-product
timing card and the cross-product timing chart.

**Update the country map** — edit `detail.countries.list` (`iso3` + `level`,
one entry per country, highest level wins: `mft` > `guidelines` >
`registered`). While entries are unverified, keep `status: "illustrative"` or
`"draft"` — the map shows a warning overlay automatically. When the country
survey is verified, replace the whole list and set `status: "verified"` in the
same commit; the overlay disappears.

**Move the current-stage marker** — update `currentStage` (0-based index into
the stages array).

**Move a product on the pipeline poster** — update `phase` when a development
gate is passed (`preclinical` → `phase1/2/3` → `regulatory` → `access`), in the
same commit as the stage/milestone change it reflects, and changelog it.

**Add a product** — copy an existing product block, change every field, keep
exactly 8 stage entries, validate.

## 9. The quarterly "what changed" brief

```bash
node scripts/make-brief.js              # default window: last 90 days
node scripts/make-brief.js --since 2026-06-01   # explicit window start
```

Writes `briefs/launch-brief-<date>.md` (and `briefs/latest.md`). It compiles:
where every product stands, stage-status movements against the closest
`history/` snapshot before the window, the changelog entries in the window,
active bottlenecks, and every remaining TBC gap (your verification to-do list).
While `dataStatus` is not `live`, the brief says so — verify before circulating
externally. Run it quarterly (the monthly reminder issue includes it) and after
any major milestone event.

## 10. Troubleshooting validator errors

| Error says | Fix |
| --- | --- |
| *not strict JSON* | Look for single quotes, a trailing comma, or a comment inside the object. The message gives the position. |
| *stages must have exactly 8 entries* | You deleted or duplicated a stage entry — one per stage name, in order. |
| *a delayed stage must carry a substantive reason* | Write the actual reason (≥ 15 chars) in the stage `note`. |
| *has a delayed stage but no top-level "flag"* | Add the one-sentence bottleneck `flag`. |
| *a displayed price needs confirmedInWriting=true or a public "source"* | Either add the source, set the confirmation flag (register entry first), or set the value to `"TBC"`. |
| *split percentages sum to N* | Make the channel percentages sum to 100. |
| *country.X must be a non-negative integer or "TBC"* | No estimates — a number you can source, or `"TBC"`. |
| *countries.status must be illustrative/draft/verified* | Use one of the three values; `"verified"` only when the survey is signed off. |
| *unverified detail.countries needs a substantive "note"* | Write the map-overlay warning text (what the data is and isn't). |
| *countries.list[N].iso3 / .level* | 3-letter uppercase ISO codes; level is `registered`, `guidelines` or `mft`; no duplicate countries. |
| *detail.procurement.presentations must be a non-empty list* / *names a presentation twice* | One name per presentation bought, as text, each once. |
| *detail.procurement is not shown while detail.volume has figures* (warning) | You restored `volume`: delete `procurement`, or the other way round. |

Warnings (missing `asOf`, missing source on a done milestone) don't block a
push, but treat them as your to-do list.

## 11. Suggested cadence and ownership (fill in)

| What | Cadence | Owner |
| --- | --- | --- |
| Milestone scan (WHO PQ list, WHO guidelines news, EMA, regulator sites) | Monthly | _name_ |
| Procurement data pull (Global Fund PQR, PMI) | Quarterly | _name_ |
| Country survey refresh (registrations, guidelines, MFT) | Quarterly | _name_ |
| Manufacturer check-in and confirmation refresh | Quarterly | _name_ |
| Ad-hoc update on any public milestone event | Within 5 working days | _name_ |
| Sign-off before `dataStatus: "live"` or any price change | Per change | _name_ |
