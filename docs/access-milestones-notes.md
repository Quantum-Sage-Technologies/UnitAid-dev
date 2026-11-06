# Access milestones: market access, then country access

*19 Oct 2026. Branch `feedback/jan-access-milestones`, from `main` at
`783f6d9` (#119). This is the branch's working-notes document, per
[CLAUDE.md](../CLAUDE.md).*

**In one paragraph.** Jan wrote on the partner feedback sheet that the
medicines table's "Status" and "On pathway" were confusing. What does
"Delayed" refer to? And "On pathway" needs an end, if there is one. Jan's
earlier suggestion was two steps in sequence. Market access is reached once a
medicine is WHO-prequalified and WHO-recommended. Population access follows:
in-country processes and procurement of significant volumes. The site, as Jan
reads it, lumps these together. The page already draws exactly these two
steps, as its two phases, Market Access (stages 1–3) and Country Access
(stages 4–7). The table did not use them. "On pathway" was one number, the
years since the first dated milestone, with no end. That column now reports
each phase on its own.

The "Delayed" half of the comment is §2. It is a separate commit, so either
change can be dropped without the other. §3 is sheet row 57, an "About LAUNCH"
statement, and the changelog line for all three.

---

## 1. Access milestones replace "On pathway"

### What a reader sees

| Medicine | Before ("On pathway") | After ("Access") |
| --- | --- | --- |
| ALAQ | — | Market Access: Not yet reached |
| ASPY | 14 years | Market Access: Reached in 2022 · Country Access: 4 years so far |
| DHA–PPQ | 16 years | Market Access: Reached in 2015 · Country Access: 11 years so far |
| GanLum | 1 year | Market Access: Not yet reached |

In the table each phase name sits above its figure. The open row's header
line says the same in one line ("Market Access: Reached in 2022 · Country
Access: 4 years so far"). An i beside the column heading and beside that line
gives the definition:

> Market Access is reached when a medicine is both recommended by WHO and
> WHO-prequalified. Country Access runs from then until national
> registration, policy adoption, procurement in significant volumes and
> in-country delivery are all complete.

No data changed. Every figure is read from the existing stage statuses and
dates, so the RBM `dashboard.json` is unchanged.

### Decisions

1. **The two milestones are the page's two phases, not new definitions.**
   Jan's market access (WHO PQ and WHO recommendation) is the end of the
   Market Access phase: those two are its last stage, the parallel pair in
   stage 3. Jan's population access (in-country processes and procurement) is
   the Country Access phase. *Rejected:* a separate pair of definitions next
   to the phases. That would put two sets of names on one page for the same
   split.

2. **"Country Access", not Jan's "population access".** The owner renamed
   "Country / Population Access" to "Country Access" on 9 Oct
   ([jackson/phone-fixes.md](jackson/phone-fixes.md) §1, row 3). A third
   name in the table would leave the reader to work out that it is the same
   phase as the card above. If the owner prefers Jan's word, it is one string
   in `PHASES`, and the card, the table and the i all follow.

3. **A phase is reached when every stage in it is Complete. Its year is the
   latest year among its dated stages,** read as the page reads every stage
   date (`stageYear`: the first year in the text).
   - ASPY: SRA 2012, WHO PQ 2012 ("2012–2016"), WHO recommendation 2022. Market
     access was reached in **2022**.
   - DHA–PPQ: WHO recommendation 2010, SRA 2011, WHO PQ 2015 ("2015–2023;
     requalified Jan 2025"). Market access was reached in **2015**.

   *Rejected:* counting only the two WHO milestones, which is Jan's wording
   taken literally. It gives the same years for both medicines today. Using
   the whole phase also requires SRA approval, which the page treats as the
   step before both. If a phase is Complete but no stage in it has a year, the
   figure reads "Reached, year not recorded". No medicine hits that case
   today.

4. **Country Access counts from the year market access was reached, not from
   the first country step.** ASPY was registered in Viet Nam in 2013 (DAV), and
   the Global Fund has bought it since 2018, both before WHO recommended it in
   2022. Counting from the first country step would put ASPY in Country Access
   for 13 years, nine of them before it had market access. Jan describes the
   two as sequential, so the count follows that. *Trade-off:* the count leaves
   out country activity before market access. That activity is still on the
   medicine's timeline.

5. **Country Access is shown only once market access is reached.** GanLum
   and ALAQ show one line. *Rejected:* "Country Access: Not started". It is
   true for both today, but it would be wrong for any medicine whose country
   steps start before market access.

6. **The end of Country Access is all four of its stages Complete.** Jan's
   "significant volumes" has no number. In the data, it is the analyst marking
   Procurement Complete. No medicine is near it: DHA–PPQ procurement is
   Delayed and ASPY's is In progress. So no figure on the page depends on a
   threshold yet. **Open for Jan and the team:** what counts as significant
   volumes, if the definition should say.

7. **The definition sits in two places,** the column heading and the open
   row's line. The column is hidden below 1041px, so on tablets and phones the
   line is the only place a reader sees the figures.

8. **The years-late badge stays wired to the cell, behind
   `YARD_COMPARE = false`.** Row 45 of the 15 Oct email hid it. If it is
   turned back on, it measures the whole journey from the first milestone, so
   under "Country Access" it would need its own label.

### Layout

The column is 112px, up from 100px, so "Reached in 2022" fits on one line.
Measuring that change turned up an older overflow, which this branch fixes
because it would otherwise have made it worse:

| Width | Board | Overflow on `main` | With the 112px column alone | With the new 1041–1180px rule |
| --- | --- | --- | --- | --- |
| 1041px | 958px | 28px | 52px (124px column, first try) | 0 |
| 1060px | 975px | 11px | — | 0 |
| 1080px | 994px | 0 | — | 0 |

Above 1040px the fixed minimums plus five 30px gaps came to more than the
board, so the main-barrier column ran off the edge. Between 1041px and 1180px
the gaps are now 18px and the medicine, stage and barrier minimums slightly
smaller. Measured in Playwright WebKit at 1400, 1181, 1180, 1100, 1041, 900
and 390px: no overflow, no script errors. The 1400px and 1041px tables and the
390px open row were checked by eye from screenshots. The header "i" is
`text-transform: none`, because the header row is upper case and showed "I".

### Translation

`i18n/reviewed-strings.json` drops the four entries for the removed "On
pathway" code (`< 1 year`, `ongoing`, `Under 1 year`, `On pathway: ${…}`). It
adds two for text the collector cannot find by pattern: the single word
"Access", and `${yrsText(n)} so far`. The js collector finds the rest itself:
"Reached in ${y}", "Not yet reached", "Reached, year not recorded", "Under 1
year so far" and the definition. A first draft also listed "Reached in ${y}" as
reviewed, which was a duplicate, so it was removed. `node
scripts/assemble-content.js` passes. `content.en.json` is left to the
translate bot, as #112 did.

**Translation is down.** translate.yml failed on its last four runs, 18 Oct
16:58 UTC to 19 Oct 06:17 UTC. The latest says "Translation failed for: fr pt
es"; the other three were not opened. Until the engine works again, `/fr`, `/pt` and `/es` show the new text in
English. That holds for every PR, not only this one.

---

## 2. What "Delayed" means

Jan asked what "Delayed" refers to. The i beside it said "Delayed: this stage
is not moving as fast as expected." That names no expectation. Since row 45
hid the yardstick, the page shows no expected time a reader could compare
against. "Delayed" is the hand-set `late` status:
[data-analyst-guide.md](data-analyst-guide.md) says "Stuck, slipped, or moving
abnormally slowly", a judgement call with a written reason. The i now says:

> Delayed: the medicine's current stage has stalled or is moving unusually
> slowly, in LAUNCH's judgement from public evidence. The main barrier gives
> the reason. It is not measured against a set deadline.

### Decisions

1. **"Current stage", not "the stage named above".** On phones the stage name
   is hidden in the summary row (`.c-stage .stg` is `display: none` at 680px
   and below), so a word about position would point at nothing.
2. **"The main barrier gives the reason"** holds for both Delayed medicines.
   A `late` stage requires a product `flag` (data rules), and the barrier
   cell shows `barrier || flag`. ASPY, national policy adoption: "National
   guideline inclusion is limited". DHA–PPQ, procurement: "Only 0.9–4.5% of
   Global Fund antimalarial orders by value, 2022–24". The barrier is shown on
   phones too, as the row's third line.
3. **The label stays "Delayed".** The owner chose on 15 Oct to keep the status
   (row 45 of the email asked to remove "expected", "variance" and
   "delayed"). *Rejected:* renaming it, for example to "Stalled". That reopens
   the owner's decision, and the definition is what Jan asked about.
4. **This rewrites the definition the owner chose to keep.** On 15 Oct the
   owner kept "the red Delayed status and its definition as they are". So
   this is its own commit, to be dropped if the owner says no. The new wording
   also loses the word "expected", which the row 45 email objected to.

The definition is in one place (`LATE_DEF`) plus its entry in
`i18n/reviewed-strings.json`, updated together.

---

## 3. About LAUNCH (sheet row 57), and the changelog line

Row 57 asked for "Jan's strategic proof-of-concept statement articulating
LAUNCH's mandate". It should explain the focus on four initial antimalarials
for MFT transparency, without implying product endorsement, with the scope
open to expansion. Jan's own text never arrived. On 19 Oct the owner said not
to wait for Jan and to write it. **The text below is the LAUNCH team's
wording, not Jan's, and Jan has not reviewed it.** It is a new footer section,
`#about-launch`, between the disclaimer and "About the data":

> LAUNCH, funded by Unitaid, is a proof of concept for making the access
> pathway of new antimalarial medicines transparent. It brings public
> information on each medicine together in one place, from development and
> regulatory approval through WHO recommendation and prequalification to
> registration, policy, procurement and delivery in countries, so that
> partners can see where access is held up and act on it.
>
> It starts with four medicines relevant to multiple first-line therapy (MFT)
> strategies, which use more than one first-line treatment in a population to
> reduce the risk of drug resistance. Two are already recommended by WHO but
> underused: artesunate–pyronaridine (ASPY) and dihydroartemisinin–piperaquine
> (DHA–PPQ). Two are in late-stage development: ganaplacide–lumefantrine
> (GanLum) and artemether–lumefantrine–amodiaquine (ALAQ). Together they cover
> both halves of the pathway: approval for the medicines in development, and
> adoption and procurement for those already recommended.
>
> Tracking a medicine here does not mean that LAUNCH or Unitaid endorses it or
> recommends it for any use. The dashboard reports where each medicine stands
> on the access pathway, not whether it should be used. For this proof of
> concept the scope is these four medicines; it may later expand to other
> medicines and malaria tools.

**6 Nov 2026:** the owner changed the first words to "The LAUNCH Transparency
Initiative, led by Unitaid and funded by the Gates Foundation, is a proof of
concept ..."; the rest is unchanged. French and Portuguese keep the
translators' text with only the opening edited by hand ("L’initiative LAUNCH
pour la transparence, menée par Unitaid et financée par la Fondation Gates",
"A Iniciativa de Transparência LAUNCH, liderada pela Unitaid e financiada pela
Fundação Gates"; "Il"/"Ele" become "Elle"/"Ela" in the next sentence). The new
key is not in the translators' record, so `export-xliff.js` puts it in their
next file for review.

### Decisions

1. **Every claim comes from something already in the repo.** "Unitaid-funded"
   and "make the whole board visible" come from
   [domain-primer.md](domain-primer.md) §1. The two pairs, one testing the
   regulatory half and one the adoption half, are §4 there. "Underused"
   matches the page's own "Recommended · Underutilized" label. MFT follows the
   glossary. *Rejected:* the primer's older details, "DeTACT" and "registered
   in 25+ countries". The row 51 claims audit and #112 corrected both.
2. **The reason for the four is the paired design,** which the primer
   documents, not a judgement of the medicines. That keeps the endorsement
   sentence true.
3. **"LAUNCH or Unitaid" in the endorsement sentence.** The disclaimer already
   speaks for Unitaid on accuracy. A visitor could read inclusion as a funder's
   preference, so both are named.
4. **"Other medicines and malaria tools"** leaves room for the spatial
   emanators row, which is pending funder approval (primer §4), without naming
   it.
5. **In the footer, not the header.** The sheet files it under "Strategic
   Framing / About", and the footer already holds the disclaimer and "About
   the data". `.ft-sec p + p` gives the three paragraphs 8px between them,
   because `.ft-sec p` zeroes margins.

### The changelog line

There is one entry dated 2026-10-19, for all three changes: the access
milestones, "Delayed", and About LAUNCH. *Why a line:* "On pathway: 14 years"
changes to "Reached in 2022 · 4 years so far", and a reader who saw the old
figure deserves to know why. The 8 Oct yardstick change set the precedent.
`meta.lastUpdated` is already 2026-10-19 (#117). `history-continues.js
history/products-2026-10-19.js data/products.js 2026-10-19` says "a later
change on 2026-10-19 (1 changelog entry added)", so publish.yml may replace
today's snapshot. Subscribers get it in the same daily email as #117's entry
(notify-subscribers, 15:00 UTC).

### The open points, settled without Jan

At the owner's instruction (19 Oct), these were settled without Jan:

- "Country Access" stays (§1, decision 2).
- "Significant volumes" stays in Jan's words, with no number (§1, decision 6).
- The new "Delayed" definition goes in (§2).

---

## 4. Deferred, or found in passing

- **RBM.** The RBM copy is built from this page and released by hand since
  #113. After a merge: rebuild, push and check the live iframe
  ([rbm/README.md, "How updates arrive"](../rbm/README.md#how-updates-arrive)).
- **Translation is skipped.** The Google key is not set up yet (owner, 19
  Oct). Everything new, including About LAUNCH, is English on `/fr`, `/pt`
  and `/es` until it is.
- **PR #111 conflicts with `main`.** It is 35 commits behind, with 10
  conflicts in `data/products.js` and 1 in this page. Rows 47–49 (#112) and
  the claim citations (#117) edited the same claims as #111's row 51. Its
  preview is built on the old base, so it also shows the yardstick badges that
  `main` hides. This branch does not touch it. It is resolved after this
  branch merges, so it is resolved once against the final `main`; that work is
  recorded on #111's own notes.
- **Resolved here:** [illustrated-journey-ui-notes.md](illustrated-journey-ui-notes.md)
  §4 listed "'On pathway' counts from the first cleared gate. The label
  doesn't say so, and ALAQ shows '—'". Both points are gone with the column.
  That line is left as written, because that document is #111's to edit.

---

## 5. Status

- Branch `feedback/jan-access-milestones`, from `main` `783f6d9`. Three
  commits: access milestones, "Delayed", About LAUNCH with the changelog line.
  Pushed and opened as a PR on 19 Oct, to merge once CI passes (owner's
  instruction). The PR records the CI result.
- Files: `illustrated-journey-dashboard.html`, `i18n/reviewed-strings.json`,
  `data/products.js` (one changelog entry), this document.
- Verify block (CLAUDE.md): treatment policy regenerated byte-identical;
  validator 0 errors, 1 warning; synthetic 0 and 0; `make-preview.js` ran;
  country names "covers all 252". `test-build-dataset.js` exits 1 on the stale
  `content.en.json`, which is expected for any change to page text. With
  `--allow-stale`, as validate.yml runs it, it reports 30 passed, 0 failed.
  Also as in validate.yml: `build-locale-pages.js --allow-stale` "All checks
  passed", `test-build-rbm-pages.js` 33 passed, `test-copy-rbm-pages.js` 20
  passed, `build-rbm-pages.js --allow-stale` built. No NUL bytes (counted in
  Python).
