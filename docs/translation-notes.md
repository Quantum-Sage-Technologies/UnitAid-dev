# Translation in the proposal workflow — working notes

> **8 to 27 Oct 2026: Spanish (`es`) was a third translated language,** with
> the same bot and rules as French and Portuguese. It was removed on 27 Oct
> 2026: RBM's platform does not support Spanish. What it changed:
> [docs/jackson/spanish.md](jackson/spanish.md).

> **2 Oct 2026:** the pipeline now has a fourth bucket (`reviewed`), CLDR
> country names and translated shared widgets. See
> [docs/jackson/translation-coverage.md](jackson/translation-coverage.md).

Branch: `translation-workflow`, cut from `main` at `b8c8d05` on 30 September
2026, with `feat/translation` (`f69ecf6`) merged in. `feat/translation` is
Keith's branch (`Keith-paradox/launch-development`, `ee1181e`) plus one commit
of ours, described below. The pipeline itself is described in
[docs/jackson/DEV-31.md](jackson/DEV-31.md); this file records bringing it into
the proposal workflow, so that the automated merge after approval also
translates.

**Not merged into `main`.** It merges when the owner says so.

## The design, agreed 30 Sep

**The `approved` label is the staging dashboard.** The owner's call. The
reviewer keeps doing what they do today — the issue, the pull request, the
preview, the label — and approving a proposal is approving the English content
it produces, identified by its `contentHash`. That answers CP-4 (where the
approval record lives): in `data/decisions.js`, which the approval job already
writes. Rejected: a separate staging page with its own Approve/Reject buttons —
a second place to approve, for the same decision.

**Translate after approval, before the merge — and English does not wait.**
The approval job translates only the new strings, builds the French and
Portuguese pages, and merges English, French and Portuguese as one commit. If
the engine fails, it merges the English anyway and the new strings show in
English on `/fr` and `/pt` until the translate bot fills them. The second half
is not new: [source-registry-notes.md](source-registry-notes.md) already
records "English does not wait for French", rejecting a release held until every
language is complete because "one untranslated sentence then blocks a
registration update, which is the worse failure". An earlier draft of this
design (nothing merges if the engine fails) was that rejected alternative, and
was corrected before anything was built. Rejected: translating at intake, so
the preview shows French — it sends unapproved text to the engine and pays for
proposals that are then rejected.

**Changes made by hand are translated by a bot after they reach `main`.** The
page, `resistance.js`, `molecular-markers.js` and `sources.js` never go through
a proposal (53, 3, 1 and 1 commits on `main` from 30 Aug to 30 Sep). Each
changes the English that `content.en.json` records. Rejected: the person who
made the change runs the pipeline and commits the result, with CI going red if
they forget. Four reasons:

- nothing could enforce it — branch protection is unavailable on this plan
  (GitHub answers 403, "Upgrade to GitHub Pro or make this repository public"),
  so a red check does not stop the push;
- the repo already works the other way: `publish.yml` rebuilds generated files
  after a push, and `UPDATING.md` tells analysts CI does it "for you";
- the Google key would have to sit on every editor's machine, against DEV-31 §8
  ("organisation secrets, never personal accounts");
- the approval rule's own reasons (not paying for rejected sentences, no French
  for an unapproved claim) do not apply to a push to `main`, which is already
  live in English.

## Built on this branch

**1. The Sources footer is translated again, and the build checks for missing
files.** `main`'s `9c6be45` moved the footer from the page into
`data/sources.js`. `assemble-content.js` now collects what `renderSources()`
shows for each public entry — the name (`label`, or `title` where there is no
label), the `plain` line, and the `alsoSee` link labels — and puts the file in
`values`. The internal `findings` and `relevance` fields are never collected,
so they cannot reach an engine. `build-locale-pages.js` writes a localised
`sources.js`, and now copies every other data file the page's own `<script
src>` tags load instead of a fixed list — the fixed list is how the file went
missing. Its self-check gained "every data/ and assets/ file the page loads is
there"; with `pt/data/sources.js` removed it fails the build.

*Correction to "should need nothing new sent to Google", below.* Of the 48
strings the footer shows, 21 are in `translations.json` from when they were
markup; the other 27 belong to sources added to the registry after 23 Sep. With
this change `content.en.json` has 453 strings (276 data, 61 markup, 116 js) and
the dry run queues 33 per locale, 1,982 characters: those 27, the 3 new page
strings, and the 3 known rejects. Until they are translated, coverage reads 92%
(fr 524 translated, 44 left in English; pt 529 / 44).

`--allow-stale`, for the public build only (item 4): when `content.en.json` is
out of date the builder assembles the content from the source in memory
instead of refusing, writes nothing back, and leaves what is new in English.
Without the flag it refuses, as before.

**2. The three strings the engine always rejects are written by hand.** DEV-31
§4 lists three (`PQ'd` twice, `MFT` once, all DHA–PPQ) whose placeholders do
not survive the round trip. A rejected string is never saved, so every run
queued it again: `translate-strings.js` never reached "nothing to do", and a
run with nothing new still called Google and needed the key. Their French and
Portuguese are now in `translations.json` (keys `067f9f108ad6bf6f`,
`d8d25752df253a3f`, `368e55377d8c2ac7`), following the memory's own usage —
"première intention", "d’Asie du Sud-Est", European Portuguese "primeira
linha", PQ and MFT kept. **Drafted, not reviewed by a French or Portuguese
speaker — Jackson or a bilingual reviewer should check them.** The dry run now
queues 30 per locale, 1,559 characters, all of it new text; coverage 93%.

Found while writing them, left alone for the same reviewer: "WHO PQ held for
tablets and paediatric granules" reads in French as "OMS PQ **interdit** pour
les comprimés…" ("forbidden"), and masking pushes a protected term to the front
of its sentence ("MFT Modèles de déploiement avec…").

**3. The approval gate is wired (CP-4), and there is a stub engine.**
`approvalGate()` in `translate-strings.js` exits 1 unless
`APPROVED_CONTENT_HASH` is exactly the `contentHash` of the content it is about
to translate; a dry run needs no approval. The approval job passes the hash of
the proposal it is merging, the translate bot the hash now on `main`. A person
can still run it by hand, but only by setting the variable on purpose.
Rejected: the gate reading `data/decisions.js` itself — the approval job
translates before it merges and records, so the record would not exist yet.

`TRANSLATE_ENGINE=stub` returns `[stub-fr] <the English>` for every string, so
the route runs end to end with no key and nothing sent anywhere. A real engine
treats a stub value as an empty slot and overwrites it — the one exception to
"empty locale only", because a stub value is test output, not a translation.
`build-locale-pages.js` counts stub values it substitutes and says so. Checked:
no approval, a wrong hash, no key, and an unknown engine each exit 1 and leave
the memory untouched; the stub fills 30 per locale, a second run has nothing to
do, a Google dry run then sees those 30 slots as empty again, and the pages
build at 98% (12 left in English) with the stubs flagged.

**4. The French and Portuguese pages are published, and CI builds them.**
`build-public-site.sh` runs `build-locale-pages.js --allow-stale` and copies
the output to `/fr/` and `/pt/` (about 2.5 MB each: the page, its six data
files and `assets/`). The illustrated page links to no other local page, so the
copies are self-contained. A self-check failure fails the build; out-of-date
content does not — that is English not waiting for French. `pr-preview.yml`'s
comment links both, and `validate.yml` runs the same build on every push and
pull request, so a broken locale page is caught before a preview or production.
Rejected: failing the public build when `content.en.json` is out of date — every
hand-made push would then hold up English until the bot had run.

**5. The approval job translates before it merges; a bot covers the rest.**

- `proposal-pr.sh` puts `i18n/content.en.json`, rebuilt from the proposal, on
  the pull request beside `data/products.js`, so its diff shows the English
  strings being approved. Nothing is translated at intake.
- `proposal-decision.yml` accepts a pull request whose files are
  `data/products.js` and, optionally, `i18n/content.en.json` — one opened before
  this change carries only the first and still passes. `products.js` must still
  be byte-for-byte the snapshot on today's `main`; that check is unchanged.
- A new step runs `scripts/proposal-translate.sh`. On `main` as it is now, with
  the snapshot applied, it rebuilds `content.en.json`, translates the strings
  that have no translation yet (with `APPROVED_CONTENT_HASH` set to that
  content's hash), builds and self-checks the French and Portuguese pages, and
  replaces `proposal/<n>` with that one commit — only over the commit the
  reviewer's preview was built from (`--force-with-lease`). The squash merge then
  carries `products.js`, `content.en.json` and `translations.json` together.
- **Rebuilt on today's `main`, not taken from the pull request.** Rejected:
  requiring the pull request's `content.en.json` to equal a rebuild. The
  translate bot refreshes that file on `main` after every hand-made change (53
  page commits in the month to 30 Sep), so each would conflict with every open
  proposal's copy and send it back for approval, over a change that was already
  live and not part of the proposal. When the two hashes differ, both are
  recorded: `contentHash` (merged) and `reviewedContentHash` (the pull request's).
- An engine failure does not stop the merge; a failed self-check does. The
  approval comment says either that French and Portuguese are in the same
  commit, or how many strings still show in English and whether the engine
  failed.
- The merge is tried up to five times, six seconds apart: the branch has just
  been replaced, and GitHub may not yet have worked out that it is mergeable.
  A guard, not an observed failure. Between tries it asks whether the pull
  request is already merged, so a try that merged but still exited non-zero
  (failing to delete the branch, say) is not reported as "Not merged".
- `record-decision.js` writes `contentHash`, and `reviewedContentHash` when it
  differs.
- **`translate.yml`, the translate bot.** On a push to `main` that changes the
  page, `products.js`, `resistance.js`, `molecular-markers.js`, `sources.js`,
  `assemble-content.js` or `i18n-identifiers.js`, and by hand: rebuilds the
  content file, translates what is new, self-checks, commits the two `i18n/`
  files and starts the deploy. It commits what is ready even when the engine
  fails, then fails the run, so a gap is visible.
- **`publish.yml` starts the bot after an approval, not the approval job.**
  The diagram said the approval job would. The `bot-push-main` group holds one
  running and one pending run: dispatched there alongside `publish.yml`, the bot
  would be a second pending run and cancel it, and the history snapshot would be
  lost. Rejected: giving the bot its own group — it would then push to `main`
  beside `publish.yml`, which does not retry a rejected push.
- Engine and key: `vars.TRANSLATE_ENGINE` (a repository variable, default
  `google`) and `secrets.GOOGLE_API_KEY`. **Neither is set on any repository
  yet.** Until they are, a proposal with new text merges with that text in
  English on `/fr` and `/pt`, and a bot run with new text fails, saying so. The
  30 strings already pending (item 1) make the bot's first run on `main` one of
  those. Setting `TRANSLATE_ENGINE=stub` on the test repository runs the whole
  route with stub values instead.

**Checked.** `actionlint` 1.7.12 with `shellcheck` 0.11.0: clean on the five
changed workflows and on `proposal-translate.sh`, `proposal-pr.sh` and
`build-public-site.sh` (`main`'s own copies are clean too). **Local simulation,
50/50** — the workflows' own `run:` blocks, with their `env:` and `if:`, against
a bare remote and a stub `gh` that squash-merges for real (the harness lives
outside the repository):

- A. a text proposal with the stub engine: the PR carries the two files and no
  translations; the merge commit carries exactly the three files; `main`'s
  content is current, the sentence has French, both pages build, the decision
  records `main`'s `contentHash`; publish then starts the bot, which has
  nothing to do;
- B. `main`'s page changes after the PR is opened and the bot runs first: the
  approval still merges without a conflict and records both hashes;
- C. no key at approval: English merges, the comment says what is still in
  English and that the engine failed; the bot fails visibly while the engine is
  down and fills the gap once it is back;
- D. another change to `products.js` lands first: rebuilt and asked again,
  nothing translated;
- E. the PR branch gains another file: refused;
- F. a push to the PR branch between the check and the merge: the lease
  refuses, and the racing commit stays;
- G. a hand-made change with no new text and no key: the bot succeeds,
  commits only the content file, and a second run commits nothing.
- H. the merge lands but `gh` still exits non-zero: counted as merged, the
  approval recorded, no "Not merged" comment, one merge.

Not exercised, and only the test repository can: GitHub's own event delivery
(the `labeled` event, dispatches made with `GITHUB_TOKEN`, queueing in
`bot-push-main`), mergeability timing, Vercel's build image running Node for
`build-public-site.sh`, and a real engine.

## What `feat/translation` brought, and what we changed on it

| Where | Change |
|---|---|
| `docs/reviewer-feedback-parallel-gates-sep-2026.md` | restored — the branch had deleted it |
| `poc/` (8 files, 2,324 lines) | no longer tracked; added to `.gitignore` |
| `docs/translation-notes.md` | **new.** This file |
| `main`, separately | `b8c8d05` reverts proposal #15, the invented `TEST-0001` WHO listing |

## Decisions

**Pulled as a fast-forward.** Keith's branch was this repository's copy plus
four commits (`d163f6d`, `79f5f51`, `2598057`, `ee1181e` — DEV-31's
`assemble-content.js` and `content.en.json`), with nothing of ours on it to
reconcile.

**The reviewer-feedback doc is kept.** The branch deleted it in `bc13fe7`
("deleted", 11 Sep), which it inherited from `fix/sep9-feedback-parallel`, the
branch it was cut from. No reason is given and nothing in the translation work
depends on it being gone. A merge would have removed it silently: `main` has not
touched the file since `7e7b219`, so git sees no conflict. Restored from
`7e7b219`, which is byte-for-byte `main`'s copy. Rejected: taking the deletion.

**`poc/` leaves the branch.** `ed16f95` ("DEV-28: move engine comparison tooling
into gitignored poc/") meant it to stay local; `603b305` committed it the same
day, and `.gitignore` never listed it. It holds the engine-comparison script,
its French, Portuguese and French-surveillance outputs (HTML and JSON), and the
scoring sheet. Nothing outside `poc/` refers to it. It is the DEV-28 evidence,
so it stays recoverable: `git checkout 603b305 -- poc/`, or Keith's repository.
Rejected: keeping it — about 2,300 lines of engine output on `main`.

**`TEST-0001` reverted on `main` before anything is translated.** The second
end-to-end run (#15, `ec49635`) put the invented GanLum WHO listing back on
`main` after #4's revert. With it there, a merged tree's `content.en.json`
carried its sentence and the dry run queued it for Google.
`i18n/translations.json` cannot be regenerated identically, so a translated fake
would outlive the revert. Reverted in `b8c8d05` the same way as #4:
`data/products.js` is byte-for-byte `history/products-2026-09-08.js`, and
`publish.yml` accepted it, with nothing to commit. Rejected: leaving it and
skipping that one string, a skip every later translation run would have to
remember.

*Correction to `b8c8d05`'s message*, which says `history/products-2026-09-29.js`
"stays, as history is append-only". It does not exist: `b1b44a4` removed it on
29 Sep, and #15's `publish.yml` run failed at its commit step, so no snapshot was
written for it. No history file holds `TEST-0001`. `data/proposals.js` (3
mentions) and `data/decisions.js` (1) still do, as the record of the tests.

## Found in passing — to settle when the merge is scoped

From a trial merge of `ee1181e` into `main` at `b8c8d05`, in a scratch clone
(not pushed):

- **Git merges it without conflicts.** The verify block on an earlier trial
  merge (against `e0c3332`) was clean: normalizers byte-identical, validator
  0 errors / 5 warnings (3 + 2), synthetic 0 / 0, preview built, no NUL bytes.
- **`content.en.json` is out of date after the merge**, so
  `translate-strings.js` and `build-locale-pages.js` refuse to run until
  `assemble-content.js` is rerun. 3 strings are added and 21 removed: 405 in all
  (228 data, 61 markup, 116 js), against 423 on the branch. The dry run then
  sends 6 per locale, 568 characters — the 3 new strings and the 3 known
  `PQ'd`/`MFT` rejects.
- **Fixed in item 1 above.** **The sources footer breaks on the French and Portuguese pages.** `main`'s
  `9c6be45` moved the footer's source list out of the page into
  `data/sources.js`, rendered at runtime; those are the 21 removed strings.
  `assemble-content.js` reads only `products.js`, `resistance.js` and
  `molecular-markers.js`, and `build-locale-pages.js` copies only those into
  `dist/locale/<locale>/data/`. The locale page's `data/sources.js` is therefore
  missing and it shows "Source list unavailable — data/sources.js did not load."
  Coverage reads 97% (fr 503 translated, 17 left in English), against the
  branch's 525 / 14; the self-check passes because it checks the resistance rows
  only. The translations are still in `translations.json`, keyed by unchanged
  English, so reading `sources.js` should need nothing new sent to Google.
- **Resolved in item 5 above.** **The approval check does not allow
  `content.en.json` in a proposal PR.**
  `proposal-decision.yml` merges only a PR whose one changed file is
  `data/products.js`. Rebuilding the content file after the merge, in
  `publish.yml`, fits that workflow's pattern (a generated file, one bot commit),
  but its path filter is `data/products.js` alone, and `content.en.json` also
  depends on `illustrated-journey-dashboard.html`, `resistance.js` and
  `molecular-markers.js`.
- **Resolved in item 3 above.** **CP-4 was still open.** `approvalGate()` in
  `translate-strings.js` only printed the hash.
- **Resolved in item 4 above.** **The locale pages were not deployed.**
  `scripts/build-public-site.sh` copied a fixed list of files, and
  `dist/locale/` was not on it.
- **Pre-existing, left alone: `data/sources.js` is public with its internal
  fields.** Its header says `findings` and `relevance` are internal and
  "NOT published", and the page never renders them — but
  `build-public-site.sh` copies the file whole, so both are downloadable from
  the public site. The `/fr/` and `/pt/` copies carry them the same way. Not
  changed here: stripping them belongs in the public build for every copy,
  and is the owner's call.
- **Two of the three `publish.yml` runs dispatched after an approval failed** on
  29 Sep: `59c116f` (#10) and `ec49635` (#15), the latter at "Commit snapshot,
  feed and linked-data export". The failed-step log came back empty, so the
  cause is not known; `59c116f`'s step was not checked.

## Deferred, and left alone

- **A string the engine rejects is queued again on every run**, as the three in
  item 2 were, until someone writes it by hand; each run then calls the engine.
- **There are no numbers-only proposals.** `proposal-lib.js apply` writes a
  changelog entry, and its `plain` line is translatable, so every approval has
  new text and needs the engine — or leaves that line in English. The changelog
  panel is hidden on the page for now.
- **Every hand-made change to the page or the data adds a bot commit** to
  `main` (`content.en.json`, and `translations.json` when there is new text).
- **`content.en.json` carries `sources.js` whole**, `findings` and `relevance`
  included, in `values`. The repository is private; DEV-32's `build-dataset.js`
  must drop them before anything is published from `values`.
- ~~**Portuguese locale code**, `pt-PT` or `pt-BR`: still open (DEV-31 §6).~~
  Settled 28 Oct 2026: Brazilian. See "Brazilian Portuguese" below.
- **No language switcher** links `/`, `/fr/` and `/pt/`; the pages exist but
  nothing on the English page points to them.
- The two translation-memory faults in item 2, and the `publish.yml` failures
  and `sources.js` exposure above.

## Status

- **Merged, 30 Sep:** PR #19 (`2415307`). The repository secret
  `GOOGLE_API_KEY` was added, with no `TRANSLATE_ENGINE` variable, so the
  engine is Google. The translate bot's first run (`6ed2b10`) translated the
  30 waiting strings into French and Portuguese, with no rejects.
- **End-to-end tests:** three run on 30 Sep through the watcher fixture (#20,
  #22, #24), each merged and then reverted. #24 was reverted only on 1 Oct, by
  hand, after Keith's merge had landed on top of it. How:
  [handover-translation-workflow.md](handover-translation-workflow.md) §6.
- **1 Oct:** Keith's `development` merged into `main` (PR #26). The translate
  bot then translated its new text (`3a117f2`): fr 563 and pt 570 translated,
  12 left in English each, 98%. **One string was rejected**, because
  its placeholders did not survive the engine, and stays in English: the map
  legend line "Border = the selected medicine is in the country's national
  treatment policy (solid: first…". It needs translating by hand in
  `i18n/translations.json`, or a re-run.
- **20 Oct:** a new `GOOGLE_API_KEY` replaced the one Google no longer
  recognised (every translate run since 15 Oct had failed with "API Key not
  found"). The bot's rerun translated 173 / 172 / 172 waiting strings into
  fr / pt / es; Google lost the ⟦n⟧ token in 11 of them. `translate-strings.js`
  now sends those again as HTML, each hole and protected term inside
  `<span translate="no">`, and keeps the result only if every hole comes back
  exactly once. Tested locally: all 11 saved. Translation is Google only: no
  hand-written translation is on the page (Kyler's three of 30 Sep belong to
  English that has since changed).
- **28 Oct:** seven words that `/fr` and `/pt` showed in English are now in
  `i18n/reviewed-strings.json` (nine snippets): the procurement table's
  "Presentation", "Transactions", "Packs" (headings and the phone labels) and
  "not estimated", the map donut's "country" / "countries", and the "data"
  after a medicine's status in the map's keyboard-list tooltip. They are
  single or lower-case words, which the `js` patterns reject, so
  `build-locale-pages.js` reported 100% coverage while leaving them English
  (it counts only collected strings). Found by the RBM message build on
  `feat/rbm-messages` (`docs/rbm-messages-notes.md`, "Found in passing"),
  which lists them by key. `content.en.json`: 663 → 670 strings, contentHash
  `dd6acd7003be…`; `translate-strings.js --dry-run`: 7 to translate per
  language, 62 characters. Google translates them without context, so they
  go on the reviewer list with the other single words. The tooltip will read
  "ASPY · verified données": its status is a raw data key ("verified"),
  printed untranslated on every page (the same notes, "Found in passing").
  After the bot runs, the RBM pages need a rebuild and a push to
  `launch-rbm-test` to show them there.

What follows is the status as recorded before the merge:

- Branch `translation-workflow` on `KylerXiv/launch-development-test`, cut from
  `main` at `b8c8d05`: the merge of `feat/translation` and five commits. Pushed
  with this commit, as a draft pull request against `main`. **Not merged.**
- `feat/translation` there is Keith's `ee1181e` plus `f69ecf6`; `main` is
  `b8c8d05` (validate, Vercel deploy and publish succeeded on it, 30 Sep).
- Verify block on this commit, 30 Sep: both normalizers byte-identical;
  `validate-data.js` 0 errors / 5 warnings (3 resistance + 2 molecular markers);
  synthetic 0 / 0; `make-preview.js` 154 KB; `assemble-content.js --check` up
  to date; `build-locale-pages.js` all checks passed (fr 527 / pt 532
  translated, 41 left in English each, 93%); `build-public-site.sh` exits 0.
  No NUL bytes in any changed file.

## Brazilian Portuguese (28 Oct 2026)

RBM's own Portuguese is Brazilian (its sample message files: "Fatos-chave",
"econômicas"), and the dashboard now runs inside RBM's site, so the owner
chose Brazilian Portuguese for everything: the engine target, the country
names, and the page's language tag, which sets how dates and numbers read.

| | Before | Now |
|---|---|---|
| `translate-strings.js` `TARGET.pt` | `pt-PT` | `pt` (Google's Brazilian Portuguese) |
| `build-country-names.js` `LANGS.pt` | `pt-PT` | `pt` (CLDR's Brazilian): 52 of 252 names change, e.g. Arménia → Armênia, Quénia → Quênia, Irão → Irã |
| `build-locale-pages.js` `HTML_LANG.pt` | `pt-PT` | `pt-BR`: "19/10/2026" → "19 de out. de 2026", "14 500 000,5" → "14.500.000,5" |

**Translating again.** The memory fills empty slots only, so a new target alone
would change nothing. `translations.json` now records the target its values
were made with (`targets`; a memory without it was made with `fr` and
`pt-PT`). When `TARGET` differs, the next run clears that locale in every entry
and translates everything in use again: 964 strings (709 distinct),
52,559 characters, inside Google's free monthly allowance. Entries out of use
lose their old value, so an old-variety text cannot come back later. A string
the engine rejects stays empty (English) and is retried by the next run. A
change to `translate-strings.js` now starts `translate.yml`, so merging the
switch starts the retranslation. Checked with `TRANSLATE_ENGINE=stub` in a
scratch checkout: `targets` became `pt`, every string in use got a new value,
none out of use kept one, French was untouched, and a second run had nothing
to do.

Nothing was lost: no Portuguese value had been corrected by hand (the memory
has no reviewed field, and every value came from the engine). The three wrong
words a reviewer flagged on 28 Oct ("Gasoduto", "Perto", "Plomb", the last
French) are not corrected here; the Portuguese two may change with the
retranslation, and the review still applies.

After the bot's run: "Publish now", so the published data
(`dashboard.json`, `dashboard.pt.json`) is Brazilian too; then the RBM
static pages and the React version's message files are rebuilt from it.

Left as it was: a comment in `index.html` still gives "pt-PT" and "2/10/2026"
as the Portuguese example. Editing it would change the page's script, which
the content collector reads, for a comment.

## Professional translations (4 Nov 2026)

The translators delivered French and Brazilian Portuguese as two XLIFF 1.2
files (`LAUNCH-Dashboard-English_261023-001_FRA.xlf`, `…_PT-BZ.xlf`), made
from `i18n/content.en.json` as it was on 23 Oct: 640 units each, ids
`key(English)`, the page's code as `<ph>` tags, every unit translated, no tag
lost.

`scripts/import-xliff.js` writes them into `i18n/translations.json`, where
the translate bot never replaces a value (rule 1), and every output reads
them from there: the French and Portuguese pages, the published dataset, the
RBM pages and the RBM message files.

| | French | Portuguese |
|---|---|---|
| Units | 640 | 640 |
| Taken (English still on the page) | 614: 516 changed, 98 already the same | 614: 458 changed, 156 already the same |
| Left out: the English was reworded on 3 Nov (partner feedback) | 26 | 26 |

**The record.** `i18n/translator/2026-11-04/` keeps both files as delivered
and `imported.json`: each file's sha256 and counts, and the text taken per key
and language. It says which lines a person wrote; running the import on the
copies there puts their text back.

**What can still replace it.** Changing `TARGET` in `translate-strings.js`
clears that language in every entry and translates again (the Brazilian
switch above); so would deleting values by hand. After either, run
`node scripts/import-xliff.js i18n/translator/*/*.xlf`, oldest first.

**What is still Google's.** 170 strings per language (2,218 English words):
the 3 Nov rewordings and the strings added since 23 Oct, about a third of
them interface text only the React version shows. `scripts/export-xliff.js
--out <folder>` writes them as `LAUNCH-Dashboard-followup_<date>_{FRA,PT-BZ}.xlf`
for the translators, in the same format, each unit with where it appears and
the machine translation shown today; their reply goes in with
`import-xliff.js`. The list leaves out every key a record holds, per language.

Checked: `test-xliff.js` 25 passed; `build-locale-pages.js` fr and pt 843 of
843, self-check passed; `build-dataset.js` valid; `build-rbm-messages.js` fr
and pt 330 of 330 (placeholders kept); `test-build-rbm-messages.js` 71,
`test-build-dataset.js` 58, `test-build-rbm-pages.js` 36,
`test-copy-rbm-pages.js` 34, `test-copy-rbm-messages.js` 35, all passed.

**The React messages that say a page sentence (5 Nov).** A message with
{placeholders} has its own English ("Stage {n} of {total}") and its own memory
entry, which the translators' 23 Oct file did not hold, so those messages
kept Google's words while the page showed the translators' for the same
sentence (the RBM module said "Étape {n} sur {total}", the page "Phase …").
`import-xliff.js` now gives such a message the words of its page sentence
(`ui.page-forms.json` `page` and `holes`) when a translator delivered it,
each hole back to the message's {name}, and only when the result holds
exactly the message's placeholders: 26 messages, 52 values, 40 changed.
`imported.json` lists them under `derived`, with the page key they came
from, and `export-xliff.js` leaves them out of the next file (144 strings per
language now). The 30 messages the page joins from pieces ("parts", such as
"{n} year") and 3 whose page sentence was not in the file wait for the
translators. Rocio's Portuguese has "e{second}" (no space) in
`stepPanel.parallelMilestones`, as on the page: for the proofreading.
