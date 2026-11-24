# "Click for details ›" removed from the map's hover box (24 Nov 2026)

Branch `fix/map-tip-no-details-line`. The owner reported that the country
box on the map could not be clicked: "that frame is moving along with the
cursor". The box is the map's hover tooltip (`#tip`). It follows the pointer
on every mouse move and has `pointer-events: none`, so its last line,
"Click for details ›", read as a link that could never be clicked. The owner
chose to remove the line: a click on the country already opens it in the
Detail panel beside the map. The same change was made in RBM's module
(`rbm-module-unitaid`, branch `fix/map-tip-no-details-line`, PR #16,
release **v1.5.2**), so Unitaid's review copy here and the page RBM hosts
match.

## Decisions

1. **Remove the line rather than make it clickable (owner's call, 24 Nov).**
   Measured in Chrome on the module (same tooltip code as `index.html`),
   1440 × 900, ASPY, map zoomed to Myanmar: moving the pointer 36 px up
   towards the line moved the line from 371 to 335 px down the window, and
   the box then described China. A click where the line stood went through
   the box: the Detail panel switched from Myanmar to China. Rejected after
   it was built and shown to the owner: a card pinned on click, with a ×
   and a real "Click for details" button (about 245 added lines in the
   module; it held still at 371 px over 10 pointer steps and closed on
   Escape, ×, a click elsewhere, and a change of country). The owner judged
   the button redundant, since the click that pins the card already fills
   the Detail panel, whose banner says "Select any country on the map … to
   open its page". The patch was not kept in either repository.
2. **`illustrated-journey-dashboard.html` is not changed,** although it has
   the same line (3821). `docs/developer-guide.md` says of it "Do not edit
   it; change `index.html`", and `vercel.json` redirects its address to `/`.
3. **The key goes from `i18n/ui.en.json` too, not only the page.** The
   module's `i18n/{en,fr,pt}.json` are built from this file
   (`scripts/build-rbm-messages.js`), and module PR #16 removes
   `Unitaid.tooltip.mapClickForDetails` from all three. Checked:
   `dist/rbm-messages/{en,fr,pt}.json` built on this branch equal the
   module's three files, the whole `Unitaid` namespace, in every language.
   Removing a key is safe for RBM's import (`import-module.mjs`, its
   `mergeInto`): the merge walks only the module's keys, so a removed one is
   never compared, and RBM's main project keeps its old copy, unused.
4. **`i18n/content.en.json` is rebuilt in this commit** (`node
   scripts/assemble-content.js`), as #156 and the 5 Nov procurement change
   did. Without it `scripts/test-build-dataset.js`, which `validate.yml` runs
   on pull requests, fails ("content.en.json is OUT OF DATE … 2 removed").
   Compared by key and bucket: exactly two entries leave, the page's and
   `ui.en.json`'s copies of "Click for details ›" (key `4dd79e5db3bfd9cb`,
   buckets `js` and `ui`); none is added; no other entry changes except its
   `where` line number. Counts: `js` 133 → 132, `ui` 310 → 309, total
   1049 → 1047. Of the diff's 134 added and 136 removed lines, 2 + 2 are
   `contentHash` and `counts`, 2 are the removed entries, and 132 are
   entries whose `where` line number this change shifted.
5. **`i18n/translations.json` is not touched.** Its French and Portuguese
   entry for "Click for details ›" stays, unused. The translate bot does not
   prune it either: `scripts/translate-strings.js` deletes entries only when
   a language's engine target changes. The `.det-cta` rule, used by that
   line alone, goes from
   `index.html`. A comment at the tooltip says why there is no line.

## Found in passing, left alone

- **CLAUDE.md's verify block expects `test-build-rbm-messages.js` "65
  passed (62 if dist/rbm-messages/ is not built)".** Unchanged `main`
  (`52af079`) gives 71 passed with `dist/` built; tests were added on 3 and
  4 Nov (`cc3c69a`, `ad3f394`). The failure count is 0 either way. Not
  changed here.
- **`docs/handoff-remove-study-layers.md` (lines 361, 397, 410) and
  `docs/rbm-messages-notes.md` (line 47) still quote "Click for details ›".**
  They record the page as it was; left as written.

## Status

- Branch `fix/map-tip-no-details-line` from `origin/main` `52af079`,
  1 commit. Files: `index.html`, `i18n/ui.en.json`, `i18n/content.en.json`,
  this file.
- Verify block on this branch: normalize byte-identical; validate 0 errors,
  1 warning (`treatment policy:`); synthetic 0 / 0; preview written,
  byte-identical; build-dataset 58 passed, 0 failed; country names cover all
  252; build-rbm-messages 71 passed, 0 failed (built); copy-rbm-messages
  35 passed, 0 failed.
- Checked in headless Chrome (1440 × 900, `index.html` served locally):
  hovering Myanmar shows "Myanmar · Registered · Country recommended use ·
  ASPY: not listed" and nothing more; clicking opens Myanmar in the Detail
  panel; no page errors.
- After merge the translate bot runs (`index.html` and `i18n/ui.en.json`
  are in its path filter). Expected, not yet seen: nothing new to
  translate, so no bot commit.
