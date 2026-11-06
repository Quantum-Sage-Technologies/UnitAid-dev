# Subscribe for updates hidden for now (6 Nov 2026)

Branch `feat/hide-subscribe`. The owner asked to remove the Subscribe button
for the current phase and keep Send feedback and its form as they are. The
same change was made in RBM's module (`rbm-module-unitaid`, its own branch
`feat/hide-subscribe`), so Unitaid's review copy here and the page RBM hosts
match. The two codebases share the data but not the page code, so each
needed its own change. In the module it ships in **v1.4.0** with the photo
header (PR #11) and other changes (owner's call, 6 Nov: no separate
v1.3.1); v1.4.0 is tagged once all of them have merged.

## Decisions

1. **Hidden, not deleted.** It is "for now", so it has to come back cheaply.
   Hiding is one CSS rule in `index.html`; deleting meant the button, the
   panel, most of the 133-line header-actions CSS block (it also styles
   Download CSV), the 148-line "subscribe for more information" script
   section, and the 17 `subscribe.*` keys in `i18n/ui.en.json`. Removing or
   changing keys sets off the translate bot here, and RBM's import script
   refuses an upgrade when any of our keys changes value (flow test of 5 Nov:
   192 fr / 163 pt clashes from v1.0.0 to v1.1.1). No reader-facing text in
   the page was changed.
2. **How it is hidden: `#sub-open, #subwrap { display: none !important; }`,**
   the rule `scripts/build-rbm-pages.js` already used to hide Subscribe with
   `--api-url none`. Rejected: the `hidden` attribute on the button alone.
   `.hdr-actions button { display: inline-flex; }` is author CSS and beats
   the browser's own `[hidden] { display: none }`, so the button would have
   stayed. The panel opens from nothing but the button (no hash or query
   opens it), so hiding the button closes every way in; `#subwrap` is in
   the rule anyway.
3. **The rest of subscribing stays.** `api/subscribe.js`,
   `api/unsubscribe.js` and `notify-subscribers.yml` are untouched: anyone
   already subscribed keeps getting the update emails and can still
   unsubscribe from them. Stopping those emails was not asked for.
4. **Send feedback is untouched.** It is the separate widget
   (`assets/report-issue.js`), not part of the header.
5. **One test changed, because it checked the right thing in the wrong
   place.** `scripts/test-build-rbm-pages.js` asserted "Subscribe shows" by
   looking for the hide rule anywhere in the built page. Its subject is the
   build script (with an API, the loader adds no hide rule), but it read the
   whole page, so the page's own rule failed it. It now reads `loader("fr",
   API)`, the build's own output. Writing the page's rule in another form so
   the old regex missed it was rejected: the test would pass under a name
   that is no longer true.

## Found in passing, left alone

- **The unsubscribe page still says "Changed your mind? You can subscribe
  again from the dashboard at any time."** (`unsubscribe.doneAgain`, in
  `i18n/ui.en.json`, `api/unsubscribe.js` and RBM's module). That now points
  at a button that is not there. Left because changing it is a translated
  key on both sites (decision 1); it only shows to someone already
  subscribed who unsubscribes.
- **Download CSV keeps its outlined style** now that it is alone. It was the
  outlined one because Subscribe took the solid accent; left as is.
- **RBM handover guide** (`~/Downloads/LAUNCH-RBM-handover-guide-source/guide.html`)
  describes Subscribe in three places (the build-variable note, the Forms
  paragraph, the check that both forms open). Not updated here.
- **Phone screenshots in headless Chrome at 390 px are cut off on the right**,
  identically before and after this change, so not caused by it; probably
  headless Chrome's minimum window width. The 4 Nov check found the site fits
  at 360 px.

## Status

- Branch `feat/hide-subscribe` from `origin/main` `91bb29c` (after #156). Files:
  `index.html`, `scripts/test-build-rbm-pages.js`, `explainer.html` (the
  table row that listed the forms), `README.md`, this file.
- Verify block on `91bb29c` plus this change: see the commit; expected
  results unchanged (0 errors / 1 warning, synthetic 0 / 0, build-dataset
  0 failed, country names cover all). `test-build-rbm-pages.js` 36 passed,
  0 failed. `build-locale-pages.js`: the rule is in the fr and pt pages,
  which Vercel builds from `index.html`.
- Checked by eye in headless Chrome at 1440 and 390 px: no Subscribe, Download
  CSV on the right, Send feedback button bottom right.
