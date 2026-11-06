#!/usr/bin/env node
// Tests for scripts/build-rbm-pages.js — the pages handed over to RBM.
//   node scripts/test-build-rbm-pages.js
// Transforms the English page in memory (writes nothing) and checks what the
// handover depends on: the data comes only from dashboard.json, the page's own
// code waits for it, paths point at the shared folders, the menu is gone, the
// two forms post to the LAUNCH API (or are off with --api-url none), and a
// page that has drifted from what the build expects fails loudly instead of
// producing a broken bundle.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { transform, widget, loader, messages, DEFAULT_DATA_URL } = require("./build-rbm-pages");
const { LOCALES } = require("./rbm-manifest");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const widgetJs = fs.readFileSync(path.join(__dirname, "..", "assets", "report-issue.js"), "utf8");
const API = "https://api.example.org";
let passed = 0, failed = 0;
const ok = (c, name) => { if (c) passed++; else { failed++; console.log("  FAIL " + name); } };

const { html: out } = transform(html, "fr", { apiUrl: API });
ok(!/<script src="(\.\.\/)?data\/(products|sources|treatment-policy)\.js"/.test(out), "products, sources and policy are not loaded as files");
// the map files and the feedback widget differ by language, so each page loads its own copy beside it
ok(/<script src="data\/world-map\.js"><\/script>/.test(out) && /src="data\/world-map-geo\.js"/.test(out), "map shapes load from the language's own data/");
ok(/src="assets\/report-issue\.js"/.test(out), "the feedback widget loads from the language's own assets/");
ok(!/(src|href)="(assets|data)\/(?!world-map\.js"|world-map-geo\.js"|report-issue\.js")/.test(out), "every other relative asset path points one level up");
ok(!/site-nav\.js/.test(out), "no site menu");
// the two forms, with an API to post to. The build adds no rule hiding
// Subscribe: checked on the loader, not the whole page, because since 6 Nov
// 2026 index.html hides Subscribe itself (switched off for now; see
// docs/hide-subscribe-notes.md), which is the page's choice, not the build's
ok(!/#sub-open, #subwrap \{ display: none/.test(loader("fr", API)), "with an API, the build does not hide Subscribe");
ok(out.includes(`fetch("${API}/api/subscribe"`) && !out.includes('fetch("/api/subscribe"'), "Subscribe posts to the LAUNCH API");
ok(/\bconnected: true\b/.test(out), "Send feedback stays connected");
{ const settings = out.indexOf("window.LAUNCH_FEEDBACK_COPY"), open = out.lastIndexOf("<script", settings);
  ok(out.slice(open, open + 8) === "<script>" && settings < out.indexOf('src="assets/report-issue.js"'),
     "the widget's settings run at once, before the widget, not after the data"); }
ok(widget(widgetJs, API).includes(`var ENDPOINT = "${API}/api/feedback";`) && !widget(widgetJs, API).includes('"/api/feedback";'),
   "the widget beside the page posts to the LAUNCH API");
// --api-url none: both forms off, as before 7 Oct
{ const { html: off } = transform(html, "fr", { apiUrl: null });
  ok(/#sub-open, #subwrap \{ display: none !important; \}/.test(off) && off.includes('fetch("/api/subscribe"'), "with no API: Subscribe hidden, and not pointed anywhere");
  ok(/\bconnected\s*:\s*true\b/.test(html) && !/\bconnected\s*:\s*true\b/.test(off) && /\bconnected: false\b/.test(off),
     "with no API: Send feedback, connected on the LAUNCH site, is not connected here");
  ok(widget(widgetJs, null) === widgetJs, "with no API: the widget is copied unchanged"); }
ok(/LANG = "fr"/.test(out) && /dashboard\.json/.test(out), "the loader reads dashboard.json in the page's language");
// the data sits beside the pages (27 Oct 2026): never fetched from the data repo's address
ok(DEFAULT_DATA_URL === "../data/dashboard.json" && out.includes('var DATA_URL = "../data/dashboard.json"'),
   "the loader reads ../data/dashboard.json, the copy beside the pages");
ok(!/fetch\("https?:\/\/[^"]*launch-data-test/.test(out) && !/DATA_URL = "https?:/.test(out), "no page fetches the data repo's address");
const app = (out.match(/<script type="text\/x-launch-app">/g) || []).length;
const plain = (html.match(/<script>/g) || []).length;
ok(app === plain - 1 && app > 0, "every other inline script of the page waits for the data");
ok(out.indexOf("var DATA_URL") < out.indexOf('<script type="text/x-launch-app">'), "the loader comes before the page's scripts");
ok(/s\.public = true/.test(out), "sources are marked public for the page's filter");
// the Unitaid look (RBM's own until 19 Oct 2026): after the page's own
// stylesheet, so its tokens win
ok(out.indexOf('<style id="rbm-skin">') > out.indexOf("</style>") && /--accent: #0066FF/.test(out) && /--ink: #212E92/.test(out),
   "the Unitaid skin comes after the page's CSS, with Unitaid Blue as the accent and Unitaid Navy as the ink");
{ const skin = out.slice(out.indexOf('<style id="rbm-skin">'), out.indexOf("</style>", out.indexOf('<style id="rbm-skin">')));
  ok(skin.length > 0 && !/--map/.test(skin), "the country access map keeps LAUNCH's own colours");
  ok(!/#2563EB|Roboto|Poppins/.test(skin), "nothing of the RBM look is left in the skin"); }
ok(/fonts\.googleapis\.com\/css2\?family=Source\+Sans\+3/.test(out) && !/family=(Poppins|Roboto)/.test(out), "Source Sans 3 loads, and RBM's fonts do not");
ok(!/#14657E/.test(out) && /const shades = \["#212E92", "#0066FF"/.test(out), "no teal left in the script colours");

// a page that no longer loads products.js the expected way must stop the build
let threw = false;
try { transform(html.replace('<script src="data/products.js"></script>', ""), "en"); } catch (e) { threw = true; }
ok(threw, "a page that changed how it loads its data stops the build");
threw = false;
try { transform(html.replace('const shades = ["#14657E"', 'const shades = ["#000000"'), "en"); } catch (e) { threw = true; }
ok(threw, "a page whose script colours changed stops the build, so no teal is left in the Unitaid look");
threw = false;
try { transform(html.replace('fetch("/api/subscribe"', 'fetch("/api/join"'), "en", { apiUrl: API }); } catch (e) { threw = true; }
ok(threw, "a page that no longer posts to /api/subscribe stops the build, rather than leave Subscribe pointing nowhere");
threw = false;
try { widget(widgetJs.replace('var ENDPOINT = "/api/feedback";', 'var ENDPOINT = "/x";'), API); } catch (e) { threw = true; }
ok(threw, "a widget whose endpoint changed stops the build");

// the loader, run for real on a small dataset: each page reads its own language
// from texts with any number of languages. Until 8 Oct 2026 it accepted only
// exactly { en, fr, pt }, so a file with one more language would have broken
// every page built before it (docs/jackson/spanish.md). Spanish came and went
// (8 to 27 Oct 2026); the archive still holds files with it.
function load(lang, locales) {
  const t = (en) => Object.fromEntries(locales.map((l) => [l, l === "en" ? en : `${en}-${l}`]));
  const ds = { schema_version: 1, locales, last_updated: "2026-10-08", data_status: "draft",
    data: { host: "x", stages: [t("A")], glossary: { g: t("G") }, changelog: [],
            products: [{ id: "p", note: t("N"), detail: { countries: { status: "verified" } } }],
            treatmentPolicy: { countries: { NGA: { name: t("Nigeria") } } }, sources: [{ id: "s", plain: t("P") }] } };
  const js = loader(lang, null).match(/<script>([\s\S]*)<\/script>/)[1];
  const asked = [];
  const ctx = { document: { readyState: "complete", getElementById: () => null, querySelectorAll: () => [] },
    fetch: (url) => { asked.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(ds) }); } };
  ctx.window = ctx;
  vm.runInNewContext(js, ctx);
  return new Promise((done) => setImmediate(() => done(Object.assign(ctx, { asked }))));
}
(async () => {
  ok(LOCALES.join() === "en,fr,pt", "the pages are English, French and Portuguese (no Spanish since 27 Oct 2026)");
  const MORE = ["en", "fr", "pt", "es"], THREE = ["en", "fr", "pt"];
  let w = await load("fr", MORE);
  ok(w.LAUNCH_DATA && w.LAUNCH_DATA.stages[0] === "A-fr" && w.LAUNCH_DATA.products[0].note === "N-fr" &&
     w.LAUNCH_TREATMENT_POLICY.countries.NGA.name === "Nigeria-fr", "a French page reads French from a file with a language more");
  ok(w.asked.length === 1 && w.asked[0] === "../data/dashboard.json", "the loader asks for ../data/dashboard.json, once");
  w = await load("pt", THREE);
  ok(w.LAUNCH_DATA && w.LAUNCH_DATA.stages[0] === "A-pt" && w.LAUNCH_DATA.glossary.g === "G-pt" &&
     w.LAUNCH_SOURCES.sources[0].plain === "P-pt", "a Portuguese page reads Portuguese from a file with three languages");
  w = await load("en", THREE);
  ok(w.LAUNCH_DATA && w.LAUNCH_DATA.stages[0] === "A" && w.LAUNCH_DATA.products[0].note === "N", "the English page reads English");
  ok(w.LAUNCH_DATA && w.LAUNCH_DATA.products[0].detail.countries.status === "verified", "objects that are not texts are kept as they are");
  // The messages come from the translation memory (12 Oct 2026), not from
  // text written in the script: whatever the lookup returns goes in, escaped.
  { const m = messages((s) => "[fr] " + s + " <&>");
    ok(m.fail === "<b>[fr] The dashboard data could not be loaded. &lt;&amp;&gt;</b> [fr] Please try again in a few minutes. &lt;&amp;&gt;", "loader messages come from the translation lookup, HTML-escaped");
    ok(messages().schema === "<b>This dashboard is being updated.</b> Please check back shortly.", "with no lookup the messages are the English"); }

  console.log(`\n  build-rbm-pages: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
