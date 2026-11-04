# LAUNCH dashboard — pages for the RBM platform

The LAUNCH illustrated journey dashboard, one static page per language, for
embedding on dashboards.endmalaria.org under its /en, /fr and /pt routes. The
dashboard's data is one file, `data/dashboard.json`, hosted beside the pages.
When the data changes, the LAUNCH team sends a new copy of that file, which
replaces the old one; the pages themselves do not change.

```
en/index.html   fr/index.html   pt/index.html     the three pages
{en,fr,pt}/data/world-map.js, world-map-geo.js    country shapes, with that language's
                                                  country names (static)
{en,fr,pt}/assets/report-issue.js                 the feedback form, in that language
assets/                                           icons and logos (shared)
data/dashboard.json                               the dashboard's data (shared)
```

## What to host

Host these, side by side, exactly as they are:

- `en/`, `fr/`, `pt/`: the three pages, each with its own `data/` (map shapes
  and country names, not the dashboard's data) and feedback form;
- `assets/`: the icons and logos every page loads from `../assets/`. Without
  it, the pages lose their icons;
- `data/dashboard.json`: the dashboard's data, which every page loads from
  `../data/dashboard.json` each time it opens. Without it, the pages say the
  data could not be loaded.

That is 35 files: HTML, JavaScript, JSON, SVG and PNG. The styles are inside
each page, so there are no separate CSS files, and there is no build step or
server code.

Not needed: `index.html`, `iframe-test.html`, `rbm-shell/`,
and `build-manifest.json` in the LAUNCH test
copy are for development and testing only.

Map rendering uses MapLibre GL JS from cdnjs.cloudflare.com. The contract for
`dashboard.json` and its change rules are in the README of the data
repository, `codebyjackson/launch-data-test`, which keeps every published copy.

The pages wear Unitaid's brand (brandpad.io/unitaid), at Unitaid's request:
Unitaid Navy for text and headings, Unitaid Blue for actions, Unitaid Red for
delays, white cards on a Unitaid Grey canvas, and Source Sans 3. The country
access map keeps the LAUNCH site's colours. Fonts load from Google Fonts; to
self-host them instead, swap the fonts.googleapis.com link at the top of each
page.

## Hosting

Any static host works (the files are plain HTML, JS, JSON and SVG; no build
step). Serve the folder as it is; each page loads the shared `../assets/` and
`../data/dashboard.json`, and its own `data/` and `assets/report-issue.js`
beside it.

Allow framing by the RBM platform only — for example as a response header:

```
Content-Security-Policy: frame-ancestors https://dashboards.endmalaria.org
```

The pages make four kinds of outbound request, all from the reader's browser:
the same host as the pages (the data, the map shapes and the icons), MapLibre
(cdnjs), the fonts (fonts.googleapis.com and fonts.gstatic.com), and, when a
reader uses Subscribe or Send feedback, the LAUNCH project's email service
(below). A content security policy sent with these pages, by whatever host
serves them, must allow all four. The platform's own policy governs only its
page: it must allow framing the pages' host (`frame-src`), and does not apply
to requests made from inside the frame.

## Embedding

One iframe per language route, **sized to the screen, not to the page**: let
it fill the space below the platform's header, as the platform already does
for the WHO Malaria Threats Map (`class="w-full flex-1 min-h-0"` in a column
one screen tall), with a minimum of about 480px. The dashboard then scrolls
inside the frame.

```html
<!-- /en, in a column one screen tall (e.g. display:flex; flex-direction:column; height:100dvh) -->
<iframe src="https://<host>/en/" title="LAUNCH dashboard" class="w-full flex-1 min-h-0" style="border:0;min-height:480px" loading="lazy"></iframe>
<!-- /fr -->
<iframe src="https://<host>/fr/" title="Tableau de bord LAUNCH" class="w-full flex-1 min-h-0" style="border:0;min-height:480px" loading="lazy"></iframe>
<!-- /pt -->
<iframe src="https://<host>/pt/" title="Painel LAUNCH" class="w-full flex-1 min-h-0" style="border:0;min-height:480px" loading="lazy"></iframe>
```

**Do not give the frame a fixed height taller than the screen** (for example
`height:2400px`, which an earlier version of this README suggested). The
"Send feedback" button and its dialog are positioned within the frame, so in
a frame taller than the screen the button sits below the visible area until
the reader scrolls to the frame's end, and the dialog opens out of view.
Sized to the screen, the button stays in the bottom corner while the reader
scrolls. The LAUNCH test copy shows it working inside a mock of the platform:
https://codebyjackson.github.io/launch-rbm-test/iframe-test.html

## What readers see when something is wrong

- **The data cannot be loaded** (for example, `data/dashboard.json` is
  missing or in the wrong place): a notice that the data could not be loaded,
  and nothing else drawn — never a half-rendered chart.
- **The data file and the pages do not match** (its `schema_version` is not
  1: after a format change, only one of the two was replaced): a notice that
  the dashboard is being updated.
- **Subscribe or Send feedback cannot reach the email service** (it is down,
  or the host serving these pages is not yet on its list): the form says it
  could not send just now, and keeps what the reader typed.

## Differences from the LAUNCH site

- No site menu (its other pages are not part of this handover; the platform
  has its own navigation).
- "Subscribe for updates" and "Send feedback" work as on the LAUNCH site, but
  post to the LAUNCH project's own email service at
  `https://launch-development-test.vercel.app/api/` rather than to this host,
  which has none. That service accepts them only from hosts on its list
  (`PARTNERS` in the LAUNCH repository's `api/_mail.js`). Today the list holds
  the test repository's copy on GitHub Pages, `https://codebyjackson.github.io`.
  **Every
  host that serves these pages needs its own entry, test and staging
  included: tell the LAUNCH team each host's address** (scheme and domain,
  e.g. `https://dashboards.endmalaria.org`) before readers use it. On a host
  that is not listed, both forms show their "could not send" message to
  every reader.
  Subscribers' addresses and feedback go to the LAUNCH team, and the emails
  are in English.

## How updates arrive

**Data:** when the data changes, the LAUNCH team sends a new
`dashboard.json`. Put it in place of `data/dashboard.json` (same name, same
place, nothing else changed), clear any cache or CDN copy of that file, check
that the "Last updated" date on a page matches the date the team gave, and
tell the team it is live. Until then, the pages show the previous data.

**Pages:** no changes are planned after handover. If Unitaid asks for one, the
LAUNCH team sends you an updated set of files to replace the old ones.

**Please do not edit the hosted files by hand.** They are built from the same
page as the LAUNCH site, so a change made only here never reaches the LAUNCH
site or the translations. Ask the LAUNCH team for the change instead.

**A change to the data's format** is rare and announced in advance. New pages
and a new `dashboard.json` come together, and replace the old ones at the same
time.

### For the LAUNCH team (development stage only)

`node scripts/build-rbm-pages.js` builds these pages, with a copy of the
latest published `dashboard.json` from a checkout of `launch-data-test` next to
the LAUNCH repository (`--dataset <file>` for another); `--api-url` sets where
the two forms post, and `--api-url none` builds them switched off.
`node scripts/copy-rbm-pages.js --to <checkout of launch-rbm-test>` copies a
build into the test copy `codebyjackson/launch-rbm-test`; commit and push
there by hand. The copy replaces exactly the files listed under "What to
host".

After each publish to the data repository (Publish now, or the end of an
approval), pull `launch-data-test`, then
`node scripts/copy-rbm-pages.js --to <checkout of launch-rbm-test> --data-only`
replaces only `data/dashboard.json` there. That same file is the one to send
RBM.

**Retired, 5 Nov 2026.** The test copy is gone: `launch-rbm-test` `main` is
now the React version, its last static pages are kept at the tag
`static-pages-final`, and its GitHub Pages site is off. RBM receives the
dashboard as the `unitaid` module in `rbm-data-initiative/rbm-module-unitaid`
(release `v1.1.1`); see `docs/developer-guide.md`.
