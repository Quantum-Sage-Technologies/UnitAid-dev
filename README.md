# LAUNCH Transparency Dashboard

Tracks new antimalarial medicines from approval to country access, for the
RBM Partnership to End Malaria and Unitaid.

**Production page: the illustrated journey,
https://launch-development-test.vercel.app/** (`index.html`),
also in French and Portuguese at the same path under `/fr/` and `/pt/`
(for example `/fr/index.html`).

This repository is the source of truth: the data, the pages, the translations,
the email functions in `api/` and every workflow. Two other repositories
receive its output:

- **`codebyjackson/launch-data-test`**: the approved dataset
  `v1/dashboard.json`, written only by `publish-dataset.yml`: the record of
  every publish.
- **`codebyjackson/launch-rbm-test`**: the static pages for RBM in three
  languages, with a copy of the latest published `dashboard.json` beside them
  in `data/`, built by `scripts/build-rbm-pages.js` and copied with
  `scripts/copy-rbm-pages.js` (after each publish: `--data-only`, the data
  file alone).

Developers start with [CLAUDE.md](CLAUDE.md) and the
[developer guide](docs/developer-guide.md).

## Views

Every view reads the same data file and is deployed with the site:

- **Illustrated journey** (`index.html`): the production page. It is the
  only view that is translated, has the Send feedback form (Subscribe for
  updates is hidden for now, 6 Nov 2026; see `docs/hide-subscribe-notes.md`)
  and the MapLibre country map, and is built for RBM.
- **Illustrated journey, before Launch v1.0**
  (`illustrated-journey-dashboard.html`): the same page as it was before the
  Launch v1.0 changes (it still shows "Delayed", "In progress" and barrier
  text). Kept and deployed so its address still works; nothing links to it,
  and nothing is built or translated from it. Do not edit it.
- **Option B, comparison matrix** ([`option-b.html`](https://launch-development-test.vercel.app/option-b.html)):
  stages as rows, medicines as columns, for cross-product comparison at each
  gate.
- **Pipeline poster** ([`pipeline.html`](https://launch-development-test.vercel.app/pipeline.html)):
  the portfolio laid out MMV-poster style — development-phase columns
  (Preclinical → Approved · scaling up), category-colored product cards with
  bottleneck dots, a prevention lane for planned tools. Placement is driven by
  each product's `phase` field; cards click through to the journey board.
- **Data story** ([`story.html`](https://launch-development-test.vercel.app/story.html)):
  "The Waiting Years" — a scroll-driven narrative for donors and advocacy: one
  medicine's decade from approval to (still-pending) adoption, told through a
  sticky visual that shifts from portfolio → timeline → pathway → bottlenecks →
  map → the incoming pipeline. Every number is computed from the data file, so
  the story updates itself as the data changes.

The dataset is at **version 2** (merged 2026-08-25): the first harvest of
collected public-source data — Global Fund PQR volumes, WHO PQ listings, EMA
dates, trial-registry records, and Nigeria/Tanzania register verification —
is now in `data/products.js`, with v1 preserved in `history/`. See the
on-page changelog for what changed.

Design mockup for the LAUNCH (Launch Transparency Initiative) dashboard tracking
new antimalarial medicines from approval to access, to be hosted by the
RBM Partnership to End Malaria.

One row per medicine, 8 pipeline stages with traffic-light status; red flags carry
a one-line reason where a product is stuck. Click a row for the full product profile
(price, use case, access commitments, adoption requirements, country access,
operational research, procured volumes, milestone table).

**Data status: draft** — compiled from public sources (WHO PQ list, WHO guidelines,
EMA, Novartis/MMV/MORU announcements) and pending LAUNCH team verification and
manufacturer written confirmation. Unverified values are shown as `TBC`, never
estimated. `meta.dataStatus` in the data file (`illustrative` / `draft` / `live`)
controls the on-page banner.

## Documentation

| Guide | Audience |
| --- | --- |
| [Project explainer](docs/project-explainer.md) | **All stakeholders, expert and non-expert** — the whole project in plain language: the problem, the domain, how to read the dashboard, where the numbers come from, and how it is built. Start here. Also available as a designed web page: [explainer.html](https://launch-development-test.vercel.app/explainer.html). |
| [User guide](docs/user-guide.md) | Donors, ministries of health, implementing partners, pharma — how to read and use the dashboard. |
| [Data analyst guide](docs/data-analyst-guide.md) | Whoever maintains the data — update loop, data dictionary, governance rules, confirmation register, cadence. |
| [Data model & lineage](docs/data-model.md) | Analysts and developers extending the data — entities, keys and relationships, the lineage of every derived data product, and extension playbooks. |
| [Ontology & linked data](docs/ontology.md) | Integrators and semantic-web consumers — the formal OWL/SKOS ontology of the domain, external alignments (schema.org, WHO ATC, ISO 3166), and the dataset as JSON-LD linked data. |
| [Data sourcing plan](docs/data-sourcing-plan.md) | Data categories mapped to the access pathway, the verified catalog of public sources feeding each one, target dataset designs, collection cadence, and the new data products they enable. |
| [Developer guide](docs/developer-guide.md) | Whoever maintains or extends the code — architecture, rendering pipeline, validator, deployment, handover. |
| [Domain primer](docs/domain-primer.md) | Developers new to the malaria-access domain — what the dataset means: the pathway, the actors, the four products, terminology, and schema-to-domain mapping. |
| [Remaining-tasks checklist](docs/checklist.md) | Living checklist of open items from build stages 1–4, with who's needed for each. |

## Structure

| File | Role |
| --- | --- |
| `index.html` | The dashboard: the illustrated journey, the production page. Static — no build step, no backend. |
| `illustrated-journey-dashboard.html` | The illustrated journey as it was before Launch v1.0, kept unlinked. Do not edit. |
| `option-b.html` | Design option B (comparison matrix). Reads the same data file. |
| `pipeline.html` | Pipeline poster view (MMV-style phase columns). Reads the same data file. |
| `story.html` | Scroll-driven data story ("The Waiting Years") for advocacy audiences. Reads the same data file. |
| `data/products.synthetic.js` | A fictional dataset — same contract as `data/products.js`, validated by the same validator. No page uses it since the `synthetic/` edition was removed; it remains as test data for the validator, serializer and ontology build. |
| `streamlit-app/` | Parallel Python/Streamlit platform: same views, flexible data input (bundled file / URL / upload) and runtime configuration. See [its README](streamlit-app/README.md). |
| `powerbi/` | Power BI kit: live-refreshing Power Query scripts, CSV exports, LAUNCH theme, DAX measures and a page-by-page build guide. See [its README](powerbi/README.md). |
| `data/products.js` | **The only file that changes in routine updates** — feeds every view. Strict JSON wrapped in `window.LAUNCH_DATA =`. |
| `widget.html` | Embeddable single-product tracker for partner sites (`?product=aspy` etc.). |
| `data/world-map.js` | Generated map geometry (Natural Earth, public domain) — rerun `scripts/build-map.js` to regenerate. |
| `assets/journey-icons/icons.js` | **The journey icon set** — the eight stage glyphs, one monoline system on a 24×24 grid, stroked in `currentColor` so each takes its status colour and follows the light/dark theme. Loaded by the dashboards; the single source of truth for the geometry. |
| `assets/journey-icons/*.svg`, `png/` | **Generated** standalone icons + the eight-stage strip, for docs and decks — rerun `scripts/build-journey-icons.js` after editing `icons.js`. |
| `scripts/build-journey-icons.js` | Rebuilds the standalone icon SVGs, `journey-strip.svg` and the PNG fallbacks from `icons.js` (PNGs need Chrome; skipped without it). |
| `history/` | Automatic dated snapshots of the data file (bot-committed on every data change) — the raw material for future trend charts and playback. |
| `feed.xml` | RSS feed of dashboard updates, rebuilt automatically from the changelog. |
| `scripts/validate-data.js` | Data validator — run after every data edit. |
| `sourcing/` | Public-source data collection area (raw snapshots, staging CSVs, watch reports) per [docs/data-sourcing-plan.md](docs/data-sourcing-plan.md) — see [its README](sourcing/README.md). Feeds analyst decisions, never the dashboards directly. |
| `scripts/fetch-trials.js` | Trial watch — ClinicalTrials.gov v2 pull for the portfolio, with a what-changed diff vs the previous snapshot. |
| `scripts/fetch-globalfund.js` | Global Fund pull — malaria grants and disbursement transactions from the Data Service OData API. |
| `scripts/fetch-regulatory.js` | Regulatory pull — WHO PQ medicines + vector-control lists and EMA EU-M4all opinions, with a new-listings/delistings watch report. |
| `scripts/normalize-pqr.js` | Normalizes a manually downloaded Global Fund PQR crosstab into the procurement staging dataset (the download itself must stay manual — scripted export is WAF-blocked). |
| `scripts/fetch-nafdac.js` | NAFDAC Greenbook pull — Nigeria's public register queried for portfolio products, with a new/lapsed-registrations watch report. First NRA register; the template for other countries. |
| `scripts/fetch-tmda.js` | TMDA register pull — Tanzania's IMIS2 public register queried the same way (second NRA register). |
| `scripts/register-lib.js` | Shared helpers (matching, CSV, snapshot, diff) for the ZAMRA, MCAZ, DAV and Rwanda FDA register fetchers. |
| `scripts/fetch-zamra.js` | ZAMRA register pull — Zambia's public register of human medicines, the whole register in one call. |
| `scripts/fetch-mcaz.js` | MCAZ register pull — Zimbabwe's online register of medicines. |
| `scripts/fetch-dav.js` | DAV register pull — Viet Nam's public register of marketing authorisations. |
| `scripts/fetch-rwanda.js` | Rwanda FDA register pull — Rwanda's register of human medicines, one HTML page read from its rows' data attributes. |
| `ontology/` | Semantic layer: `launch.ttl` (hand-authored OWL/SKOS ontology), `context.jsonld` (JSON-LD context), `launch-shapes.ttl` (SHACL governance shapes — the validator's rules, independently verifiable by any RDF consumer), `launch-data.jsonld` (**generated** linked-data projection of the dataset), `launch-history.jsonld` (**generated** temporal graph of status periods over the history snapshots), `index.html` (**generated** browsable rendering, live at [/ontology/](https://launch-development-test.vercel.app/ontology/)). See [docs/ontology.md](docs/ontology.md). |
| `scripts/build-ontology.js` | Regenerates `ontology/launch-data.jsonld` from `data/products.js` — rerun after any data change. |
| `scripts/build-history-graph.js` | Regenerates `ontology/launch-history.jsonld`, the temporal knowledge graph over the `history/` snapshots (status periods per product × stage) — bot-rebuilt by CI on data changes. |
| `scripts/make-preview.js` | Optional: builds `preview.html`, a single self-contained file for emailing/sharing. |
| `scripts/make-brief.js` | Generates a dated "what changed" Markdown brief into `briefs/` (stage movements vs history snapshots, logged updates, bottlenecks, TBC gaps). |
| `docs/` | Documentation for users, data analysts and developers (see table above). |
| `.github/workflows/` | CI: data validation + SHACL governance-shapes check on every push/PR; history snapshot + feed + semantic-layer export rebuilds on data changes; monthly review-reminder issue; scheduled source fetch (weekly trial watch, monthly Global Fund + regulatory pull — see [sourcing/README.md](sourcing/README.md)). |

### Embedding a single product on a partner site

```html
<iframe src="https://launch-development-test.vercel.app/widget.html?product=aspy"
        title="LAUNCH tracker — ASPY"
        style="width:100%;max-width:720px;height:200px;border:1px solid #ddd;border-radius:10px"></iframe>
```

`product` accepts the id or the display name: `ganlum`, `alaq`, `aspy` (or `pyramax`), `dhappq` (or `dha-ppq`).

## Synthetic development data

`data/products.synthetic.js` is a fully fictional dataset (invented companies,
products, prices, volumes and country statuses) that exercises every dashboard
feature — all six pipeline phases, both bottleneck patterns, confirmed prices,
procurement volume splits and country maps at all three levels. It used to
power a `synthetic/` edition of the old journey-board pages; that edition and
the `unitaid/` brand edition were removed when the illustrated journey moved
to `index.html` (docs/dashboard-at-index-notes.md). The dataset stays as test
data for the validator, the serializer and the ontology build.

The dataset carries `meta.synthetic: true` and `dataStatus: "illustrative"`,
so it can't be mistaken for real data. Validate edits to it with
`node scripts/validate-data.js data/products.synthetic.js`. The Streamlit app
can point at the same file via its file/URL input.

## Updating the data

1. Edit `data/products.js` (strict JSON: double quotes, no trailing commas).
2. Validate:

   ```bash
   node scripts/validate-data.js
   ```

3. Commit and push. Nothing else to do — the page reads the data file directly,
   and CI automatically snapshots the change into `history/` and rebuilds
   `feed.xml` and the semantic-layer exports (`ontology/launch-data.jsonld`,
   `ontology/launch-history.jsonld`).

Every data point carries provenance fields:

- `source` — public, citable origin of the figure
- `asOf` — date the value was last verified (`YYYY-MM-DD`)
- `confirmedInWriting` — manufacturer confirmed release of this figure in writing

The validator enforces the governance rules, e.g.: a delayed (red) stage must carry a
substantive reason; a product with a red stage must have a top-level bottleneck `flag`;
a displayed price requires `confirmedInWriting: true` or a public `source`; volume
channel splits must sum to 100.

Summary stats (medicines tracked, active bottlenecks) are computed from the data at
render time — they can never disagree with the board.

## Hosting and deployment

Production is the Vercel project `launch-development-test`. `vercel.json` runs
`scripts/build-public-site.sh` into `public-site/`, and every push to `main`
goes live at https://launch-development-test.vercel.app/ within a minute or
two. CI validates the data on the same push but does not gate the deploy, so
treat a red validation run as a fix-now signal. Pull requests get preview
deployments (`pr-preview.yml`). The functions behind the two forms live in
`api/` and run only on Vercel.

### RBM

RBM embeds the pages in an iframe on dashboards.endmalaria.org (decided
23 Sep 2026). `scripts/build-rbm-pages.js` builds RBM's copies of the
illustrated journey in four languages, `scripts/copy-rbm-pages.js` copies them
into `codebyjackson/launch-rbm-test`, and each page fetches the published
`dashboard.json` when it loads, so a data change needs no rebuild. See
[rbm/README.md](rbm/README.md) and
[docs/rbm-handover-notes.md](docs/rbm-handover-notes.md).

To move the repo to an organisation later, GitHub's *Transfer ownership* keeps
the history and CI; the URLs, the Actions secrets and the deploy key then
need updating.

## Viewing locally

Open `index.html` directly in a browser (no server
needed). To see exactly what Vercel serves, run `bash scripts/build-public-site.sh`
and serve `public-site/`. To share one file, build it with
`node scripts/make-preview.js` and send `preview.html`.

## Products

GanLum (ganaplacide–lumefantrine), ALAQ (artemether–lumefantrine–amodiaquine triple ACT),
ASPY (pyronaridine–artesunate, Pyramax), DHA–PPQ (dihydroartemisinin–piperaquine), plus a
placeholder row for spatial emanators (prevention tool, pending funder approval).

Live preview artifacts (private until shared): option A
https://claude.ai/code/artifact/94826363-58d4-466f-b731-759a6d1e8fc7 · option B
https://claude.ai/code/artifact/a8e7edc7-05bb-434f-8c0b-5b3ea5854542 · pipeline poster
https://claude.ai/code/artifact/bd27d2a0-e0f2-47b5-8003-a6ac08989b6a
