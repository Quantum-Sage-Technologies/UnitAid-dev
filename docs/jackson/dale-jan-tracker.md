# Dale's tracker and Jan's feedback, 3 Nov 2026

Branch `feedback/dale-jan-tracker`, from `main` `c34d72c`. Local only until the
owner has tested it.

The rows come from the partners' tracker (Dale's Tracker, Dale's Feedback,
Jan's Feedback), pasted by the owner on 3 Nov 2026. That tracker is newer than
`Feedback/1-LAUNCH_Requirements_RBM_Unitaid.xlsx`, which does not have these
rows. The owner's rule for this round: do only what the rows ask, nothing
suggested on top.

## Where each row stood on 3 Nov, before this branch

| Row | Tracker status | What the page showed |
| --- | --- | --- |
| ASPY timeline: registration before WHO recommendation; 29 registrations | In Progress | Registration undated on the timeline ("Ongoing · no date"); 5 national registers; no 29 |
| CAG consultation (Pierre or George) | In Progress | Nothing in the repo; RBM/Unitaid own the contact |
| Map shading: radio buttons or toggle layers | In Progress | Shaded by the furthest stage; checkboxes only fade stages |
| GanLum MAGHP countries | In Progress | Waiting on Novartis. A web search (3 Nov) found no public source naming the ten countries or a MAGHP filing, so "no filing announced" still matches what is public |
| DHA–PPQ registrations beyond 6; Pierre Fabre licence | In Progress | 6 registers; licence not mentioned |
| DHA–PPQ map vs text ("6 registers" vs 2 registered) | In Progress | Not fixed: the map shades Nigeria, Rwanda, Tanzania and Viet Nam at a later stage, so only Zambia and Zimbabwe read "Registered" |
| Timeline milestone completeness | Not Started | Gaps between WHO PQ (2015) and today |
| Jan: Market / Country Access headings | Not Started | Already done 19 Oct (the Access column and the pathway strip); "Population Access" was dropped by the owner on 9 Oct. Not changed here |
| Jan: WHO GDG terminology | Not Started | "A WHO expert group" |

Not touched, because their owners are others or the data is not ours to use:
CAG consultation, MAGHP (Novartis), STOP-AMDR (Jhpiego documents needed), the
Maisha Meds data (confidential, not to be given to AI), and the Steering
Committee items (caveats review, MFT policy scope, a Scaled Use step).

## Decisions

### 1. GDG wording (Jan)

The WHO recommendation step's "what" now names the Guideline Development
Group (GDG) for malaria, a group of external experts, and says what it does
for an antimalarial medicine: it reviews the evidence and formulates the
recommendation on whether, and for which patients, the medicine is in the WHO
Guidelines for malaria. The source line cites the WHO handbook for guideline
development, 2nd ed. (2014), p. 130, as Jan's row does.

- **Spelling.** Jan's row writes "Guidelines Development Group"; the
  handbook it cites writes "Guideline Development Group" (singular), and so
  do the WHO Guidelines for malaria. The row asks to align with the
  handbook, so the handbook's spelling is used everywhere: the step, "who
  decides", the glossary (real and synthetic), the explainer page and the
  ontology builder's note. Change back if the partners prefer theirs.
- Page 130 is Jan's citation; it was not re-read here.
- The docs (`domain-primer.md`, `project-explainer.md`, `user-guide.md`)
  keep the old spelling; they are internal.

### 2. Registration counts from manufacturers (items: ASPY 29; DHA–PPQ beyond 6)

The owner's choice (3 Nov): **text only, attributed.** The map stays on the
5 Oct rule (a national register, a WHO publication or a peer-reviewed paper);
these two figures appear as words, each marked as the company's own.

- ASPY: "MMV and Shin Poong reported in November 2022 that Pyramax was
  registered in 29 countries in Africa and Asia; that count is the
  manufacturer's own and has not been checked against national registers",
  in the registration stage and as an access line. Source
  `mmv-shinpoong-pyramax-2022`, the joint press release (MMV's PDF). MMV's
  product page (`mmv-pyramax`, checked 19 Oct) says "at least 28 countries
  (tablets) and 19 countries (granules)"; the tracker's 29 is the press
  release's figure.
- DHA–PPQ: "Since July 2015 Eurartesim has been entrusted exclusively to
  Pierre Fabre in 32 African countries (Sigma-Tau, now Alfasigma). This is a
  commercial licence, not a registration." The 32 are not counted and not
  mapped. Source `pierre-fabre-eurartesim-2015` (BioSpace; Business Wire
  copy in alsoSee). The access list also names the six register-confirmed
  countries, which only the stage note named before.
- ASPY, second figure (added 3 Nov at the owner's request, from Dale's
  comment): the PYRAPREG trial protocol, peer-reviewed (BMJ Open 2023;
  13(10): e065295), "The treatment (tablets) is currently registered in 19
  African countries and five Asian countries. Pyramax (granules) is
  registered in 15 African countries." In the registration stage and as an
  access line; source `bmjopen-pyrapreg-2023`. No country list, so not mapped.
- **Quotes.** Neither press release could be opened from this machine (403
  and an empty page; a direct download was refused). The quotes in the two
  sources' findings are Dale's, from the partners' comments the owner pasted
  on 3 Nov: the Pyramax release ("Both formulations ... 29 countries in
  Africa and Asia") and BioSpace ("entrusted exclusively to Pierre Fabre in
  32 African countries"). The first draft said "register, distribute and
  promote", from a search summary and not in Dale's quote; it now follows
  the quote. The press release's title and its November 2022 date are still
  from search results.
- **DHA–PPQ beyond 6: the owner's choice is to leave it at 6** and get the
  further countries from the CAG (Pierre or George). Dale's comment is that
  DHA–PPQ "is quite old now" and should be registered in more countries;
  only national registers on file are counted.

### 2a. STOP-AMDR (both operational research rows): not added

Dale: ASPY is in the MFT plans of all STOP-AMDR countries, and DHA–PPQ of all
but DRC. Searched on 3 Nov: Unitaid's news release (19 Aug 2025) and project
page, Jhpiego's project page and grant story, and the MESA Track record all
name the six countries (Burkina Faso, DR Congo, Kenya, Nigeria, Rwanda,
Uganda; Jun 2025 – Dec 2029, US$26.5m), but none names ASPY or DHA–PPQ, in
general or per country, or says DP is not used in DRC. The medicine-by-country
claim has no public source, so nothing was added; it needs Jhpiego's project
documents.

### 3. Timeline: registration before recommendation, and interim milestones

The owner's choice (3 Nov): **date them**, from data on file, and say what
the registration date is.

- Registration is dated from the **earliest registration on the national
  registers checked** (`sourcing/staging/*_registrations.csv`, the DAV
  extract of 19 Oct 2026). A register shows the record it holds today, which
  can be a renewal, so the wording does not say "first registered". Viet Nam's
  numbers carry their year (VN2-210-13, VD-12944-10), which agrees with the
  issue dates.
  - ASPY stage 4 (in progress): "Since 2013 (Viet Nam, the earliest
    registration on the national registers checked); rolling".
  - DHA–PPQ stage 4 (complete): "2010 (Viet Nam, ...); rolling". DHA–PPQ
    was registered in Viet Nam (Arterakine, a local product) before EMA
    approval (2011) and WHO PQ (2015): the same precedence the ASPY row asked
    about.
- **Code (`journeyTime`).** The time-scaled journey placed only complete
  stages on the axis; a started one went to "Ongoing · no date" even when its
  date said "Since 2018". Now a started stage (in progress or delayed, not the
  current one) with a "Since YYYY" date sits at that year with "since YYYY"
  under it. The current stage is unchanged (it sits at today, with its bar).
  The "Since" words are matched as `sinceYearOf` already does, in all three
  languages. Effect: ASPY shows registration 2013 and procurement 2018
  between WHO PQ (2012) and its 2022 recommendation. Rejected: marking ASPY's
  registration "complete" so the old rule would place it; the status is a
  judgement and stays.
- **Milestone rows.** DHA–PPQ gets "Country registrations" (6 countries
  register-confirmed; earliest on each register: Viet Nam 2010, Nigeria 2020,
  Tanzania 2021, Rwanda 2023, Zambia 2024, Zimbabwe 2025). Both get "MFT
  pilots and plans": Kenya 2020–22 (Homa Bay), Burkina Faso (Kaya), Rwanda
  2024–25 (six districts), Nigeria planned, from the four sources the map
  already cites. Burkina Faso's paper (2022) does not give the pilot's start
  year, so none is shown.
- **Left as is:** DHA–PPQ's national policy adoption has no start year in any
  source on file (the WHO table is "policy as of 2024"), so it stays "Not yet
  dated" rather than borrowing 2020 from the Kenya pilot. DHA–PPQ's current
  stage still counts from WHO PQ (2015), as decided on 15 Oct (row 49).
- **React port.** `feat/react-port` has its own timeline code; the data change
  reaches it, the "since YYYY" placement does not until it is ported.

### 4. Country access map: one stage at a time (items: shading and layer controls; DHA–PPQ map vs text)

The owner's choice (3 Nov): **radio buttons**. Rejected: independent toggle
layers (a country in two layers needs a combined look, busier on a phone),
and keeping the furthest-stage shading with reworded text.

- **What each view shows** (`countryStages()` in `index.html`):
  - Registered: the entry is at `registered`, or cites a source whose
    category is National register. ASPY 5 (NGA, RWA, VNM, TZA, ZMB), DHA–PPQ
    6 (NGA, RWA, TZA, VNM, ZMB, ZWE): the numbers the text already gave.
  - In national guidelines: the entry is at `guidelines`, or cites a source
    whose category is Policy / guidelines. In practice that adds Nigeria and
    Burkina Faso (at `mft`, both citing the WHO national drug policy table,
    which lists both medicines for them; checked against
    `data/treatment-policy.js`). ASPY 9, DHA–PPQ 11. Rwanda and Kenya cite
    only MFT sources, so they are not added.
  - In MFT plans: the entry is at `mft`. 4 each.
  - The data keeps one `level` per country (the furthest stage), so nothing
    in the data model changed; the views are read from `level` plus the
    categories of the sources already cited. Category slugs are compared as
    `countryAccessKv` already did, so they are not collected for translation.
- **Text made to match.** `detail.country` is now these per-stage counts
  (ASPY 5/9/4, was 2/7/4; DHA–PPQ 6/11/4, was 2/9/4) and
  `scripts/validate-data.js` checks them the same way (the old rule counted
  each country once at its level). The national-guideline stage note and
  milestone read "9 countries; MFT plans in 4" and "11 countries; MFT plans
  in 4", with Nigeria and Burkina Faso named as in both. The Country access
  card lists Confirmed in national registers / In national guidelines / In MFT
  plans with "A country can count at more than one stage."
- **The page.** Filters: the stage rows are radio buttons (Registered is the
  default and what Reset returns to); the No data row and the select-all box
  are gone; the recommended-use groups are still checkboxes; the badge counts
  only unticked groups. Legend: the stage in view and No data. The line under
  the heading explains the view. Tooltip and country page: each stage ticked
  on its own; the country page's pill and "Other countries at the same stage"
  appear only when the country is at the stage in view. Detail overview: one
  bar per stage ("Access stages", was the stacked "Access stage mix"). Find a
  country lists every country (unticking a stage used to remove its
  countries); its Stage column follows the view.
- **Checked** in Chrome (Playwright, 1440 px): every view for ASPY and
  DHA–PPQ (filters, legend, note), Ghana's and Nigeria's tooltips and pages,
  Reset, the Country access cards. No page errors.
  `i18n/reviewed-strings.json`: the overview heading's entry follows the new
  text, and "since ${it.from}" is added; `assemble-content.js` collects every
  new string. `content.en.json` is left to the translate bot, as usual.
- **Not changed:** `option-b.html` (an old design option, still copied to the
  site but unlinked) keeps "shaded by the furthest stage". The React port in
  `launch-rbm-test` has its own map (`lib/map.ts`, `MapFilters.tsx`,
  `MapLegend.tsx`, `CountryPanel.tsx`) and timeline code; it gets the data
  (counts, text, dates) but not the radio views or the "since YYYY" placement
  until they are ported.

## Status

Branch `feedback/dale-jan-tracker`, 7 commits on `main` `c34d72c` (the fifth sets meta.lastUpdated to 2026-11-03; the sixth is §2's follow-up; the seventh is §5), not
pushed. Verify block on 3 Nov: validator 0 errors / 1 warning (French
Guiana), synthetic 0 / 0, build-dataset 58 passed (`--allow-stale`), country
names cover all 252, rbm-messages 65, copy-rbm-messages 35, rbm-pages 36.

### 5. Jan's two rows, finished (3 Nov, after the owner pasted Jan's 21 Oct email)

The email asked for more than the tracker rows showed; §1 did only the name.

- **Market, Country & Population Access Headings.** Earlier this note said
  the row was done on 19 Oct; it was not. The table had a Status column and
  one Access column holding both phases. Now `Status` → **Market Access**
  and `Access` → **Country Access**, one figure each (`marketCell`,
  `countryCell` replace `accessCell`). ASPY: Reached in 2022 / 4 years so
  far; DHA–PPQ: Reached in 2015 / 11 years so far; GanLum and ALAQ: Not yet
  reached / Not yet reached. The current stage's status word leaves the table
  (it still shows on the journey and the timeline; `lateInfo` is kept,
  unused, for when status words return). Below 1040 px the Country Access
  column is hidden, as Access was; on phones, where the header row is hidden,
  each figure carries its phase name. Population Access stays dropped (owner,
  9 Oct). Owner's choice: "Yes, as the row says".
- **WHO Terminology & Handbook Alignment.** The step's "what" now follows
  the handbook's §10.5.1, p. 130 (which Jan quoted): the GDG reviews the
  graded evidence (GRADE) and other criteria and agrees by consensus on the
  direction and strength of each recommendation. The glossary (real and
  synthetic) follows. New source `who-handbook-guidelines`, with Jan's IRIS
  link. Drug-specific: the WHO PQ step adds "This is the process for
  medicines; vector control products follow a different route" (owner's
  choice; rejected: a box heading, or leaving it to the page header).
  Jan's EOI question: the malaria EOI lists are WHO Prequalification's own
  (the source is WHO PQ's 24th malaria EOI), not an MNT invention. Checking
  the wording with the QNS team is Jan's call.
- Checked: validator 0 / 1, synthetic 0 / 0, build-dataset 58,
  rbm-pages 36, rbm-messages 65; table rendered at 1440, 1000 and 390 px.
  React port: its table is its own code, not changed.
