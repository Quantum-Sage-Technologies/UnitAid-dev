# Interface text for the React dashboard — working notes

Branch `feat/rbm-messages`, cut from `origin/main` at `89b2011` on 27 Oct 2026.

RBM is rebuilding the dashboard as React components inside its Next.js app,
which loads interface text through its `i18n.ts`, one JSON file per language.
Data texts (products, sources, stages, glossary, country names) already arrive
translated inside the published `dashboard.json`. This branch adds the other
half: the **interface** text (buttons, labels, headings, messages, the feedback
form, the failure and "being updated" messages).

Decision D9, taken before this branch: the English lives in this repository as
`i18n/ui.en.json`, with named keys, so it stays under the existing
translate-and-approve pipeline. Wiring it into `assemble-content.js` (the
approval hash) was a later, separately reviewed step: **done 28 Oct 2026**,
decisions 11 to 13, for the owner's one-file-per-language structure.

## What is on the branch

| File | What |
|---|---|
| `i18n/ui.en.json` | **new.** 313 keys → English, nested by page area (276 until 28 Oct; then the 37 the React port held back, decision 10). A `_note` at the top says what it is. |
| `i18n/ui.page-forms.json` | **new.** For each of the 58 keys with `{placeholders}`, how `index.html` builds that text, so its existing translation can be found. |
| `scripts/build-rbm-messages.js` | **new.** Writes `dist/rbm-messages/{en,fr,pt}.json` (nested). `--check` writes nothing; `--allow-stale` ships a missing string in English. French gets ’ (decision 9). |
| `scripts/test-build-rbm-messages.js` | **new.** 51 checks (48 when `dist/rbm-messages/` is not built: three compare the built files with the sources). |
| `scripts/copy-rbm-messages.js` | **new** (28 Oct). Copies the three files into `launch-rbm-test/messages/` and leaves `messages/manifest.json` there; refuses to overwrite hand edits. Decision 8. |
| `scripts/test-copy-rbm-messages.js` | **new** (28 Oct). 35 checks, in a temporary folder. |
| `CLAUDE.md` | **changed** (28 Oct). Both message tests added to the verify block. |
| `docs/rbm-messages-notes.md` | **new.** This file. |

`dist/` is git-ignored, so the three output files are built, not committed.

### Conventions in `ui.en.json`

- **Keys** are camelCase segments, dot-separated, nested as JSON objects
  (`map.panel.backToCountries`). Top-level areas match the planned components:
  `header` 5, `banner` 3, `subscribe` 17, `pathway` 6, `stepPanel` 12, `board`
  17, `product` 52, `yardstick` 22, `tooltip` 5, `map` 86 (its own 17, `regions` 7, `groups` 6,
  `tabs` 2, `filters` 10, `legend` 3, `finder` 7, `table` 3, `panel` 31),
  `download` 13, `feedback` 34, `disclaimer` 7, `about` 7, `sources` 5,
  `errors` 6, `common` 16.
- **A string a component needs lives in that component's area.** `common` holds
  only the small vocabulary several areas share: Close, "and", "Source:",
  `{n} year(s)`, the three status words, the two phase names, the access levels.
  Within `map`, strings several sub-areas use sit at `map.*` itself.
- **A key without placeholders holds the page's exact English**, word for word,
  punctuation included ("Key documents.", "Click for details ›"), so
  `key(English)` finds its translation. Do not reword one here: reword the page,
  and the key follows (see the drift check under Deferred).
- **`{name}` is an ICU-style placeholder**, named for what it holds
  (`{medicine}`, `{date}`, `{count}`), never `{0}`.
- **Keys whose names start with `_`** are notes for the reader and never reach
  the output files.

### Page areas (what each holds)

`header` title, "Powered by", the logo's alt text, the description, "Last
updated". `banner` the design-mockup banner (synthetic data only). `subscribe`
the Subscribe panel and its messages. `pathway` the seven-stage strip's
screen-reader labels. `stepPanel` the panel a pathway stage opens. `board` the
medicines table: headings, the Access definition, the access figures. `product`
an opened row: journey views, timeline, the stage panel a marker opens, More
detail, the cards, procurement, the milestones table. `tooltip` the floating
tooltip's own words. `map` the country access map and its rails. `download` the
CSV button, columns and record types. `feedback` the Send feedback widget.
`disclaimer`, `about` (About LAUNCH, About the data, and the Definitions
panel's title), `sources` the footer. `errors` data and sources failures,
including the RBM loader's four messages (`build-rbm-pages.js` `MSG_EN`).

## Decisions

**1. What counts as interface text: what a visitor of the v1.0 page can see.**
I read every line of `index.html`'s markup and script and the parts of
`assets/report-issue.js` the page shows, then checked the result against the
pipeline's own collection: of the 317 `markup`, `js` and `reviewed` strings in
`content.en.json`, 266 are used and 51 are left out on purpose, each for one of
these reasons:

- **32 render only when a v1.0 switch is turned back on.** `YARD_COMPARE` and
  `SHOW_STAGE_EXPECTED` (the yardstick: 23 strings, "Time taken", "Variance",
  "Expected in routine use by …"), `SHOW_LATE` (4: "Delayed", "delayed" and
  the definition, twice), `SHOW_BARRIERS` (2: "Main barrier", "No publicly
  documented barrier identified"), `SHOW_PROGRESS` (3: the step panel's status
  chips). With `SHOW_LATE` off no stage can be "late", so "Delayed" cannot
  appear on any data. Their translations are in the memory; if a switch comes
  back, add the keys then.
- 8 are the site menu (`assets/site-nav.js`), which RBM's pages already drop.
- 3 are console messages for developers; 2 are the schema.org JSON-LD.
- 2 are the widget's default intro and example text, which this page
  overrides (the overrides are in `feedback`).
- 2 are code the collector took for text (`stroke="…"`, `style="background:…"`).
  Harmless: their translations contain a `"`, so `scriptSafe()` never
  substitutes them (checked: 0 occurrences in `dist/locale/{fr,pt}`).
- 2 are other memory forms of text already covered: the filter hint's
  `No national treatment policy lists ${n} yet.` (same English as `map.noPolicy`)
  and the whole `${esc(k)}: ${pg.length ? "lists " : …}` line, whose translation
  the engine returned unchanged; `map.panel.partLists` uses its two words.

Rejected: keeping the switch-gated text too. That adds 32 strings nobody sees,
which the partners asked to hide, and the React port would have to carry
switches it may never need.

Kept although they depend on data rather than on a switch: the design-mockup
banner (shows only for `illustrative` data, i.e. the synthetic dataset), "No
country-level data yet for …" (no current product triggers it), "Pending
since", and the feedback widget's not-connected wording
(`feedback.notConnected`, shown when the RBM pages are built with
`--api-url none`). Each is a real state of its component.

**2. Keys are named by role, not deduplicated by English.** 276 keys hold 260
distinct strings; 14 strings are shared by 30 keys ("Status" in the medicines
table, the milestones table and the CSV; "Send feedback" as pill, title and
button). Rejected: one key per distinct English. It would couple unrelated
components, and the same word can need different translations by role ("Stage"
is a CSV record type in `download.records.stage` and a column in
`map.table.stage`). Rejected: English as the key, which is the memory's own
scheme. Every rewording would rename a key in RBM's components.

**3. Placeholders: the page's form is kept beside the key, and the existing
translation is converted.** Translations are filed under `key(English as the
page writes it)`. The page writes `Stage ${stepNo(i)} of ${STAGE_COLUMNS.length}`
or `"Last updated " + date`, never `{n}`, so `key("Stage {n} of {total}")` finds
nothing. `i18n/ui.page-forms.json` records the page form of each of the 46
placeholder keys, in one of two shapes:

- `page` + `holes` (24 keys): one memory string with `${...}` holes, each
  mapped to its `{name}`, or to `""` for a hole that is always empty on this
  page. `pathway.stageButtonLabel` maps `${exp}` and the cut-off `${n ?` to `""`
  because `SHOW_STAGE_EXPECTED` is off and no stage can be "late".
- `parts` (22 keys): text the page joins with `+`. A string is copied as it is
  into every language (placeholders, spaces, punctuation); `{ "t": … }` is a
  memory fragment, translated. `drop` removes a leading separator the page
  strips itself (`"· expected"` → `expected {date}`).

The builder rebuilds each key's English from its form by the same rule it
applies to translations, and fails if the two differ. So the forms file cannot
silently describe some other text. A translation counts as converted only if
every hole is in it exactly as often as in the English, no `${` is left, and its
`{placeholders}` equal the English's.

**Result: 46 of 46 page forms found; 45 converted in French and 45 in
Portuguese.** The 46th, `tooltip.dataStatus`, joins the word "data", which the
memory has never held.

For a `parts` key, the converted string puts the translated fragment where
English puts it. That is exactly what `/fr` and `/pt` show today, since the page
concatenates the same way, so the conversion assumes nothing new. Unlike the
page, the converted string is now one message a translator can reorder.

Rejected:
- **re-filing the translations under the new `{name}` English** in
  `translations.json`. That is 46 hand edits to the memory the approval
  pipeline owns, and it belongs to the wiring step (Deferred, 1);
- **sending the 46 `{name}` strings to the engine.** That pays again for text
  already translated and loses the memory's existing forms;
- **leaving composed text as separate fragments with no placeholder** (the
  component concatenates). That bakes English word order into React code,
  which placeholders exist to avoid.

Three sentences stay split exactly as the page splits them around markup:
`map.legend.resistanceNote` + `resistanceLink`, `subscribe.organisation` +
`optional`, `sources.keyDocumentsTitle` + `keyDocumentsIntro`. One rich-text
message (`… see the <link>WHO Malaria Threats Map</link>.`) would be new
English with no translation.

**4. Plurals are two keys, not ICU plural syntax.** `common.yearsOne` /
`yearsOther` and `map.panel.donutLabelOne` / `Other` and `donutUnitOne` /
`Other` mirror the page's `n === 1 ? … : …`. The memory holds the two words
separately, the page uses the English rule (French counts 0 as singular), and
the placeholder check would need an ICU parser for `{n, plural, …}`. Left for
the reshape to RBM's structure (Deferred, 3).

**5. A string with no translation fails the build, unless `--allow-stale`.**
That is what was asked. Note that it is *not* what `build-locale-pages.js`
does. There a missing translation always stays English silently, and its
`--allow-stale` is about a stale `content.en.json`. Here a missing or
unconvertible string is listed by key and reason, and with `--allow-stale` the
English is written and reported. A stub value (`TRANSLATE_ENGINE=stub`) counts
as missing. A broken `ui.en.json` or forms file (a placeholder key with no
form, a form that does not rebuild its English, a key that is not camelCase)
always fails, flag or not. These are code errors, not translation gaps.

**6. Translations are copied exactly as the memory holds them.** French has 52
values with a straight apostrophe. The build fails on the one apostrophe use an
ICU reader misreads (next to a brace, as in `l'{stage}`, or doubled); there are
none. Rejected: turning `'` into `’` as `build-locale-pages.js` does inside
JavaScript literals. JSON does not need it, and it would make these files
differ from the memory. **Superseded for French apostrophes by decision 9
(28 Oct)**; everything else is still copied as the memory holds it.

**7. Languages come from `scripts/rbm-manifest.js` `LOCALES`** (`en, fr, pt`),
the same list the RBM pages use, not a second copy. A leftover `es.json` in
`dist/rbm-messages/` is removed on each build. The memory carries no `es`
values (PR #127).

**8. The copy into `launch-rbm-test` is its own script, with a manifest in the
target, and it adopts a hand copy only if it is identical** (28 Oct 2026).
`scripts/copy-rbm-messages.js` copies `dist/rbm-messages/{en,fr,pt}.json` into
`<target>/messages/` (default `../launch-rbm-test`, `--to` to change it,
`--from` for a build kept elsewhere) and writes `messages/manifest.json`: the
sha256 of each file, `built_from` (this repository's commit), `clean`,
`allow_stale` and `untranslated` (the keys per language still in English).
The next copy compares the files there with it. The parts, each with what was
rejected:

- **A separate script, not a `--messages` step in `copy-rbm-pages.js`** (the
  two options Deferred 2 offered). The two copies go to different places: the
  pages to the static branch's root, the messages to the React port
  (`feat/react-port`). `copy-rbm-pages.js` also requires a clean target tree
  and `build-rbm-pages.js`'s manifest, and neither fits here. It reuses
  `fingerprint()` and `LOCALES` from `rbm-manifest.js`, so the hashes and the
  language list are the pages' own.
- **The build stays as it is; the copier rebuilds in memory.**
  `build-rbm-messages.js` writes no record of `--allow-stale` or of what is
  missing, so the copier runs `build()` on the current sources and compares
  the result with the files in `dist/`. If they are equal, the untranslated
  keys are known exactly, and `allow_stale` is true when any language has
  some, because the build writes English for a missing string only with
  `--allow-stale`. With nothing missing the flag changes nothing, so it is
  recorded `false`. Rejected: a build manifest written by
  `build-rbm-messages.js` (as `build-rbm-pages.js` does). It would change a
  reviewed script, and on its own it would not prove `dist/` is still what
  the sources build.
- **A `dist/` that is not what the current sources build is refused**, with
  no switch ("rebuild"). Otherwise the manifest would name a commit and a list
  of untranslated keys that do not describe the files. Rejected: recording
  `allow_stale: "unknown"`. A rebuild takes 0.2 s (`--check --allow-stale`,
  timed 28 Oct).
- **No manifest in the target (the files were copied there by hand on 27 Oct):
  each file already there must be identical to the one this copy writes**,
  line endings aside. A file that differs stops the copy, named, unless
  `--force`; a file that is not there is simply written. With no record of
  the last copy, identity is the only proof that nothing is lost. On
  28 Oct the three files in `launch-rbm-test/messages/` had the same sha256 as
  `dist/rbm-messages/` (built from `280ad5d`), so the first real copy writes
  `manifest.json` alone. Rejected: a `--first-copy` flag as in
  `copy-rbm-pages.js`. It accepts whatever is there without comparing, and the
  comparison is possible here. Rejected: always refusing without a manifest.
  That would demand `--force` for files proven identical.
- **What counts as a hand edit:** a file the last manifest lists that now has
  another hash or was deleted, a language file the manifest does not list that
  differs from the build, and an unreadable `manifest.json`. `--force`
  overrides these, and only these, and lists what it replaces on stderr. It
  never overrides a wrong target or a missing, inconsistent or stale `dist/`.
  Rejected: letting an edit that already equals the new build through
  silently. The rule asked for is "differs from the recorded hash", and
  `--force` covers that rare case.
- **The target marker is `package.json` named `launch-dashboard-rbm`.** The
  static-pages branch (`main`) of `launch-rbm-test` has no `package.json`
  (checked 28 Oct), so a copy there is refused, which is right: only the
  React port reads `messages/`.
- **No clean-tree requirement on the target**, unlike `copy-rbm-pages.js`.
  The React port is under active development there, and the copy touches only
  `messages/`. An uncommitted edit to a message file is still caught by its
  hash (tested). Rejected: requiring `git status` to be empty, which would
  block the copy on any unrelated work in progress.
- **Uncommitted build inputs are recorded and warned about, not refused.**
  If `i18n/ui.en.json`, `ui.page-forms.json`, `translations.json` or the build
  scripts have uncommitted changes, the manifest says `"clean": false` and
  lists them, and the copy prints a warning. That lets someone try a wording
  change in the React app before committing it. Rejected (for now): refusing,
  as `copy-rbm-pages.js` does for a build from uncommitted files. If copies
  should only ever be of committed builds, flip this to a refusal.
- **No timestamp in the manifest**, so an unchanged re-copy is byte-identical
  and `git status` stays empty. An unchanged file is not rewritten.
- `--check` runs every check and lists, per file, `new`, `unchanged` or
  `replaced`, and which manifest fields would change. It exits 1 where the copy
  would stop. An unknown argument is refused, so a mistyped `--chek` cannot run
  a real copy. Git calls in the target use `--no-optional-locks`, so even
  `git status` does not rewrite the index of a checkout someone is working in.
- A language file the last copy wrote that the build no longer has is
  removed (the `es/` lesson from the pages, 27 Oct). Everything else in
  `messages/`, including `README.md`, is left alone. Because the manifest's
  file names become paths the copy may remove, a manifest naming anything but
  a plain `xx.json` (say `../package.json`) is treated as not written by this
  script, a hand edit. Without that check, `--force` deleted the test repo's
  `package.json` (tested by removing it).
- `manifest.json` sits beside the language files. RBM's app imports each
  language by name (`lib/messages.ts`: `import en from "@/messages/en.json"`),
  so it is not read as a language. A loader that globbed `messages/*.json`
  would read it.

**9. French takes the typographic apostrophe ’ throughout** (28 Oct, the
owner's choice). `build-rbm-messages.js` `typeset()` turns every `'` in a
French translation into `’` (U+2019), before the placeholder and ICU checks,
so they check what ships. English and an English fallback are untouched:
they are the pages' own text and the lookup key. Why a rule was needed:
today's French page mixes the two by where a text lives, because
`build-locale-pages.js` turns `'` into `’` only inside JavaScript literals.
Of the 52 French values with an apostrophe, 36 show `’` on the page (all
from its script; 35 keys, plus "Étape d’accès", which the page writes both
ways) and 17 show `'` (14 static markup, 2 script strings the locale build
does not convert, 1 data text). The React port held the 36 in
`lib/held-text.ts` to show no change. Result: 62 French values with `’`, none
with `'`. Rejected:
- **Copying the page's mix** (`’` where the memory's bucket is `js` or
  `reviewed`): matches today for 50 of 52, but the rule is an accident of the
  old build, and "Étape d’accès" still differs in one place, since one key
  cannot be written both ways.
- **Straight `'` throughout** (decision 6 as it was): no build change, but
  36 texts change from `’` to `'` against today's page, and `'` is ICU's
  quoting character, which the next reader of these files may trip on
  (deferred 3).
Visible effect in the React port: 17 French texts gain `’` where today's
page has `'` (the description, the disclaimer and About paragraphs, the map's
title, note and region filter, the sources intro, the sources error, the
resistance link, and the map legend's "Étape d’accès").

**10. The 37 texts the React port held back now have keys** (28 Oct), under
the paths the port already reads (`lib/held-text.ts` `NOT_IN_MESSAGES`, in
launch-rbm-test): `common.status.delayed`; `pathway.stageButtonExpected`,
`stageButtonDelayed`, `expectedTag`; `stepPanel.statusCounts.*` (4);
`board.columns.mainBarrier`, `board.delayedDefinition`, `delayedHint`,
`noBarrier`; `product.viewTimeTaken`, `dotTitle`, `timeline.delayed`; and a
new area, `yardstick` (22), the expected-against-actual comparison. Most
belong to parts switched off for 10 Nov, which is why the first pass (by
decision 1, what a v1.0 visitor sees) left them out; the port renders them
when those parts are switched on. 25 are the page's exact English and are
found by `key(English)`. 12 have placeholders and got page forms: the joins
`", " + "expected" + " {years}"`, `", {n} " + "delayed"` and
`"{years} " + "expected"`; the memory strings `routine use by ${due}`,
`since ${y.start}` (alone, and with `", "` + "not yet in routine use"),
`Expected in routine use by …`, `Still not in routine use in
${ASOF_YEAR}.`; the two timeline notes (label + `" {stages}."`); and
`{status}: {definition}` and `{stage}: {status}`, which are punctuation only
and copied as they are into every language, as the page does. Checked
against the held texts: 144 of 147 values equal (37 × 3, plus the 35 kept
French ones). The three that are not:
- `pathway.stageButtonDelayed`, fr and pt: the page leaves ", 2 delayed" in
  English (its `" delayed"` literal is not translated by the locale build);
  the build now gives ", {n} retardé" / ", {n} atrasado", from the memory's
  "delayed". Singular, so wrong for two or more: for the reviewer, and a
  case for ICU plurals (deferred 3). A screen-reader label, rendered only
  when a stage has late medicines; with `SHOW_LATE` off (the port's
  `lib/stages.ts` `DISPLAY`, as on the page since 20 Oct) `applyShowLate()`
  makes every late stage "in progress" before the strip counts, so it is not
  rendered for 10 Nov (checked in the port's `PathwayStrip.tsx`).
- `map.accessStage` in the legend: "Étape d’accès" (decision 9).
Rejected: leaving them in `lib/held-text.ts` until after 10 Nov. They are
the same strings, already translated, and holding them in the port keeps two
places where a wording can change.

**11. `ui.en.json` is a bucket of `content.en.json`, and every message's
translation is filed under its own English** (28 Oct, the wiring, Deferred 1).
`assemble-content.js` collects it as a fifth bucket, `ui` (294 distinct
strings from 313 keys; `where` is `i18n/ui.en.json:<key>`), so it is in the
approval hash and `translate.yml` (now also started by a push to
`ui.en.json`) translates a new or reworded message like any other text.
`build-locale-pages.js` skips the bucket: the old page gets nothing from it
(`dist/locale/` rebuilt byte-identical before and after). The 58 messages with
`{placeholders}` had no memory entry under their own English, so the first
bot run would have sent them to Google (dry run: 58 per language, 2,026
characters). They were seeded once into `i18n/translations.json` from the
converted translations this branch already shipped (decision 3), with
`bucket: "ui"`: 58 entries added, none changed; the dry run then has nothing
to send. French is stored as it ships, with ’ (typeset() is idempotent).
`build()` now reads every message as `memory[key(its English)]`; the
conversion of page translations is gone. The output is the same as before,
string for string, in all three languages (compared with launch-rbm-test
`messages/`, built from `65b969e`). `translate-strings.js` protects
`{name}` placeholders as it protects `${...}` holes (none of the 670 page
strings' masks change). Rejected: keeping the conversion as the translation
route (two ways to get one translation, and a new message would never be
translated, since the bot does not know page forms); sending the 58 to Google
(billed again, and the reviewed wording lost).

**12. While the old page runs, every message must say what the page says**
(28 Oct, the owner's choice: the old page keeps running for now). The page
forms are no longer a translation route; they are the check. A plain message's
English must be in `content.en.json`'s page buckets (not `ui`); a message with
`{placeholders}` must have a page form that rebuilds its English from strings
the page still has. Anything else stops the build, naming the key: reword
`ui.en.json` (and its form) together with the page. A message only the React
version has is marked `{ "uiOnly": true }` in `ui.page-forms.json`; none is
today (313 of 313 checked against the page). In CI too (`validate.yml`,
`--check --allow-stale`: missing translations pass on a pull request, a
message the page does not say fails). Rejected: a warning only (the drift
would ship); checking plain keys only (the 58 with placeholders are the ones
reworded most).

**13. Every file holds one key, `launchDashboard`** (renamed `Unitaid` the same day, decision 14) (`NAMESPACE`, 28 Oct, the
owner's choice). RBM merges our messages into its own `en.json`, `fr.json`,
`pt.json`, which very likely have `header`, `common` and `errors` too; under
one name nothing collides, and RBM's page hands the dashboard
`messages.launchDashboard` in one piece. `copy-rbm-messages.js` compares key
paths, so it needed no change (its tests reach into the files and now go
through `NAMESPACE`). If RBM asks for another name, it is that constant and
the React version's `lib/messages.ts`.

**14. RBM's structure: our messages under `Unitaid`, and RBM's own keys for
the module beside them** (28 Oct, from RBM's sample `en.json`, `fr.json`,
`pt.json`: one namespace per module, merged into the dashboard at
integration). `NAMESPACE` is `Unitaid`, the name RBM gave the module. Each
file also carries what RBM's site reads for it (`shellKeys()`):
`Sidebar.unitaid` and `Sidebar.unitaid_tooltip` (its menu entry, outside the
namespace, with RBM's key names), and `Unitaid.title` and `Unitaid.metadata`
(`title`, `description`, `keywords`), first under the namespace as in the
sample. The owner chose to make them from messages we already have, so none
needs a translation of its own: the sidebar label and `title` are
`header.title`, the tooltip and `metadata.description` are
`header.description`, `metadata.title` is the header's title with
`| RBM Partnership to End Malaria` in English (as RBM's own sample title is
English in all three files), and `keywords` is one English list in every
language (as RBM's sample keeps its own). A message named `title` or
`metadata` at the top of `ui.en.json` is refused. Rejected: new messages in
`ui.en.json` for them (new text for Google and the reviewers, and the
translated title would not match the header's); a translated keyword list.
Not copied from the sample: its `knowMore` and `components` keys, which look
like another module's text shown as an example; asked of RBM.

**15. The 3 Nov 2026 page changes, for the React port** (branch
`feat/rbm-messages-tracker`, from `main` `b0f8675`; the page side is
`docs/jackson/dale-jan-tracker.md` §4 to §6). The five keys marked `uiOnly`
there now say what the page says, and the markers are gone: `board.columns.access`
"Country Access"; `map.note`, the line under the map's heading in the
Registered view (the page's `#mapnote`, and its `VIEW_NOTE.registered`);
`map.panel.stageMixTitle` "Access stages · {medicine}" (a page form again);
`product.procurement.globalFundOnly` and `disclaimer.notComplete`, the two
caveats. New keys: `board.columns.marketAccess` "Market Access" (the Status
column's new heading); `map.noteGuidelines` and `map.noteMft` (the two other
views' lines); `product.timeline.sinceYear` "since {year}" (a started stage
placed on the timeline, page form `since ${it.from}`);
`product.cards.moreThanOneStage` and `map.panel.moreThanOneStage`, "A country
can count at more than one stage." (the Country access card and the map's
overview: two roles, decision 2). Removed: `board.columns.status` "Status",
which no part of the page shows any more (the milestones table and the CSV
keep their own "Status" keys). 318 keys (313 before), 59 with
{placeholders}; 318 of 318 checked against the page, none `uiOnly`.
- **Three view notes, two new keys.** `map.note` is the Registered view's
  line word for word, and the view the map opens in; a third key would hold
  the same English with nothing to tell the two apart. Rejected:
  `map.viewNotes.{registered,guidelines,mft}` beside `map.note` (one of them
  read by nothing).
- **Reworded, not renamed.** `board.columns.access` and
  `map.panel.stageMixTitle` keep their keys, as the page kept its `c-path`
  column and its overview card. Rejected: rewording `board.columns.status` to
  "Market Access" (a key named for a column that no longer shows a status).
- **Translations.** Every new or reworded message but one is a page string
  the translate bot already translated on `main` (`b0f8675`), so the build
  finds it: fr and pt 317 of 318. `map.panel.stageMixTitle` has no memory
  entry under "Access stages · {medicine}" (the page's
  `Access stages · ${esc(p.name)}` is translated, decision 11 ended that
  route), so `--allow-stale` ships it in English on /fr and /pt of the React
  version until the bot runs after merge. Consequence:
  `test-build-rbm-messages.js` fails one check, "every message has a memory
  entry under its own English", here and in CI on the pull request (64 passed,
  1 failed). Not seeded: the memory is the pipeline's, and the owner expects
  English until the bot. Seeding one entry from the page's translation, as
  decision 11 seeded 58, would turn CI green and keep the page's words
  ("Étapes d’accès · {medicine}", "Etapas de acesso · {medicine}").
- `i18n/content.en.json` rebuilt with `assemble-content.js` (the `ui` bucket
  only: 294 → 296 strings, contentHash `e7a724ee4977`), so the check that
  every message is in that bucket passes.

## Coverage, 28 Oct 2026, after PR #129

| | found | missing |
|---|---|---|
| fr | 313 of 313 (100%) | 0 |
| pt | 313 of 313 (100%) | 0 |

PR #129 (merged 06:51 UTC, `0902567`) put the 7 words of 27 Oct (below) in
`i18n/reviewed-strings.json`; the translate bot's run 40646366848 translated
them (`e9aff92`: fr and pt "7 to translate", 0 failed, the locale pages 100%,
0 left in English), and this branch took `main` in (`65b969e`, no conflict:
the two sides changed different files). The build now runs without
`--allow-stale`. Google's words: Presentation → Présentation / Apresentação,
Transactions → Transactions / Transações, Packs → Packs / Pacotes, not
estimated → non estimé / não estimado, country / countries → pays / pays,
país / países, data → données / dados. For the reviewer: "Packs" (fr
"Boîtes" and pt "Embalagens" are the usual words for medicine packs).

Before PR #129, the same day: 306 of 313 (98%) in both, the same 7 missing.

## Coverage, 27 Oct 2026

| | found | missing |
|---|---|---|
| fr | 269 of 276 (97%) | 7 |
| pt | 269 of 276 (97%) | 7 |

The same 7 in both, and all 7 are English that `content.en.json` has never
collected, so the translate bot has never seen them: "Presentation",
"Transactions", "Packs", "not estimated" (the procurement-by-presentation table,
shown for Pyramax and DHA–PPQ), "country" / "countries" (the donut's centre
label) and "data" (in `tooltip.dataStatus`). `node scripts/build-rbm-messages.js`
therefore fails today, and `--allow-stale` builds with those 7 in English.

## Found in passing, left alone

- **Ten Portuguese messages with {placeholders} differ from the Brazilian
  page** (found 3 Nov 2026 by the React port's tests, once they compared
  the Brazilian pages; French has none). The page joins translated
  fragments; each message has its own translation under its own English
  (decision 11), and the Brazilian retranslation of 28 Oct gave different
  words: `pathway.stageButtonLabel` ("… onde cada medicamento está" /
  "… está localizado"), `stepPanel.label` ("Estágio {n}" / "Etapa {n}"),
  `product.stagePanel.surveyStatus`, `yardstick.sinceNotRoutine`,
  `yardstick.notePublished`, `yardstick.noteEstimate`, `map.preLaunch`
  (the page has "{medicine} Está", a capital mid-sentence),
  `map.noCountryData`, `disclaimer.countriesVerified`,
  `disclaimer.countriesNotVerified`. Decision 12 checks the English only, so
  the build cannot see this. For the Portuguese reviewer; the port shows the
  message files' words (its `docs/react-port-notes.md`, decision 60). Also
  there: the page and the files write the map's "Legend" as "Lenda".

- **Fixed 28 Oct (PR #129, Coverage above).** Those 7 strings were English
  on `/fr` and `/pt`, and the locale
  build cannot tell. `build-locale-pages.js` reports "fr: 761 translated · 0
  left in English · 100% coverage" while `dist/locale/fr/index.html` has
  `Presentation</th>` and `>Packs<`. It counts only strings that were
  collected. They are single or lower-case words, which the `js` patterns
  reject, and none is in `i18n/reviewed-strings.json`. Fix: add them there.
  That changes `content.en.json` and its hash, so it is its own change.
- **The map's keyboard-list tooltip prints a raw data key**: `ASPY · verified
  data`. `mapStatus` is `detail.countries.status` ("verified"), shown as it is
  on every page, followed by an uncollected " data".
- **Translation quality, for a French or Portuguese reviewer.** The conversion
  is faithful, so these are in the output exactly as they are on `/fr` and `/pt`:
  - single words translated with no context: "Stage" → fr "Scène" (a theatre
    stage; `stepPanel.label` reads "Scène 3: …", also the CSV record type),
    "Lead" → fr "Plomb" (the metal), "Close" → pt "Perto" ("near"),
    "Record" → fr "Enregistrer" and "Use" → fr "Utiliser" (verbs),
    "Complete" → pt "Concluir" (verb), "Recorded" → pt "Gravado" (audio).
    Known before: MÉDECINE / VOYAGE / ACCÉDER.
  - sentences: `map.noPolicy` fr "Aucune liste de politique nationale de
    traitement {medicine} pour le moment." (wrong meaning);
    `stepPanel.statusSummaryLabel` fr/pt put the number after the noun;
    `map.panel.stageMixTitle` fr "Mix d'accès à la scène", pt "Mistura de palco
    de acesso"; `map.panel.stageMixCount` fr lost "of" ("{total} pays ont…",
    shown after the big number); `map.panel.moreInCountriesTab` fr "Plus
    d'informations"; `map.noCountryData` fr "Aucune donnée au niveau national
    pour le moment. {medicine}." (the fragment was translated as a whole
    sentence); `map.preLaunch` fr starts "{medicine} En phase…";
    `product.stagePanel.surveyStatus` pt lost "is".
  - Brazilian rather than European Portuguese in places ("planejado",
    "Enviando…"), although the pages declare `pt-PT`.
- **`prettyDate()` in `index.html` is dead code** (defined, never called), with
  its own English month names.
- **`launch-rbm-test/messages/README.md` names four of the seven untranslated
  keys wrongly** (seen 28 Oct, `feat/react-port`). It lists
  `download.presentation`, `download.transactions`, `download.packs` and
  `download.notEstimated`; the build's keys are
  `product.procurement.presentation`, `…transactions`, `…packs` and
  `…notEstimated`. The other three are right. Its "Current copy" paragraph
  also repeats what `manifest.json` now records, and goes stale with the next
  copy. Suggested fix there: point that paragraph at `manifest.json`. Not
  changed from here: another agent works in that repository.
- **`i18n/translations.json` holds 1,013 entries; `content.en.json` uses 663.**
  The rest belong to removed features (the resistance overlay, the old
  "Step …" wording). Harmless, since lookups are exact, but the memory is never
  pruned.

## Deferred

1. ~~Wire `ui.en.json` into `assemble-content.js`.~~ Done 28 Oct: decisions
   11 (bucket, seed, direct lookup, `{name}` protection) and 12 (the check
   against the page). When the old page is retired, drop decision 12's check
   and `ui.page-forms.json` with it.
2. ~~Copy the files into `launch-rbm-test`.~~ Done 28 Oct:
   `scripts/copy-rbm-messages.js` (decision 8). Not yet run for real: the
   first copy writes `messages/manifest.json` alone (`--check`, Status).
3. **Reshape to RBM's own JSON structure once they send it.** RBM uses
   next-intl (`^3.15.2`, said 28 Oct), which reads ICU `{name}`: next-intl
   3.15.2 read all 313 messages in all three files exactly as written (tested
   28 Oct). The one name is done (decision 13). Left: ICU plurals if RBM wants
   them (decision 4), and their language codes. French has no straight
   apostrophe left to escape since decision 9; English has 6.
4. ~~Translate the 7 missing strings, through `reviewed-strings.json`.~~ Done
   28 Oct: PR #129 and the bot (Coverage, 28 Oct).
5. The translation-quality list above, for a French and a Portuguese reviewer,
   now with `pathway.stageButtonDelayed`'s singular (decision 10) and the 7
   Google translations from PR #129.
6. ~~The two message tests are not in CI.~~ Done 28 Oct: `validate.yml`,
   "React interface text builds" (both tests, and the build with
   `--check --allow-stale`).
7. ~~`docs/developer-guide.md` does not mention these files.~~ Done 28 Oct:
   one paragraph in its RBM entry.

## Status

- **3 Nov 2026, the page changes for the React port** (decision 15): branch
  `feat/rbm-messages-tracker` from `main` `b0f8675`, local, not pushed.
  `i18n/ui.en.json`, `i18n/ui.page-forms.json`, `i18n/content.en.json`
  (rebuilt), this file, `docs/jackson/dale-jan-tracker.md` (§6's last line).
  Verify block: normalize byte-identical (line endings aside); validator 0
  errors, 1 warning (GUF); synthetic 0 / 0; `preview.html` 421 KB;
  `test-build-dataset.js` 58 passed; country names cover all 252;
  `test-build-rbm-messages.js` 64 passed, **1 failed** (decision 15,
  "Translations"); `test-copy-rbm-messages.js` 35 passed;
  `test-build-rbm-pages.js` 36 passed; `assemble-content.js --check` up to
  date. Built with `--allow-stale` (fr and pt 317 of 318) and copied into
  launch-rbm-test `feat/tracker-feedback`.

- **28 Oct 2026, the wiring** (decisions 11 to 13): `main` merged in
  (`577489a`, no conflict). Files: `scripts/assemble-content.js` (the `ui`
  bucket), `scripts/build-locale-pages.js` (skips it),
  `scripts/translate-strings.js` (`{name}` protected),
  `scripts/build-rbm-messages.js` (direct lookup, page check, `NAMESPACE`),
  both message tests, `i18n/content.en.json` (rebuilt: 964 strings,
  contentHash `e200dc0c1ab4`), `i18n/translations.json` (58 entries added,
  nothing changed), `.github/workflows/translate.yml` (`ui.en.json` starts
  it), `.github/workflows/validate.yml` (the message step), `CLAUDE.md` (the
  count), this file. `test-build-rbm-messages.js` 55 passed, 0 failed (52
  without `dist/rbm-messages/`); `test-copy-rbm-messages.js` 35 passed;
  `build-rbm-messages.js` fr and pt 313 of 313, 313 checked against the page;
  `translate-strings.js --dry-run` 0 to send; `assemble-content.js --check`
  up to date. Local, not pushed.

- **28 Oct 2026, after PR #129:** `main` merged in (`65b969e`, no conflict);
  `node scripts/build-rbm-messages.js` (no flag) passes, fr and pt 313 of
  313; copied into launch-rbm-test, whose manifest now lists nothing
  untranslated (`feat/react-port` `53f8c18`, the 7 in its parity test's
  `CHANGED`). RBM's static pages rebuilt from `e9aff92` (launch-rbm-test
  PR #31, `f39b88d`; live on GitHub Pages and Vercel). This file and the
  handoff's §0.
- **28 Oct 2026, the held texts** (item 2 of the handoff's §0 list):
  decisions 9 and 10. `i18n/ui.en.json` (313 keys), `i18n/ui.page-forms.json`
  (58 forms), `scripts/build-rbm-messages.js` (`typeset()`, exported),
  `scripts/test-build-rbm-messages.js` (51 passed, 0 failed; the old ICU
  check on French rewritten for Portuguese, since French `l'{stage}` now
  ships as `l’{stage}`; with `typeset()` switched off, 4 checks fail by name),
  `CLAUDE.md` (the count), this file. `test-copy-rbm-messages.js` 35 passed.
  Build with `--allow-stale`: fr and pt 306 of 313, the same 7 missing.
- Branch `feat/rbm-messages` in the worktree
  `../launch-development-rbm-messages`, from `origin/main` `89b2011`: the
  message build (`280ad5d`), the copy step (`18f6a6d`), and the handoff's new
  §0 for the React port (28 Oct). **Pushed 28 Oct 2026, not merged, no PR**:
  the owner keeps working on the branch until it is stable. The push runs
  `validate.yml` (it runs on every push).
- `node scripts/test-build-rbm-messages.js`: 46 passed, 0 failed.
- `node scripts/test-copy-rbm-messages.js`: 35 passed, 0 failed. Each
  refusal was also broken on purpose in a scratch copy of the scripts (force
  always on, no stale-build check, a missing manifest always adopted,
  `--check` writing, no key-set check, no file-name check on the manifest);
  each break made named checks fail.
- `node scripts/copy-rbm-messages.js --check` against the real
  `../launch-rbm-test` (`feat/react-port`), 28 Oct: exit 0, "built from
  launch-development-test 280ad5d; still English: fr 7, pt 7", `en.json`,
  `fr.json`, `pt.json` unchanged, `manifest.json` new. Its `messages/`, its
  `git status` and its `.git/index` time were the same before and after. A
  real copy into a scratch replica of that folder wrote `manifest.json` alone,
  with the same three sha256 values; a second copy changed nothing.
- Verify block, 28 Oct 2026, with the copy step: the same results as on
  27 Oct below (normalize byte-identical; 0 errors, 1 warning `treatment
  policy:` GUF; synthetic 0 / 0; `preview.html` 393 KB; `test-build-dataset.js`
  30 passed, 0 failed; covers all 252), plus the two message tests above.
- `node scripts/build-rbm-messages.js`: fails as designed, listing the 7
  missing strings per language. `--allow-stale` writes the three files.
- Verify block, 27 Oct 2026: `normalize-treatment-policy.js` regenerated
  byte-identical (no change in `git status`); `validate-data.js` 0 errors,
  1 warning (`treatment policy:`, GUF); synthetic 0 / 0; `make-preview.js` wrote
  `preview.html` (393 KB); `test-build-dataset.js` 30 passed, 0 failed;
  `build-country-names.js --check` covers all 252. Also
  `assemble-content.js --check` up to date (contentHash `da61980a827c`) and
  `test-build-rbm-pages.js` 36 passed, 0 failed.
- No NUL bytes in any new file (counted in Python). 28 Oct: none in the two
  new scripts, `CLAUDE.md` or this file. All four are LF, as the rest of this
  worktree is (`git ls-files --eol`: `i/lf w/lf`).
