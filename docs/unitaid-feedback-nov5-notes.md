# Unitaid feedback, 5 November 2026: working notes

Branch `feedback/unitaid-nov-5`, from `main` at `6cdab21`. The state before
this branch is kept as the branch `archive/main-before-unitaid-2026-11-05`
(same commit, pushed 5 Nov 2026), for the later phases that may need it.

## What Unitaid asked

Message of 5 Nov 2026, for the dashboard and its French and Portuguese pages:

1. "delete anywhere it says 'recommended underutilized'"
2. "delete (but keep somewhere else because we will add it in later) the data
   for the mapping and any cost figures/numbers/amounts - people will freak out
   if these are not exactly correct"
3. "put the disclaimer in yellow and i need to double check the wording exactly"

Asked back which procurement numbers go, Unitaid answered (WhatsApp, 5 Nov):
"keep the presentation but remove the numbers ... Remove all the numbers so
that people cannot argue about it".

## Decisions

**The map stays.** Request 2 was first read as removing the country access
map and its country lists. The owner corrected that: the map, its lists, the
country counts and the disclaimer's "Country registrations have been verified
for" sentence are all unchanged. Parking the lists would also have removed
that disclaimer sentence, which Unitaid is still checking the wording of.

**Cost figures: the presentations stay, every number goes.** Three versions
were shown to the owner as screenshots: (A) remove every procurement number,
(B) remove only money and keep transactions, packs and treatment courses, and
the one Unitaid chose, A plus the list of presentations bought. B was rejected
by Unitaid's own rule: a pack count comes from the same Global Fund extract as
a dollar figure and is as easy to dispute. Removed, for ASPY and DHA–PPQ:

- the procurement card's total and value, the 2025 value, the top buyers (a
  ranking by value), the Transactions, Packs and Treatment courses columns and
  the rule for estimating courses;
- the same figures in the procurement step's note, the "Procurement scale-up"
  milestone and the map's side panel ("Public-channel procurement");
- DHA–PPQ's share of Global Fund orders by value in `flag` and `barrier`
  (hidden on the page since 20 Oct, but still in the data and the dataset);
- DHA–PPQ's PQR median pack price in `detail.price.note` (never shown on the
  page, but in the data file the site serves and in `dashboard.json`).

The start years stay ("Since 2018", "Since 2008", the owner's choice): they
are dates already on each timeline, not amounts.

**Removed from the data, not hidden on the page.** A page switch, as used for
"Delayed" on 20 Oct, was rejected: the CSV download carries the step notes and
milestone rows, `dashboard.json` (RBM's module and its `/api/unitaid/data`)
carries everything, and the site serves `data/products.js` itself. So the
figures leave `data/products.js` for `data/parked/2026-11-05-procurement.json`
(13 product values and 5 changelog entries, each as it read before), which no
page, export or dataset reads.

**A new field, not a table with the numbers blanked.** The rules require a
`volume` to have a total, a period, a split and whole-number counts, so the
list could not stay inside `volume` without loosening four rules, and
`scripts/build-procurement-summary.js` would refill it from the extract. The
list is its own optional field, `detail.procurement = { presentations[],
source, sources[] }`. The page shows it only while `volume` is `null`, so
restoring `volume` brings the old card back unchanged. The validator warns if
both are present. The procurement writer now stops with a pointer to the
parked file instead of its generic "no detail.volume" error.

**Sorted by strength and pack size.** The table was sorted by packs bought,
largest first, so even without numbers its order would have said which sold
most. ASPY lists 2 presentations, DHA–PPQ 12.

**The card's layout** (owner: "make it look professional"). A notice that the
figures are under review, then the presentations as tiles, medicine and
strength on top and pack below, then the scope sentence and the source. More
than three presentations make the card full width, as the old table was
(DHA–PPQ: 4 tiles a row at 1280 px); ASPY's two fit a normal card; on a phone
the tiles stack. Each name splits at its first " · ", " - " or run of spaces:
the Portuguese translations of 13 of the 14 names drop the " · " (three spaces
or " - " instead), and a " · "-only split left them without a pack line. All
14 split correctly in French and Portuguese.

**The label: removed (owner's choice 1b, over 1a "WHO-recommended").** The
page no longer draws the chip for the two market medicines. `classLabel` must
not be empty, so the data now reads "WHO-recommended", which option B and
Story (not in the menu) still show. "but underused" is gone from About
LAUNCH; the Pipeline page's category reads "WHO-recommended" (legend and
cards). No "underutilized" or "underused" is left in `data/products.js` or on
the dashboard and Pipeline pages. The synthetic test dataset
(`data/products.synthetic.js`, not on the public site) still says
"Recommended · underutilized" twice, as do docs and history.

**The disclaimer: pale yellow (4a, over a stronger fill).** New tokens
`--notice*`; the wording is unchanged until Unitaid confirms it.

**Changelog: one neutral line (3a, over none).** "Procurement figures are
withdrawn while they are reviewed. ..." dated 2026-11-05, which the subscriber
email sends. Five older entries no longer quote procurement figures (19 Oct,
15 Oct, 8 Sep for "underused", and the two of 23 Aug). The email treats a line
as new only if it is dated on or after the last email's `lastUpdated`
(2026-11-03), so these August to October rewordings are not sent again. The
three 3 Nov entries were left alone for that reason; none quotes a figure.

## Deferred, descoped, found in passing

- **Disclaimer wording**: waits for Unitaid.
- **RBM module**: the same changes in `rbm-module-unitaid` (the procurement
  card's list, the yellow, the chip, About LAUNCH, messages, bundled data) as
  release v1.2.0, after this merges and the translate bot has run. Antonio is
  to be asked to import v1.2.0 rather than v1.1.1 (nothing is imported yet;
  RBM's import script cannot upgrade changed keys).
- **Translations**: the new sentences are machine-translated by the bot; the
  professional translators should review them. The presentation names keep
  the translators' existing words.
- **Not mirrored in `data/products.synthetic.js`** (schema checklist step 1):
  the list only shows while `volume` is null, so mirroring it would either be
  invisible or replace a synthetic figures table, and would add a warning to
  a file expected to have none.
- **Not in the linked-data export**: `build-ontology.js` does not emit
  `procurement`; on its next rebuild the two `ProcurementVolume` nodes go.
- **Power BI CSVs** (`powerbi/data/`) were already stale and still say
  "Recommended · underutilized"; not regenerated.
- **`illustrated-journey-dashboard.html`** (the pre-v1.0 copy; its address
  redirects to `/`) is unchanged: it would show a dash and the review note.
- **`history/` snapshots** keep the old figures: append-only, not served.
- **Layout, already so on `main`**: "Operational research" sits alone on its
  row whenever the procurement card is full width.

## Restoring the figures

Put each value in the parked file back at its path, delete
`detail.procurement`, run `node scripts/validate-data.js` (expect 0 errors,
1 warning), and add a changelog line. Put the old changelog wording back only
if the figures were confirmed as they were.

## Status

- Branch `feedback/unitaid-nov-5`, 1 commit on `6cdab21`, pushed with this
  commit for a pull request to `main`; its CI result is on the pull request.
- Verify block: treatment policy byte-identical; validator 0 errors, 1 warning
  (French Guiana); synthetic 0 and 0; preview builds; `test-build-dataset`
  58 passed, 0 failed (after a temporary `assemble-content.js`; with the stale
  `content.en.json` it skips and still exits 0); country names cover all 252.
  Every other CI step run locally passes, SHACL included (0 violations).
- Files: `data/products.js`, `data/parked/2026-11-05-procurement.json`,
  `index.html`, `pipeline.html`, `scripts/{data-rules,validate-data,
  assemble-content,build-locale-pages,build-dataset,build-procurement-summary}.js`,
  `docs/data-analyst-guide.md`, this file. `i18n/content.en.json` is left to
  the translate bot.
