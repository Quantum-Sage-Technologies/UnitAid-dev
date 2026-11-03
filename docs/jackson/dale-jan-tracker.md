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
- DHA–PPQ: Pierre Fabre's exclusive licence (2 Jul 2015) to register,
  distribute and promote Eurartesim in 32 African countries. A licence is a
  commercial right, not a registration, so the 32 are not counted and not
  mapped. Source `pierre-fabre-eurartesim-2015` (BioSpace; Business Wire
  copy in alsoSee). The access list also names the six register-confirmed
  countries, which only the stage note named before.
- **To confirm before merge:** neither page could be opened from this
  machine on 3 Nov (MMV's PDF and Business Wire answer 403 to a fetch,
  BioSpace returned an empty page, and a direct download was refused). The
  wording comes from search-result summaries: "29 countries in Africa and
  Asia" (Nov 2022 release) and "register, distribute and promote ... in 32
  African countries" (2 Jul 2015). Open both in a browser and check the
  figures and the press release's title before this goes live.

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

Branch `feedback/dale-jan-tracker`, 5 commits on `main` `c34d72c` (the fifth sets meta.lastUpdated to 2026-11-03), not
pushed. Verify block on 3 Nov: validator 0 errors / 1 warning (French
Guiana), synthetic 0 / 0, build-dataset 58 passed (`--allow-stale`), country
names cover all 252, rbm-messages 65, copy-rbm-messages 35, rbm-pages 36.
