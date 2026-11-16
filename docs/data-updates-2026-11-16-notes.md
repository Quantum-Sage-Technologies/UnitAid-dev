# Data updates, 16 Nov 2026

Branch `data/updates-2026-11-16`, from `main` `f40e779`. Two hand-made data
changes on one branch, one commit each: both edit the newest changelog line
and `lastUpdated` in `data/products.js`, so two pull requests would conflict,
and one branch needs one translate run and one "Publish now".

# 1. GanLum: submitted, under review

## What was flagged

Feedback (Nov 2026): GanLum's regulatory step reads "Not started", but the
medicine is already under review.

The dashboard said: status Not started, "Regulatory submission in preparation
following Phase III success; no filing announced as of 15 Oct 2026". That was
right when it was written (changelog, 19 Oct 2026). It stopped being right on
10 Nov 2026.

## The evidence

Novartis media release, "Novartis ranks first place in 2026 Access to Medicine
Index", dated Basel, November 10, 2026, read directly on novartis.com on
16 Nov 2026:

> "Completed submission of KLU156 (ganaplacide/lumefantrine), the first
> next-generation antimalarial, to Swissmedic and the U.S. FDA and received
> priority review"

It is one bullet in a release about a ranking. It does not say which
authority granted priority review, nor the date of either submission. The
GlobeNewswire copy of the same release refused automated requests (403), and
a PDF the search offered under the same host turned out to be the Nov 2025
Phase III release, so neither was used.

## Decisions

- **Status In progress, not a new "Under review" status.** The dashboard has
  four statuses (done, in progress, delayed, not started), and this stage is
  already named "Stringent Health Authority Review (SRA)" until it is done, so
  "In progress" under that name says "under review". GanLum is in
  `PROGRESS_KEPT`, so the word shows even though `SHOW_PROGRESS` is off.
- **The sentence says only what the release says.** "Submitted to Swissmedic
  and the US FDA, and under review. Novartis reported on 10 Nov 2026 that the
  submission is complete and that it has received priority review." No
  authority is named for the priority review, and the date is the
  announcement's ("Submission announced 10 Nov 2026"), not a filing date.
- **The milestone "SRA dossier submission" is done ("Submitted").** Its next
  step is "Regulatory decision", TBC.
- **One hand-made change, not proposals.** Rejected: the proposal form. It
  changes one stage field per proposal (four here, with the page contradicting
  itself between them), cannot edit `detail.milestones`, and cites only
  sources already in the registry. The 19 Oct GanLum change was also made by
  hand.
- **The 2025 sources are no longer cited on this stage.** They state the plan
  to file; the new release states the filing. They stay on R&D and Phase III.

## Checked on the branch

- Verify block: byte-identical regeneration; `validate-data.js` 0 errors,
  1 warning (`treatment policy`, GUF); synthetic 0/0; preview built;
  country names cover all 252; `test-build-rbm-messages.js` 68 passed (the
  count in CLAUDE.md, 65, is out of date); `test-copy-rbm-messages.js` 35
  passed.
- `test-build-dataset.js` without flags fails on purpose: `i18n/content.en.json`
  is stale until the translate bot rebuilds it after the merge. CI runs it
  with `--allow-stale` (58 passed), as it does every other CI step, all of
  which pass locally, SHACL included (0 violations in all three graphs).
- Rendered before and after in headless Chrome at 1440 px: this page, and the
  RBM module (`rbm-module-unitaid` `main`, v1.5.1) run locally with
  `UNITAID_DATA_URL` pointing at the dataset built from this branch. Page-wide
  text changes: "Last updated" 6 → 16 Nov 2026, and the stage's status word.
  No console errors.

## After the merge

1. The translate bot runs by itself (data/products.js and data/sources.js
   changed). Check `i18n/translations.json` has French and Portuguese for the
   new sentence, the source label and the changelog line; the bot can commit
   English when Google fails.
2. Publish by hand: Actions, "Publish to RBM data repo", with a reason, dry run
   first. A hand-made change does not publish itself; only approvals do.
3. RBM's site reads the published file within about 5 minutes.

## Left alone, found on the way

- **Nothing watches Swissmedic or the US FDA.** The source watchers cover WHO
  PQ, EMA and the national registers. The approval will have to be caught by
  hand (monthly milestone scan).
- **"since R&D and Clinical (2025) · 1 year"** under "In progress" on the
  timeline is computed from the previous step and was already there under
  "Not started". It can read as "under review since 2025". Not changed here.
- **The proposal form's source dropdown** lacks the 14 registers added on
  3 Nov and this new source. It has no drift check.
- Watch issue #158: KALUMA results are now posted on ClinicalTrials.gov. The
  R&D note still says "Company-reported; not yet peer-reviewed", which stays
  true. Separate change if wanted.
