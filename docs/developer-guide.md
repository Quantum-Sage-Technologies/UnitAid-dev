# LAUNCH Dashboard — Developer Guide

*For anyone maintaining or extending the code, including RBM's web team at handover.*

> New to malaria product access? Read the **[domain primer](domain-primer.md)**
> first — it explains what the dataset means (the 8-stage pathway, the actors,
> why these four products, the terminology) and why the governance rules are
> shaped the way they are. Most schema decisions trace back to facts in it.

## 1. Architecture in one paragraph

A **static** site with no build step and no backend, on purpose: one HTML file renders
one data file in the browser. There is no framework, no bundler, no package.json
— the pages are plain files (served by Vercel today, through
`scripts/build-public-site.sh`; any static host later).
The reason: the dataset is tiny (a handful of products ×
~10 metrics), the maintainers are analysts rather than developers, and the
18-month initiative will be handed over — so there is nothing to install,
upgrade, or break.

**One exception, since 1 Oct 2026:** `api/` holds Vercel functions behind the
illustrated journey page's two forms. For Subscribe, `subscribe.js` saves the
address in Resend, emails it a welcome with an unsubscribe link and tells the
team (single opt-in since 6 Oct), and `unsubscribe.js` takes it off again. For Send feedback (since 2 Oct),
`feedback.js` emails the report to the team (§9c). They need no install
either — no package.json, plain `fetch`. Nothing else talks to them, and
every page still works without them.

## 2. Repo map

| Path | Role |
| --- | --- |
| `index.html` | The illustrated journey, the production page (moved here from `illustrated-journey-dashboard.html` on 20 Oct 2026; see `docs/dashboard-at-index-notes.md`). The only page that is translated (`fr/`, `pt/` built from it), built for RBM, and carries the Subscribe and Send feedback forms and the MapLibre country map. |
| `illustrated-journey-dashboard.html` | The illustrated journey as it was before Launch v1.0 (commit `174b68e`), kept so its address still works. Deployed, but nothing links to it and nothing is built or translated from it. Do not edit it; change `index.html`. |
| `option-b.html` | Design option B (comparison matrix): a standalone layout study for client review. Same data contract, feature subset. See §10. |
| `pipeline.html` | Pipeline poster view (MMV-style phase columns), complementary to A/B rather than competing. Placement driven by each product's `phase` field; cards deep-link to `index.html#<id>`. Single-theme poster by design. |
| `story.html` | Scroll-driven data story. Steps (left) drive a sticky layered visual (right) via IntersectionObserver (guarded — no IO means step 0 stays active). Every figure is derived from the data at render time — the hero product is `pyramax` falling back to the first `market` product, the headline gap is computed from its `journey`, so the narrative self-updates. Count-up respects `prefers-reduced-motion`. |
| `widget.html` | Embeddable one-row product tracker for partner sites (`?product=<id or name>`). Dependency-free; reads the same data file. |
| `data/products.js` | The data contract: `window.LAUNCH_DATA = { …strict JSON… }`. The only file analysts touch; **feeds all three pages**. |
| `assets/report-issue.js` | The **Send feedback** front end (DEV-04; called "Report an issue" until 30 Sep 2026): floating pill and modal, self-injecting styles. Shared by every dashboard page — one `<script src="assets/report-issue.js" defer>` include each. Connected on the illustrated journey page only, where it posts to `api/feedback.js`; on every other page Send is blocked. See §9c. |
| `api/` | Vercel functions for the illustrated journey page's forms. Subscribe, single opt-in since 6 Oct: `subscribe.js` (the form → Resend contact, welcome email with an unsubscribe link, team inbox), `unsubscribe.js` (the welcome's link and the mail app's one-click unsubscribe). Send feedback: `feedback.js` (the report → team inbox, Reply-To the visitor). And `_mail.js` (shared, and where the addresses are set; the underscore keeps it from being a route). The two secrets, `RESEND_API_KEY` and `UNSUBSCRIBE_SECRET`, are env vars on the Vercel project. Decisions in [email-backend-notes.md](email-backend-notes.md). |
| `data/world-map.js` | Generated geometry: `window.LAUNCH_MAP = { w, h, countries: { ISO3: { n, d } } }`. Natural Earth 110m, public domain. Committed output — regenerate with `scripts/build-map.js`, never hand-edit. |
| `history/` | Dated snapshots of the data file, bot-committed by `publish.yml` on every data change. Append-only, one per date: a later change the same day replaces that day's snapshot, so it holds the day's final state. The raw material for future trend charts and playback. |
| `feed.xml` | RSS 2.0 feed of changelog entries, bot-rebuilt by `publish.yml`. |
| `scripts/validate-data.js` | Node validator: strict-JSON extraction + governance rules. Exit 1 on error. |
| `scripts/make-preview.js` | Inlines the data **and map** files into `preview.html` (single-file build of option A for email/artifact sharing). Optional; never required to deploy. |
| `scripts/make-feed.js` | Regenerates `feed.xml` from the changelog. Run by CI; safe by hand. |
| `ontology/` | Semantic layer: `launch.ttl` (hand-authored OWL/SKOS ontology), `context.jsonld` (JSON-LD context) and `launch-shapes.ttl` (SHACL twin of the validator's governance rules — change them together) are source; `launch-data.jsonld` (dataset projection) and `launch-history.jsonld` (temporal graph over `history/`) are **generated**, bot-rebuilt by `publish.yml`; `index.html` is the **generated** browsable rendering (rerun `scripts/build-ontology-page.js` after Turtle edits). See [docs/ontology.md](ontology.md). |
| `scripts/build-ontology-page.js` | Rebuilds `ontology/index.html` from the two Turtle files (zero-dep mini Turtle parser). Manual — rerun after editing `launch.ttl` / `launch-shapes.ttl`. |
| `scripts/build-ontology.js` | Regenerates `ontology/launch-data.jsonld` from the data contract. Run by CI on data changes; run by hand after schema-layer edits. |
| `scripts/build-map.js` | One-off map-geometry generator (dev-only deps documented in its header). |
| `.github/workflows/validate.yml` | CI: validator + preview build on every push/PR. |
| `.github/workflows/publish.yml` | On `data/products.js` changes: validates, snapshots to `history/`, rebuilds `feed.xml`, `ontology/launch-data.jsonld` and `ontology/launch-history.jsonld`, bot-commits. Path-filtered so its own commit cannot retrigger it. |
| `.github/workflows/translate.yml` | The translate bot. After a hand-made change to the illustrated page, `data/products.js` or `sources.js` reaches `main`: rebuilds `i18n/content.en.json`, translates only new strings into French and Portuguese, checks both pages, bot-commits `i18n/` and redeploys. Also started by `publish.yml` after an approval, as a safety net. Approved proposals are translated before they merge, by `scripts/proposal-translate.sh` in `proposal-decision.yml`. See [translation-notes.md](translation-notes.md). |
| `i18n/` | The translation layer (DEV-31): `content.en.json`, the English content and its `contentHash` — **generated** by `scripts/assemble-content.js`, never hand-edited — and `translations.json`, the translation memory, where `fr`/`pt` hand corrections live. `scripts/build-locale-pages.js` builds the `/fr/` and `/pt/` pages from them at deploy time. See [jackson/DEV-31.md](jackson/DEV-31.md). |
| `.github/workflows/publish-dataset.yml` | **Publish to RBM data repo.** Builds `dashboard.json` (`scripts/build-dataset.js`, contract `public-data/v1/schema.json`) from `main` and pushes it, with a timestamped archive copy and a `CHANGELOG.md` entry, to the public repo named by the `RBM_DATA_REPO` variable (token: `DATA_REPO_TOKEN`, a fine-grained token with Contents read and write on that repo; it replaced the deploy key `DATA_REPO_DEPLOY_KEY` on 3 Nov 2026, because the organisation disables deploy keys). Starts by itself at the end of every approval (`translate.yml`, `after_approval`), or by hand ("Publish now", with a reason and a dry-run box). Refuses to publish over a hand change to the published files (drift check). RBM's pages do not fetch it: they read a copy beside them, `data/dashboard.json`, replaced after each publish with `node scripts/copy-rbm-pages.js --to ../launch-rbm-test --data-only` (since 27 Oct 2026). The same commit publishes one file per language, `dashboard.en/fr/pt.json` (contract `schema.lang.json`, worked out from `schema.json`), which the React version for RBM's Next.js site fetches itself (since 28 Oct 2026). See `docs/public-data-layer-notes.md` and `docs/data-per-language-notes.md`. |
| `.github/workflows/notify-subscribers.yml` | **Email subscribers about updates.** Daily at 15:00 UTC: one Resend broadcast to the subscriber segment listing the changelog lines added since the last update email (`scripts/notify-subscribers.js`); nothing on a day without new lines. Manual run: `preview` (team inbox only) or `send` (everyone, now). Needs the `RESEND_API_KEY` repository secret. See [subscriber-updates-notes.md](subscriber-updates-notes.md). |
| `.github/workflows/reminder.yml` | Monthly cron: opens the milestone-scan checklist issue. Also runnable manually (workflow_dispatch). |
| `.github/workflows/sourcing.yml` | Scheduled source fetch: weekly trial watch (Mon), monthly Global Fund + regulatory pulls (3rd); bot-commits outputs under `sourcing/` only and opens watch issues on changes. Manually runnable with a fetcher picker. |
| `.github/workflows/source-proposals.yml` | **The source watchers.** After every scheduled fetch, runs one script per source (`scripts/propose-*.js`) and files a proposal issue for anything a public source states outright, then starts intake for each. Anything that needs judgement stays in the run summary and the watch report. Manually runnable with a test file per source (`test-data/`). See [source-proposals-notes.md](source-proposals-notes.md). |
| `.github/workflows/proposal-intake.yml` | When a proposal issue is filed or edited, by a person or a source watcher: checks it against the data rules with the change applied, snapshots it into `data/proposals.js`, opens it as a pull request and asks for a preview. |
| `.github/workflows/proposal-decision.yml` | When a reviewer labels a proposal issue: `approved` merges its pull request, after checking it is exactly the snapshot applied to `main` as it is now, and translates it first; `rejected:…` records the reason and fingerprint in `data/decisions.js`. |
| `.github/workflows/pr-preview.yml` | Builds the public site from a pull request's commit and deploys it as a Vercel **preview**, never production, keeping one comment on the pull request with the link. Time limits: 5 minutes on the deploy step and 10 on the job (§8b). See [pr-preview-notes.md](pr-preview-notes.md). |
| `.github/workflows/vercel-deploy.yml` | On every push to `main`, calls the Vercel deploy hook. It also runs by dispatch, because a merge made by the approval bot starts no push workflows. |
| `sourcing/` | Public-source data collection area: append-only raw snapshots, regenerated staging CSVs, generated watch reports. Upstream of analyst edits — **never feeds the pages directly**. Self-documented in its own README; design in [docs/data-sourcing-plan.md](data-sourcing-plan.md). |
| `scripts/fetch-trials.js` | ClinicalTrials.gov v2 fetcher: portfolio trial snapshots + staging CSV + what-changed report (status, phase, completion-date, results diffs). |
| `scripts/fetch-globalfund.js` | Global Fund Data Service (OData v4.2) fetcher: malaria grants + disbursement transactions → grant and grant-year staging CSVs. |
| `scripts/fetch-regulatory.js` | WHO PQ (medicines + vector control, CSV export) and EMA EU-M4all (nightly xlsx, zero-dep ZIP/xlsx reader) fetcher → `regulatory_events` staging CSV + listings watch report. |
| `scripts/fetch-nafdac.js` | NAFDAC Greenbook (Nigeria) fetcher — server-side DataTables JSON endpoint, plain HTTP by necessity → `nafdac_registrations` staging CSV + registrations watch report. |
| `scripts/fetch-tmda.js` | TMDA IMIS2 (Tanzania) fetcher — common-name lookup + paged public-search JSON backend → `tmda_registrations` staging CSV + registrations watch report. |
| `scripts/register-lib.js` | Shared library for the ZAMRA, MCAZ, DAV and Rwanda FDA fetchers: portfolio matching, one staging layout, snapshot and watch-report diff. Not run directly. |
| `scripts/fetch-zamra.js` | ZAMRA (Zambia) fetcher — IMIS public-access JSON, whole register in one call; adds the intermediate certificate in `scripts/certs/` → `zamra_registrations` staging CSV + watch report. |
| `scripts/fetch-mcaz.js` | MCAZ (Zimbabwe) fetcher — Kendo grid JSON, whole register in one POST → `mcaz_registrations` staging CSV + watch report. |
| `scripts/fetch-dav.js` | DAV (Viet Nam) fetcher — JSON search per ingredient stem → `dav_registrations` staging CSV + watch report. |
| `scripts/fetch-rwanda.js` | Rwanda FDA fetcher — one HTML page, rows read from their `data-*` attributes → `rwanda_registrations` staging CSV + watch report. |
| `scripts/normalize-pqr.js` | Normalizes a **manually downloaded** Global Fund PQR Tableau crosstab (UTF-16/TSV tolerant) → `procurement_transactions` staging CSV + gzipped raw copy. Scripted PQR export is WAF-blocked — don't automate it. |
| `.nojekyll` | Tells GitHub Pages to serve files verbatim. |
| `streamlit-app/` | Parallel Python platform (analyst workbench): same data contract, flexible sources (file/URL/upload), runtime config, Plotly charts. Self-documented in its own README; `launch_data.py` is the pure-Python data layer, `app.py` the UI. Not part of the static deploy. See §11. |
| `powerbi/` | Power BI kit: live Power Query (M) scripts against the Pages data URL, CSV exports + generator, LAUNCH report theme, DAX measures, page-by-page build guide. Self-documented in its own README. See §11. |
| `scripts/make-brief.js` | Generates the quarterly "what changed" brief into `briefs/` (diffs stage statuses against the closest `history/` snapshot before the window). |
| `briefs/` | Generated what-changed briefs; `latest.md` is the stable pointer. |
| `decks/` (gitignored) | Local-only stakeholder briefing decks (.pptx) — deliberately kept out of the public repository. |
| `docs/` | This documentation set, including the remaining-tasks checklist. |
| `UPDATING.md` | Pointer to the data-analyst guide (kept for old links). |

## 3. The data contract

`index.html` loads `<script src="data/products.js">`, which assigns
`window.LAUNCH_DATA`. A plain `.js` assignment (rather than `fetch`ing `.json`)
is deliberate: it works from `file://` when an analyst double-clicks
`index.html`, with no CORS or server requirement. The body after the assignment
must still be strict JSON — the validator extracts it with a line-anchored
regex (`/^window\.LAUNCH_DATA\s*=\s*/m`) and `JSON.parse`s it, so JS-only
syntax (comments, single quotes, trailing commas) inside the object fails CI.

Schema reference: see the [data analyst guide](data-analyst-guide.md) §4;
entity relationships, keys and the lineage of every derived data product are
in [data-model.md](data-model.md). The renderer and validator must agree on
the schema; change both together.

## 4. Rendering pipeline (`index.html`, bottom `<script>`)

> **Out of date.** This section describes the journey board (design option A)
> that was `index.html` until 20 Oct 2026. `index.html` is now the illustrated
> journey, whose rendering is not written up here yet. See
> `docs/dashboard-at-index-notes.md`.

Order matters:

1. **Guard** — if `window.LAUNCH_DATA` is missing, show the error banner and stop.
2. **Meta** — format `lastUpdated`; pick the banner text from `meta.dataStatus`
   (`illustrative` / `draft` / `live`); populate the header note.
3. **Changelog** — first 8 entries into the Recent updates panel.
4. **Summary stats** — *derived*, never hand-typed: tracked = non-placeholder
   products; bottlenecks = products with any `late` stage; pipeline = products
   with `class: "pipeline"`. Keep it this way — a stat that can't disagree with
   the board is the point.
5. **Board render** — one `<section class="product">` per tracked product:
   identity column, 8-stage track (dots carry `data-*` attributes for the
   tooltip), optional red `flagnote`, and a hidden `detail` panel (metric cards,
   optional journey timeline, milestone table).
6. **Placeholder rows** — greyed sections for `placeholder: true` products.
7. **Interactions** — expand/collapse (`aria-expanded` kept in sync); a single
   shared tooltip element (`showTipAt(el, html)` positions it, clamped to the
   viewport, flipping below when near the top).
8. **Glossary** — after the board exists: a TreeWalker wraps the **first**
   occurrence of each term per product in `<span class="gloss" tabindex="0">`
   (word-boundary regex, longest term first, skips inside existing `.gloss`).
   First-occurrence-only is a readability decision.
9. **Country access map** — guarded on `window.LAUNCH_MAP`: builds the SVG once
   from the geometry file, then `selectMap(id)` re-classes paths per product
   from `detail.countries.list` (`lvl-registered/guidelines/mft` + focusable).
   The warning overlay shows unless `countries.status === "verified"`; products
   without a `countries` block get the empty-state message instead. Only
   colored countries get tooltips and tab stops.
10. **Pathway timing chart** — products whose `journey` has ≥ 2 dated gates,
    plotted on a shared year axis (percent-positioned divs, no chart library):
    gate markers with tooltips, gap segments colored by the same ≤2/3–5/>5-year
    classes as the per-product cards, a dashed run-to-today when a `"TBC"` gate
    is pending, and an elapsed-total label. Products not yet plottable are
    named under the chart rather than silently omitted.
11. **CSV export** — builds rows from the same data (stages + milestones),
    quotes per RFC 4180, prepends a UTF-8 BOM (`﻿`) so Excel detects the
    encoding, downloads via a Blob URL.
12. **Print** — `beforeprint` opens the reference panels; CSS `@media print`
    forces detail panels open and hides interactive chrome.

**Escaping**: all data values pass through `esc()` before being interpolated
into HTML. Any new render code must do the same — the data file is trusted-ish
(repo-controlled) but analysts paste text from anywhere.

## 5. CSS system

- **Design tokens** on `:root` (light palette), redefined in
  `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`,
  and again under `:root[data-theme="dark"]` — so system preference and an
  explicit host toggle both work. **Never** give a color its only definition
  inside a theme block; components use tokens only.
- **Status colors** (`--good/--warn/--crit/--idle` + `-soft` fills) are semantic
  and reserved — don't reuse them for decoration. Status is always **shape +
  color** (✓ › ! dashed-circle), never color alone.
- Rebranding to RBM: change the token block(s); components inherit.
- Layout uses flex/grid with `gap`; wide content (tracks, tables, timelines)
  scrolls inside its own `overflow-x: auto` container.

## 6. Validator (`scripts/validate-data.js`)

Plain Node, no dependencies. Structure: extract strict-JSON body → parse →
rule checks pushing to `errors[]` / `warnings[]` → report, exit 1 if errors.

To add a rule: push a clear, **actionable** message (every message names its
fix — keep that property), decide error vs warning (error = the dashboard would
lie or break; warning = provenance debt), and update the analyst guide's
troubleshooting table.

## 7. Testing

No test framework by design; two layers instead:

- **CI** (`validate.yml`, on every push and pull request). As of 6 Oct 2026 it
  runs: the validator on both datasets; the single-file preview build; the
  French and Portuguese pages and their self-check; the RBM `dashboard.json`
  build and its tests (`test-build-dataset.js`, `test-dataset-diff.js`); the
  RBM pages and their test; and the SHACL governance shapes. The workflow file
  is the list. The proposal library has its own test,
  `node scripts/proposal-lib.js selftest`, which CI does not run.
- **Manual/agent smoke test** (jsdom, used during development):

  ```bash
  npm i jsdom   # anywhere outside the repo, or in a scratch dir
  node -e "
  const {JSDOM}=require('jsdom'); const fs=require('fs');
  const html='<!doctype html><html><body>'+fs.readFileSync('preview.html','utf8')+'</body></html>';
  const dom=new JSDOM(html,{runScripts:'dangerously'});
  setTimeout(()=>{ const d=dom.window.document;
    console.log('products', d.querySelectorAll('.product').length,
                'dots', d.querySelectorAll('.stage .dot').length); },300);
  "
  ```

  Run `node scripts/make-preview.js` first. Check: product count, 8 dots per
  tracked product, flags present, expand/collapse toggles `open`.
- **The form functions** (`api/`): `node scripts/test-mail-api.js`. It stubs
  `fetch`, so it needs no Resend key or network, and it checks what would be
  sent to Resend and what the visitor would be told. Run it after any change
  under `api/`. It is not in CI.

## 8. Deployment and handover

- **Now**: Vercel. Production is the project's build of `main`
  (`vercel.json` runs `scripts/build-public-site.sh` into `public-site/`),
  served at `https://launch-development-test.vercel.app` while the work sits in
  the test repository. Every push to `main` deploys, through Vercel's GitHub
  connection and `vercel-deploy.yml`'s deploy hook. CI does not gate that
  deploy, so treat a red CI run as a revert-now signal. Pull requests get
  preview deployments (`pr-preview.yml`, §2).
- **Vercel's Hobby plan refuses to deploy a commit whose Git author has no
  access to the Vercel project.** That applies to previews and to production.
  A commit by someone with access, on top, deploys it. Until the project moves
  to a plan with a seat for each committer, check production after anyone
  else pushes to `main`.
- **Bot commits**: `publish.yml` pushes snapshot/feed commits to `main` after
  data changes, and `translate.yml` pushes `i18n/` commits after changes to the
  page or the data — always `git pull` before pushing local work, or a
  fast-forward rejection will greet you.
- **RBM**: decided 23 Sep 2026, RBM embeds the page in an iframe served from
  this site's own origin, and receives the data as `dashboard.json` through
  `publish-dataset.yml`. `scripts/build-rbm-pages.js` builds RBM's own copies
  of the page, with a copy of the latest published `dashboard.json` beside
  them in `data/` (since 27 Oct 2026; the pages fetched it from the data
  repository before). When those copies change, build them and copy them into a
  checkout of `codebyjackson/launch-rbm-test` by hand
  (`node scripts/build-rbm-pages.js`, then
  `node scripts/copy-rbm-pages.js --to ../launch-rbm-test`), and commit there
  ([rbm/README.md](../rbm/README.md), "For the LAUNCH team"). After each
  publish, pull the data repository and copy the data file alone
  (`node scripts/copy-rbm-pages.js --to ../launch-rbm-test --data-only`);
  the same file is the one sent to RBM. The automatic
  releases (`rbm-vN`) and the daily robot in `launch-rbm-test` were removed
  on 18 Oct 2026. After handover,
  Unitaid owns this repository and the data repository, and RBM receives a
  copy of the files it embeds ([rbm/README.md](../rbm/README.md), "What to
  host"). See
  [rbm-handover-notes.md](rbm-handover-notes.md) and
  [Handoff_Kyler.md](Handoff_Kyler/Handoff_Kyler.md). The `feed.xml` URL
  still points at the old GitHub Pages site: update `SITE` in
  `scripts/make-feed.js` when the final domain is known.
  **The React version** (launch-rbm-test `feat/react-port`, for RBM's
  Next.js site, 28 Oct 2026) takes its interface text from
  `i18n/ui.en.json`, one of `content.en.json`'s buckets (`ui`), so the
  translate bot translates it. `node scripts/build-rbm-messages.js` writes
  `dist/rbm-messages/{en,fr,pt}.json`, everything under `Unitaid` (with RBM's `Sidebar` keys beside it),
  and stops if a message no longer says what this page says (reword both, or
  mark a React-only message `uiOnly` in `i18n/ui.page-forms.json`); then
  `node scripts/copy-rbm-messages.js --to ../launch-rbm-test` and commit
  there. Its data is the one-language files `publish-dataset.yml` publishes.
  See [rbm-messages-notes.md](rbm-messages-notes.md).
  **Since 5 Nov 2026** the hand-over is the `unitaid` module in
  `rbm-data-initiative/rbm-module-unitaid` (release `v1.1.1`): after a message
  or data change, copy `dist/rbm-messages/{en,fr,pt}.json` into its
  `src/app/[locale]/unitaid/i18n/` and the published `v1/dashboard.{en,fr,pt}.json`
  into its `public/unitaid/data/`, run its five checks, and open a pull
  request there. The RBM test site is retired: `launch-rbm-test` `main` is
  now the React version (`copy-rbm-messages.js --to ../launch-rbm-test`
  still works), its static pages are kept at the tag `static-pages-final`,
  and GitHub Pages is off, so `copy-rbm-pages.js` has nothing left to copy
  into there.
- No secrets exist anywhere in the repo or its history; the confirmation
  register lives outside the repo by policy.
- **The two forms (Subscribe, and Send feedback on the illustrated journey)
  need `RESEND_API_KEY` and `UNSUBSCRIBE_SECRET` on the Vercel project**,
  never in the repo. The addresses they send from and to are not secret and
  are set in `api/_mail.js`. Without either secret, or with no team inbox
  set, each form shows its failure message and the function log says what
  is missing. Changing `UNSUBSCRIBE_SECRET` breaks every unsubscribe link
  already emailed. The functions exist only on Vercel, so
  on any static host the forms fail the same way. That is why RBM's copies
  of the page post both forms to the LAUNCH Vercel project instead
  (`scripts/build-rbm-pages.js --api-url`, since 7 Oct), which accepts them
  only from the hosts listed in `PARTNERS` in `api/_mail.js`. Setup, adding a
  partner, and the rate-limit rule:
  [email-backend-notes.md](email-backend-notes.md) §1.

## 8b. GitHub Actions: minutes, time limits and billing

- **Who pays.** On a private repository, Actions minutes are billed to the
  repository's owner: 2,000 free minutes a month on GitHub Free, reset on the
  1st. Extra minutes cost $0.006 each, if a payment method and a budget are set.
  On a public repository the standard runners are free.
- **What a blocked account looks like.** Every job fails within two or three
  seconds and shows no steps. The reason is only in the job's annotations:

  ```bash
  gh api repos/<owner>/<repo>/check-runs/<job id>/annotations --jq '.[].message'
  # "The job was not started because recent account payments have failed or
  #  your spending limit needs to be increased."
  ```

  Read this before blaming a workflow failure on code.
- **What happened in October 2026.** On 1–2 Oct, five preview runs hung at the
  Vercel deploy step for six hours each, GitHub's default job limit. All five
  were commits Vercel refused to deploy (§8). Together they used about 1,810 of
  the month's 2,000 minutes, and from 3 Oct every job was refused, including
  the monthly source fetch.
- **The time limits.** `pr-preview.yml` sets `timeout-minutes: 5` on its deploy
  step and `timeout-minutes: 10` on its job. Both are needed. A step that runs
  out of time fails and the job goes on, so the pull request still gets its
  "preview failed" comment. A job that runs out of time is cancelled, which
  skips that comment and leaves the previous preview link looking current. A
  good run takes under 1.5 minutes.
- **Every other workflow still has the six-hour default.** None of them waits
  on Vercel, but a `timeout-minutes` on each would cap the cost of any future
  hang.

## 9. Extension notes

- **Add a pipeline stage**: append/insert in `stages` *and* add the matching
  entry to every product's `stages` array (the validator enforces the count).
  Track min-width may need adjusting (`.track { min-width }`).
- **Country access map** (implemented): geometry lives in the generated
  `data/world-map.js` (Natural Earth 110m via `scripts/build-map.js` — dev-only
  deps documented in that script; rerun only to change projection or country
  set). The renderer colors countries from `detail.countries.list` and shows a
  warning overlay unless `countries.status === "verified"` — the map can never
  silently present unverified coverage. Self-contained by design: no tiles, no
  CDN — **except the illustrated journey (`index.html`)**, which loads MapLibre
  GL JS from a CDN for its own map rendering only (see below); the other 11 pages sharing
  `data/world-map.js` are unaffected and remain fully self-contained.
- **Resistance overlay** (removed 1 Oct 2026, on both lines of work): the WHO
  Malaria Threat Map treatment-failure, delayed-clearance and molecular-marker
  layers, their data files, normalizers, validator rules and click-through
  panel were taken out of `illustrated-journey-dashboard.html`; the page points
  readers to the WHO Malaria Threats Map instead. See
  `docs/remove-resistance-notes.md` (this repo's removal) and
  [docs/handoff-remove-study-layers.md](handoff-remove-study-layers.md) (Keith's,
  which also reworked the map's filters, legend, colours and Detail rail; merged
  2 Oct 2026). The page still renders its map with MapLibre GL JS against
  `data/world-map-geo.js`; its original justification (the per-site dots) no
  longer applies — see the handoff's "Deferred" list.
- **History snapshots + RSS feed** (implemented): `.github/workflows/publish.yml`
  runs only on `data/products.js` changes, commits `history/products-<date>.js`
  and a rebuilt `feed.xml` as a bot. It cannot retrigger itself (path filter).
  The `history/` folder is the raw material for future trend charts and
  "as of" playback.
- **Embeddable widget** (implemented): `widget.html?product=<id or name>` —
  one-row tracker for partner sites; keep it dependency-free and tiny.
- **"Report an issue" form** (implemented, front end only): `assets/report-issue.js` — see §9c for the backend seam.
- **Analytics**: add the chosen provider's script tag in `index.html` only for
  the production host (consider a hostname guard so localhost/preview isn't
  counted). Prefer a cookieless option (e.g. Plausible) to avoid consent
  banners.
- **Prevention products** (spatial emanators): the stage names are per-dataset,
  not per-product — if prevention needs different gate names (PQ/Vector
  Control), either generalize `stages` to per-product overrides (renderer reads
  `p.stageNames || DATA.stages`) or run a second board section. Decide when the
  product activates.
- **New detail cards**: add the field to the schema (analyst guide §4), the
  validator, and the card template in the product render — in that order.

## 9b. Testing the Streamlit app

Streamlit's own harness runs the whole script headlessly and surfaces
exceptions — use it after any `app.py` change:

```python
from streamlit.testing.v1 import AppTest
at = AppTest.from_file("app.py", default_timeout=60)
at.run()
assert not at.exception, [e.value for e in at.exception]
at.sidebar.multiselect[0].set_value(["ASPY"]).run()      # product filter
at.sidebar.radio[0].set_value("Live site (URL)").run()   # live data source
assert not at.exception
```

Widget indices are position-based — keep the sidebar's control order stable
(source radio first, then the Configuration expander's multiselect → sliders →
toggle) or update the tests. `launch_data.py` has no Streamlit imports, so its
loaders/builders are testable with plain `python -c`.

## 9c. The "Send feedback" form (DEV-04)

`assets/report-issue.js` is the whole feature: one dependency-free file that
injects its own styles, the floating **Send feedback** pill and the modal
dialog. Every dashboard page includes it with a single line before end of file
(`<script src="assets/report-issue.js" defer></script>`) and carries a matching
footer link. Nothing else in the pages knows about it, so it can be dropped or
replaced wholesale.

Openers, all equivalent: the pill · any `[data-report-issue]` element (the
footer link) · any link to `#report-issue` · `#report-issue` in the URL on load
(so a correction request is shareable as a link) · `LAUNCH_REPORT_ISSUE.open()`.
A trigger may carry `data-product="<id>"` to preselect the medicine — that is
the hook for a per-row "report an issue with this product" link, with no change
to the component. The product dropdown is built from `LAUNCH_DATA.products` at
open time, so it never drifts from the board.

**Wording and page context.** Every page shows the same widget, called "Send
feedback" (the default wording used to be "Report an issue"). A page fits it to
what it shows by setting `window.LAUNCH_FEEDBACK_COPY` *before* the script tag;
only the keys given change (see the `COPY` block for the strings, and `types` for
the four dropdown labels, whose *values* are fixed because a backend keys on
them). Two keys are not wording: `view`, a short id such as `"pipeline"` that is
sent as `page.view` so a report says which view it came from, and `connected`.
Without `connected: true` the Send button is disabled and the dialog says
"Mock only" in red. The illustrated journey, Pipeline and Story each set
`view`, an intro and an example message in their own terms.

**Only the illustrated journey sends (since 2 Oct 2026).** It sets
`connected: true`. Then `submitIssueReport()` POSTs the report to
`/api/feedback` (`api/feedback.js`, §1), which emails it to the team inbox
and answers with the reference the dialog shows. The note and done screen
switch to wording that says the report was sent. The `/fr/` and `/pt/`
editions are built from that page, so they send too. Every other page is a
mock: Send is blocked, and **nothing is sent anywhere** — say so to anyone
demoing those pages to real country teams. RBM's copies of the illustrated
journey are hosted without `api/`, so since 7 Oct they send across origins
to the LAUNCH Vercel project (`--api-url`; `--api-url none` turns
`connected` off there instead). Switching another page on is that one key, on
a page the LAUNCH Vercel project serves, or on a partner host. Why it was built this way:
[email-backend-notes.md](email-backend-notes.md) §2.12.

The payload, which `LAUNCH_REPORT_ISSUE.submit` can still be swapped for at
runtime:

```js
{ type, productId, productName, message, name, email, organisation,
  page: { url, path, title, view },
  data: { lastUpdated, dataStatus },   // which data version the reporter saw
  submittedAt, userAgent }
```

The endpoint must answer `{ ok: true, ref: "<reference>" }`; anything else
shows the dialog's failure message, with the report kept for a retry. Keep
the reference: reporters quote it, and it is in the subject line of the
team's copy.

The component is themed entirely through the design tokens, so a page's own
skin (the RBM skin, for one) applies to it with no extra rules.

## 10. Design options (temporary, during client review)

`option-b.html` is a deliberate **fork of the presentation, not of the data or
governance**: it loads the same `data/products.js`, derives the same stats, and
uses the same status semantics, but renders a stages-as-rows × products-as-columns
matrix with its own visual identity (deep green, serif display, dark header
band, single light theme). Both options now include the country access map,
the cross-product pathway timing chart, CSV download, and the Recent updates
panel (the renderers are duplicated per page by design — no shared module
until a winner is chosen). A-only extras: glossary tooltips and print handling.

Maintenance rules while both are live:

- Data/schema changes must keep **both** renderers working — option B reads
  `stages`, `products[*].stages`, `flag`, `currentStage`, `detail.*` and
  `meta.dataStatus`.
- Copy changes that state facts (hosting note, prototype badge, banner texts)
  should be applied to both pages.
- `scripts/make-preview.js` covers option A only; a self-contained option B is
  built the same way (replace its `<script src>` with the inlined data file).

**Consolidation** (when the client decides — tracked in `docs/checklist.md`):
delete the losing file, remove the cross-links, and if B wins, port A's
glossary/CSV/print/timing blocks into it (they are self-contained sections of
A's script and CSS).

## 11. Parallel platforms (Streamlit, Power BI)

The static site is the public flagship; two parallel platforms consume the
same contract. Their per-folder READMEs are the operating manuals — this
section is what a developer must know to keep all three coherent.

**Streamlit** (`streamlit-app/`): `launch_data.py` (pure Python — parser
accepts the `window.LAUNCH_DATA` wrapper or bare JSON, loaders for local
file/URL/uploaded bytes, a lightweight mirror of the validator, row builders)
+ `app.py` (six tabbed views, injected brand CSS, sidebar data-source and
configuration controls). Gotchas learned the hard way: Streamlit floats a
~3.7rem header bar *over* the page — keep the transparent-strip + top-padding
CSS or the branded header clips (and never `display:none` the header: the
mobile sidebar toggle lives in it); alert `icon=` accepts only real emoji
(`ℹ️` yes, `🛈` no); `st.columns` stack automatically on phones — design with
that, custom HTML needs its own media queries. Deploys free on Streamlit
Community Cloud (main file `streamlit-app/app.py`), auto-redeploys on push.

**Power BI** (`powerbi/`): a kit, not a `.pbix` — `queries.m` (the
`fnLaunchData` parser + 8 shaped tables, loading live from the Pages URL, so
published reports refresh with the site), CSV exports for offline work,
`LAUNCH-theme.json`, `measures.dax` (including the governance measures:
`Data Status Banner`, `Map Verification Warning`). M can only execute inside
Power BI/Excel — it cannot be CI-tested here, so treat `queries.m` as
schema-coupled code reviewed by hand. If the hosting URL changes, `DataUrl`
in `queries.m` is the one constant to edit.

### Schema-change checklist

When you add, rename, or restructure a field in `data/products.js`, touch —
in this order:

1. `data/products.js` — the field itself, with provenance where applicable.
   Mirror it in the other dataset implementing the contract:
   `data/products.synthetic.js` (populated value so the feature is testable).
2. `scripts/validate-data.js` — a rule (error for governance, warning for
   provenance debt) + the analyst guide's troubleshooting table.
3. **Static renderers that surface it**: `index.html`, and as applicable
   `option-b.html`, `pipeline.html`, `story.html`, `widget.html` (B reads
   stages/flag/detail; poster reads `phase`; story derives from `journey`,
   `countries`, `flag`; widget reads stages/flag only). Then rerun the
   edition builders so the generated copies pick up the structural change:
   `node scripts/build-unitaid-theme.js` and
   `node scripts/build-synthetic-edition.js`.
4. `streamlit-app/launch_data.py` (row builders / validator mirror) and
   `app.py` (the view that shows it).
5. `powerbi/export-powerbi-data.js` **and** `powerbi/queries.m` (keep the two
   table shapes identical), plus `measures.dax`/README if visualized.
6. The semantic layer, if the field should appear in the linked-data export:
   term in `ontology/launch.ttl`, mapping in `ontology/context.jsonld`,
   emission in `scripts/build-ontology.js`, and — if the validator gained a
   rule for it — the matching shape in `ontology/launch-shapes.ttl`; then
   `node scripts/build-ontology.js` to regenerate
   `ontology/launch-data.jsonld` (see [docs/ontology.md](ontology.md) §7a/§9).
7. `scripts/make-brief.js` if the brief should report it.
8. `docs/data-analyst-guide.md` §4 (dictionary) — and a changelog entry in the
   data file.

Skipping a consumer fails silently (the platforms ignore unknown fields), so
grep the field name across the repo before calling a schema change done.

## 12. Conventions

- Match the existing style: vanilla ES2017+, template literals for markup,
  `esc()` on every interpolated value, no dependencies.
- Accessibility floor: keyboard focusability for anything hoverable
  (`tabindex="0"` + focus/blur mirroring mouse events), `aria-expanded` on
  toggles, `aria-label` on status dots, visible `:focus-visible` outlines.
- Commit style: imperative subject, body explains the *why*; data-only commits
  should also appear in the on-page changelog.
