#!/usr/bin/env node
// Tests for the forms service: the Supabase Edge Function behind the
// dashboard's two forms, "Subscribe for updates" and "Send feedback", in
// supabase/functions/_shared/ (handle.mjs, the entry point; mail.mjs, the
// shared code; subscribe.mjs, unsubscribe.mjs, feedback.mjs; logo.mjs).
//
// Every check calls the service the way its host does: handle(new Request(…),
// env), with env standing in for the function's secrets. No network and no
// Resend key: global fetch is replaced with a stub that records every call and
// answers as Resend would, so these check exactly what would have been sent,
// and what the form would have been told.
//
// Ported from scripts/test-mail-api.js, which tests api/ on Vercel and stays,
// since api/ keeps running until the switch. Dropped in the port, because the
// service has no such behaviour:
//   - "an Origin matching x-forwarded-host is accepted", "the page's own Origin
//     is accepted", "no Origin at all (curl) is let through": every caller is
//     on another site, so there is no same-origin case; a request with neither
//     token nor known Origin is now refused (401).
//   - "on a preview, the links point at that preview" and "a host that is not
//     a host name is refused": links come from SITES and FORMS_BASE_URL, never
//     from the Host header.
//   - "unsubscribe — the page the link opens" (the page, its escaping, its
//     headers, its button): the service serves no page, since Supabase's own
//     address serves pages as plain text. GET now sends the reader on (303) to
//     their site's page, and the checks for that replace these.
//   - "the dashboard form's JSON endpoint still refuses Origin: null" kept;
//     the HTML-form button posting with Origin: null is gone, but a mail app's
//     one-click POST may carry Origin: null, which is still accepted.
// New here: callers (site tokens and Origins), body size, routing, FORMS_BASE_URL,
// links made on Vercel, and that every email is drawn exactly as api/_mail.js
// draws it (the update email still comes from there).
//
//   node scripts/test-forms-service.mjs              run everything
//   node scripts/test-forms-service.mjs subscribe    run the groups whose name matches

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { handle } from "../supabase/functions/_shared/handle.mjs";
import * as mail from "../supabase/functions/_shared/mail.mjs";
import { LOGO_PNG_BASE64 } from "../supabase/functions/_shared/logo.mjs";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
// api/_mail.js on Vercel: links it emailed must still work here, and the
// update email it draws must match the emails drawn here.
const old = require("../api/_mail.js");

// The settings as committed, copied before any test below swaps in its own.
const SHIPPED = JSON.parse(JSON.stringify(mail.ADDRESSES));

let pass = 0, fail = 0;
const only = process.argv[2];
const failures = [];
const queue = [];

function group(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
  queue.push(async () => { console.log("\n\x1b[1m" + name + "\x1b[0m"); await fn(); });
}
function is(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  \x1b[32mok\x1b[0m   " + label); }
  else {
    fail++; failures.push(label);
    console.log("  \x1b[31mFAIL\x1b[0m " + label + "\n         expected " + e + "\n         got      " + a);
  }
}
function ok(label, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32mok\x1b[0m   " + label); }
  else { fail++; failures.push(label); console.log("  \x1b[31mFAIL\x1b[0m " + label + (detail ? "\n         " + detail : "")); }
}

// ---- harness ---------------------------------------------------------------

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const RBM_TOKEN = "rbm-token-0123456789abcdef0123456789abcdef";
const LOCAL_TOKEN = "local-token-0123456789abcdef0123456789abcdef";
const HOST = "https://forms.example.org";
const BASE = HOST + "/functions/v1";
const ENV = {
  RESEND_API_KEY: "re_test_key", UNSUBSCRIBE_SECRET: SECRET, TEAM_INBOX: "team@example.org",
  FORMS_BASE_URL: BASE, RBM_FORMS_TOKEN: RBM_TOKEN, LOCAL_FORMS_TOKEN: LOCAL_TOKEN
};
const env = (over) => Object.assign({}, ENV, over);
const DAY = 86400 * 1000;

// Stands in for the ADDRESSES block in mail.mjs, whatever it holds: from ""
// is Resend's test sender, segment "" is no segment.
const ADDR = { from: "", segment: "" };
const SEG = { from: "", segment: "seg_123" };

const LAUNCH = mail.siteById("launch");
const RBM = mail.siteById("rbm");
const LOCAL = mail.siteById("local");
const PAGES = mail.siteById("rbm-pages");

// Who is calling: RBM's server (its token) by default, or a site's page.
const AS_RBM = { authorization: "Bearer " + RBM_TOKEN };
const page = (origin) => ({ authorization: undefined, origin });
const NOBODY = { authorization: undefined };

// Resend's answers, queued per call; anything unqueued is a plain success.
let calls = [], answers = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, method: init.method, auth: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : undefined });
  const a = answers.shift() || { status: 200, body: { id: "stub-id" } };
  if (a.throws) throw a.throws;
  return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
};

// Captures console output so the no-submission-in-logs rule can be checked.
let logs = [];
const real = { log: console.log, error: console.error, warn: console.warn };
async function quiet(fn) {
  logs = [];
  console.log = console.error = console.warn = (...a) => logs.push(a.join(" "));
  try { return await fn(); } finally { Object.assign(console, real); }
}

function headersOf(over) {
  const h = Object.assign({ "content-type": "application/json" }, AS_RBM, over);
  const out = new Headers();
  for (const [k, v] of Object.entries(h)) if (v !== undefined) out.set(k, v);
  return out;
}

// One request through the service. `body` is JSON-encoded unless a string (or
// a stream); `addr` sets the ADDRESSES block for this call.
async function call({ method = "POST", path: p = "/api/subscribe", headers, body, env: e = ENV, addr = ADDR, answer = [] } = {}) {
  Object.assign(mail.ADDRESSES, { from: addr.from || "", segment: addr.segment || "" });
  calls = []; answers = answer.slice();
  const init = { method, headers: headersOf(headers) };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    if (body instanceof ReadableStream) { init.body = body; init.duplex = "half"; }
    else init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await quiet(() => handle(new Request(HOST + p, init), e));
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch (err) { /* left null */ }
  const h = (k) => res.headers.get(k);
  return { status: res.status, json, raw, h, calls, logs };
}
const sub = (o = {}) => call({ ...o, path: o.path || "/api/subscribe" });
const fb = (o = {}) => call({ ...o, path: o.path || "/api/feedback" });
const uns = (o = {}) => call({ ...o, path: o.path || "/api/unsubscribe" });

const token = (purpose, email = "reader@example.org", site = null, now) => mail.makeToken(SECRET, purpose, email, site, now);
const read = (t, purpose = "unsubscribe", secret = SECRET) => mail.readToken(secret, purpose, t);
// A link's token, read back out of an email.
const tokenIn = (s, prefix) => {
  const m = new RegExp(prefix.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "\\?t=([A-Za-z0-9_-]+)").exec(s || "");
  return m && m[1];
};
const pathOf = (c) => c.method + " " + c.url.replace("https://api.resend.com", "");
const ONE_CLICK = { "content-type": "application/x-www-form-urlencoded", authorization: undefined };
const b64url = (s) => Buffer.from(s, "base64url");

// Resend answers for each kind of lookup.
const NO_CONTACT = { status: 404, body: { name: "not_found", message: "Contact not found" } };
const SUBSCRIBED = { status: 200, body: { object: "contact", id: "c1", email: "reader@example.org", unsubscribed: false } };
const UNSUBSCRIBED = { status: 200, body: { object: "contact", id: "c1", email: "reader@example.org", unsubscribed: true } };

// ---- groups ----------------------------------------------------------------

// What the subscribe form sends: names required, organisation optional.
const NAMES = { firstName: "Amina", lastName: "Bello" };
const SUB = { ...NAMES, email: "reader@example.org" };

// What the feedback form posts.
const REPORT = {
  type: "correction",
  productId: "coartem-baby",
  productName: "Coartem Baby",
  message: "Tanzania approved this in June 2026 — TMDA register entry TZ/123.",
  name: "Amina",
  email: "amina@moh.example",
  organisation: "Ministry of Health",
  page: { url: "https://dashboards.endmalaria.org/en/unitaid", path: "/en/unitaid", title: "LAUNCH", view: "illustrated" },
  data: { lastUpdated: "2026-09-20", dataStatus: "draft" },
  submittedAt: "2026-10-02T10:00:00.000Z",
  userAgent: "Mozilla/5.0 test"
};
const withReport = over => Object.assign({}, REPORT, over);

group("request guard", async () => {
  let r = await sub({ method: "GET" });
  is("GET is refused with 405", r.status, 405);
  is("  and says POST is what is allowed", r.h("allow"), "POST");

  r = await sub({ method: "OPTIONS" });
  is("a preflight from a site's server (no Origin) gets 405 and no CORS headers", [r.status, r.h("access-control-allow-origin")], [405, null]);

  r = await sub({ headers: page("https://evil.example"), body: SUB });
  is("another site's Origin is refused with 403", r.status, 403);
  is("  and nothing reaches Resend", r.calls.length, 0);

  r = await sub({ headers: page(LAUNCH.origin), body: SUB });
  is("a known site's page is accepted", r.status, 200);

  r = await sub({ headers: page("not a url"), body: SUB });
  is("a malformed Origin is refused", r.status, 403);

  r = await sub({ headers: NOBODY, body: SUB });
  is("no token and no Origin (curl) is refused with 401, nothing sent", [r.status, r.calls.length], [401, 0]);
  ok("  saying how to authenticate", /^Bearer realm=/.test(r.h("www-authenticate") || ""), r.h("www-authenticate"));

  r = await sub({ headers: { "content-type": "text/plain" }, body: JSON.stringify(SUB) });
  is("text/plain is refused with 415", r.status, 415);

  r = await sub({ body: "{not json" });
  is("malformed JSON is a 400, not a crash", r.status, 400);

  r = await sub({ body: ["a@b.co"] });
  is("a JSON array body is a 400", r.status, 400);

  r = await sub({ body: "null" });
  is("a JSON null body is a 400", r.status, 400);

  r = await sub({});
  is("an empty body is a 400", r.status, 400);
});

group("callers — site tokens and Origins", async () => {
  let r = await sub({ body: SUB, answer: [NO_CONTACT] });
  is("RBM's server with its token: subscribed", [r.status, r.json], [200, { ok: true, status: "subscribed" }]);
  ok("  and the team hears it came from RBM", r.calls[3].body.text.includes("Signed up on: " + RBM.name));
  is("  a server needs no CORS header", r.h("access-control-allow-origin"), null);
  is("  every answer varies by Origin", r.h("vary"), "Origin");

  r = await sub({ headers: { authorization: "Bearer " + LOCAL_TOKEN }, body: SUB, answer: [NO_CONTACT] });
  ok("the local test server's token: recognised as that site", r.status === 200 && r.calls[3].body.text.includes("Signed up on: " + LOCAL.name));

  r = await sub({ headers: { authorization: "Bearer wrong-token-0123456789abcdef0123456789" }, body: SUB });
  is("a wrong token: 401, nothing sent", [r.status, r.calls.length], [401, 0]);
  ok("  saying how to authenticate", /^Bearer realm=/.test(r.h("www-authenticate") || ""), r.h("www-authenticate"));
  r = await sub({ headers: { authorization: "Basic " + RBM_TOKEN }, body: SUB });
  is("the right token in the wrong scheme: 401", r.status, 401);
  r = await sub({ headers: { authorization: "" }, body: SUB });
  is("an empty Authorization header: 401", r.status, 401);
  r = await sub({ headers: { authorization: "Bearer " + RBM_TOKEN.slice(0, -1) }, body: SUB });
  is("one character short: 401", r.status, 401);

  r = await sub({ env: env({ RBM_FORMS_TOKEN: "short-token" }), headers: { authorization: "Bearer short-token" }, body: SUB });
  is("a token under 32 characters in the settings counts as not set: 401", [r.status, r.calls.length], [401, 0]);
  r = await sub({ env: env({ RBM_FORMS_TOKEN: "" }), headers: { authorization: "Bearer " }, body: SUB });
  is("no token set and none sent: 401", r.status, 401);
  r = await sub({ env: env({ RBM_FORMS_TOKEN: undefined }), body: SUB });
  is("RBM's token removed from the settings: RBM's server is turned away", r.status, 401);

  r = await sub({ headers: { origin: "https://evil.example" }, body: SUB, answer: [NO_CONTACT] });
  is("a good token wins over an unknown Origin (a server's Origin means nothing), with no CORS header",
     [r.status, r.h("access-control-allow-origin")], [200, null]);
  r = await sub({ headers: { authorization: "Bearer wrong-token-0123456789abcdef0123456789", origin: LAUNCH.origin }, body: SUB });
  is("a wrong token is refused even from a known site's Origin", r.status, 401);

  const PREFLIGHT = { "access-control-request-method": "POST", "access-control-request-headers": "content-type" };
  r = await sub({ method: "OPTIONS", headers: { ...page(LAUNCH.origin), ...PREFLIGHT } });
  is("a known site's preflight: 204, allowing POST with Content-Type, for that origin only",
     [r.status, r.h("access-control-allow-origin"), r.h("access-control-allow-methods"), r.h("access-control-allow-headers"), r.h("access-control-max-age")],
     [204, LAUNCH.origin, "POST", "Content-Type", "600"]);
  is("  and nothing reaches Resend", r.calls.length, 0);
  r = await sub({ method: "OPTIONS", headers: { ...page("https://evil.example"), ...PREFLIGHT } });
  is("anyone else's preflight: 405, and no CORS headers, so the browser blocks the post",
     [r.status, r.h("access-control-allow-origin")], [405, null]);

  r = await sub({ headers: page(LAUNCH.origin), body: SUB, addr: SEG, answer: [NO_CONTACT] });
  is("a site's page subscribes, and may read the answer",
     [r.status, r.json, r.h("access-control-allow-origin"), r.h("vary")], [200, { ok: true, status: "subscribed" }, LAUNCH.origin, "Origin"]);
  r = await sub({ headers: page(LAUNCH.origin), body: { ...NAMES, email: "nope" } });
  is("a site's failed request is readable too, so its page can show the failure", [r.status, r.h("access-control-allow-origin")], [400, LAUNCH.origin]);
  r = await fb({ headers: page(LAUNCH.origin), body: REPORT });
  is("a site's feedback goes through, readable by its page", [r.status, r.json && r.json.ok, r.h("access-control-allow-origin")], [200, true, LAUNCH.origin]);
  r = await sub({ headers: page(LOCAL.origin), body: SUB, answer: [NO_CONTACT] });
  is("the React version on this computer (http://localhost:3000) is a known page", [r.status, r.h("access-control-allow-origin")], [200, LOCAL.origin]);

  for (const other of ["https://evil.example", LAUNCH.origin + ".evil.example", LAUNCH.origin.replace("https:", "http:"),
                       LAUNCH.origin + "/x", "http://localhost:3001", "null"]) {
    r = await sub({ headers: page(other), body: SUB });
    is(`not a known site: ${other} → 403, no CORS header, nothing sent`, [r.status, r.h("access-control-allow-origin"), r.calls.length], [403, null, 0]);
  }
});

group("configuration", async () => {
  let r = await sub({ env: { UNSUBSCRIBE_SECRET: SECRET, RBM_FORMS_TOKEN: RBM_TOKEN }, body: SUB });
  is("no RESEND_API_KEY → 503", r.status, 503);
  is("  and nothing reaches Resend", r.calls.length, 0);
  ok("  and the log names every setting that is missing",
     r.logs.some(l => l.startsWith("[subscribe] not configured") && ["RESEND_API_KEY", "TEAM_INBOX", "FORMS_BASE_URL"].every(n => l.includes(n)) && !l.includes("UNSUBSCRIBE_SECRET")), JSON.stringify(r.logs));

  r = await sub({ env: env({ UNSUBSCRIBE_SECRET: "too-short-secret-value" }), body: SUB });
  is("an UNSUBSCRIBE_SECRET under 32 characters → 503", r.status, 503);
  ok("  the log names it, never its value, nor any other secret",
     r.logs.length === 1 && r.logs[0].includes("UNSUBSCRIBE_SECRET") && ![ "too-short-secret-value", "re_test_key", RBM_TOKEN, "team@example.org"].some(v => r.logs[0].includes(v)), JSON.stringify(r.logs));
  r = await sub({ env: env({ UNSUBSCRIBE_SECRET: undefined }), body: SUB });
  is("no UNSUBSCRIBE_SECRET → 503", r.status, 503);
  r = await sub({ env: env({ TEAM_INBOX: " , " }), body: SUB });
  is("no TEAM_INBOX (blanks only) → 503", r.status, 503);
  r = await sub({ env: env({ FORMS_BASE_URL: undefined }), body: SUB });
  is("no FORMS_BASE_URL → 503", r.status, 503);
  r = await sub({ headers: page(LAUNCH.origin), env: env({ RESEND_API_KEY: "" }), body: SUB });
  is("a site's page can read the 503", [r.status, r.h("access-control-allow-origin")], [503, LAUNCH.origin]);

  r = await sub({ env: env({ TEAM_INBOX: " one@example.org , two@example.org,," }), body: SUB, answer: [NO_CONTACT] });
  is("TEAM_INBOX is a list, comma-separated, trimmed, blanks dropped", r.calls[3] && r.calls[3].body.to, ["one@example.org", "two@example.org"]);

  r = await sub({ body: SUB, answer: [NO_CONTACT] });
  is("ADDRESSES.from empty → Resend's test sender", r.calls[2].body.from, "LAUNCH dashboard <onboarding@resend.dev>");
  r = await sub({ addr: { ...ADDR, from: "LAUNCH <updates@unitaid.example>" }, body: SUB, answer: [NO_CONTACT] });
  is("ADDRESSES.from overrides it", r.calls[2].body.from, "LAUNCH <updates@unitaid.example>");

  // FORMS_BASE_URL: the address in each welcome's one-click unsubscribe header.
  const header = (rr) => rr.calls[2] && rr.calls[2].body.headers["List-Unsubscribe"];
  r = await sub({ env: env({ FORMS_BASE_URL: BASE + "/" }), body: SUB, answer: [NO_CONTACT] });
  ok("FORMS_BASE_URL: a trailing slash is trimmed", r.status === 200 && header(r).startsWith(`<${BASE}/api/unsubscribe?t=`), header(r));
  r = await sub({ env: env({ FORMS_BASE_URL: "http://localhost:54321/functions/v1" }), body: SUB, answer: [NO_CONTACT] });
  ok("  http://localhost (testing on this computer) is accepted", r.status === 200 && header(r).startsWith("<http://localhost:54321/functions/v1/api/unsubscribe?t="), header(r));
  r = await sub({ env: env({ FORMS_BASE_URL: "http://127.0.0.1:54321/functions/v1" }), body: SUB, answer: [NO_CONTACT] });
  is("  and so is http://127.0.0.1", r.status, 200);
  for (const bad of ["http://forms.example.org/functions/v1", BASE + "?x=1", BASE + "#top", "https://user@forms.example.org/functions/v1",
                     "not a url", "ftp://forms.example.org", "javascript:alert(1)"]) {
    r = await sub({ env: env({ FORMS_BASE_URL: bad }), body: SUB });
    is(`  ${bad} → not configured (503), nothing sent`, [r.status, r.calls.length], [503, 0]);
  }

  r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + await token("unsubscribe", "reader@example.org", "rbm"), env: { RESEND_API_KEY: "re_x" } });
  is("not configured, an unsubscribe link still sends the reader on to LAUNCH's page", [r.status, r.h("location") && r.h("location").split("?")[0]], [303, LAUNCH.unsubscribePage]);
  r = await uns({ body: { t: await token("unsubscribe") }, env: env({ TEAM_INBOX: "" }) });
  is("  and its button's POST gets 503", r.status, 503);
});

group("the addresses and sites as committed", async () => {
  const from = /^[^<>]+ <([^<>\s]+)>$/.exec(SHIPPED.from);
  ok("ADDRESSES.from is empty or \"Name <address>\"", SHIPPED.from === "" || !!from, SHIPPED.from);
  ok("  and its address passes the email check", !from || mail.EMAIL_RE.test(from[1]));
  ok("ADDRESSES.segment is empty or a Resend segment id", SHIPPED.segment === "" ||
     /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(SHIPPED.segment), SHIPPED.segment);
  is("the sender and segment are api/_mail.js's (the update email sends from there)", [SHIPPED.from, SHIPPED.segment], [old.ADDRESSES.from, old.ADDRESSES.segment]);
  // The team inbox is a secret (TEAM_INBOX): both repos are public.
  const src = fs.readdirSync(path.join(here, "..", "supabase", "functions", "_shared"))
    .map(f => fs.readFileSync(path.join(here, "..", "supabase", "functions", "_shared", f), "utf8")).join("\n");
  const addresses = (src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).filter(a => !/^(updates@tamarind\.tech|onboarding@resend\.dev)$/.test(a));
  is("no inbox address is written in the service's code, only the sender's", addresses, []);

  const ids = mail.SITES.map(s => s.id);
  ok("every site has its own id", new Set(ids).size === ids.length, JSON.stringify(ids));
  ok("  a name and a dashboard", mail.SITES.every(s => typeof s.name === "string" && s.name && typeof s.dashboard === "string"));
  ok("  and a way in: a token setting, an Origin, or both", mail.SITES.every(s => s.tokenSetting || s.origin));
  const isLocal = (u) => /^http:\/\/localhost:\d{1,5}(\/|$)/.test(u);
  ok("every Origin is https://host (or http://localhost:port), with no path and no trailing slash",
     mail.SITES.filter(s => s.origin).every(s => /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(s.origin) || /^http:\/\/localhost:\d{1,5}$/.test(s.origin)), JSON.stringify(mail.SITES.map(s => s.origin)));
  ok("  and a site with an Origin has its dashboard on that origin",
     mail.SITES.filter(s => s.origin).every(s => s.dashboard.startsWith(s.origin + "/")));
  ok("every dashboard and unsubscribe page is https (or http://localhost)",
     mail.SITES.flatMap(s => [s.dashboard, s.unsubscribePage].filter(Boolean)).every(u => u.startsWith("https://") || isLocal(u)));
  const settings = mail.SITES.map(s => s.tokenSetting).filter(Boolean);
  ok("every token setting is named …_FORMS_TOKEN, and none is shared", settings.every(n => /^[A-Z][A-Z_]*_FORMS_TOKEN$/.test(n)) && new Set(settings).size === settings.length, JSON.stringify(settings));
  ok("the default site exists, with an unsubscribe page", !!mail.siteById(mail.DEFAULT_SITE) && !!mail.siteById(mail.DEFAULT_SITE).unsubscribePage);
  is("a site with no page of its own sends readers to the default's", mail.unsubscribePageOf(PAGES), LAUNCH.unsubscribePage);
});

group("links in emails", async () => {
  const t = await token("unsubscribe");
  is("an unsubscribe link reads back to its address, naming no site", await read(t), { email: "reader@example.org", site: null });
  is("  one made for a site names that site", await read(await token("unsubscribe", "reader@example.org", "rbm")), { email: "reader@example.org", site: "rbm" });
  ok("  and the address cannot be read out of it", !b64url(t).toString("latin1").includes("reader"), t);
  ok("  two links for one address differ", t !== await token("unsubscribe"));
  is("  it never expires: one made 400 days ago still works", await read(await token("unsubscribe", "reader@example.org", null, Date.now() - 400 * DAY)), { email: "reader@example.org", site: null });
  is("a confirm link, as emailed before 6 Oct, is no good as an unsubscribe link", await read(await token("confirm")), null);
  is("another secret cannot read it", await read(t, "unsubscribe", "another-secret-0123456789abcdef0123456789"), null);
  const raw = b64url(t); raw[20] ^= 1;
  is("one flipped bit and it is refused", await read(raw.toString("base64url")), null);
  const tag = b64url(t); tag[tag.length - 1] ^= 1;
  is("  in the tag too", await read(tag.toString("base64url")), null);
  is("junk is refused", [await read("abc"), await read("not base64!"), await read("A".repeat(2000)), await read(undefined), await read(""), await read("AAAAA"), await read("A".repeat(41))],
     [null, null, null, null, null, null, null]);
  ok("a feedback reference is LAUNCH- and 8 hex digits, and each is new", /^LAUNCH-[0-9A-F]{8}$/.test(mail.newRef()) && mail.newRef() !== mail.newRef());
});

group("links made on Vercel (api/_mail.js) still work", async () => {
  const vercel = old.makeToken(SECRET, "unsubscribe", "reader@example.org");
  is("a link emailed by api/ reads here, naming no site", await read(vercel), { email: "reader@example.org", site: null });
  is("  a year-old one too", await read(old.makeToken(SECRET, "unsubscribe", "reader@example.org", Date.now() - 400 * DAY)), { email: "reader@example.org", site: null });
  is("  but not with another secret", await read(old.makeToken("another-secret-0123456789abcdef0123456789", "unsubscribe", "reader@example.org")), null);
  is("  and an old confirm link is still no unsubscribe link", await read(old.makeToken(SECRET, "confirm", "reader@example.org")), null);
  is("a link made here reads in api/ (while both run), its site ignored there", old.readToken(SECRET, "unsubscribe", await token("unsubscribe", "reader@example.org", "rbm")), { email: "reader@example.org" });
  is("  but not with another secret", old.readToken("another-secret-0123456789abcdef0123456789", "unsubscribe", await token("unsubscribe")), null);

  let r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + vercel });
  is("opening an old link sends the reader on to LAUNCH's page, with the same token", [r.status, r.h("location"), r.calls.length], [303, `${LAUNCH.unsubscribePage}?t=${vercel}`, 0]);
  r = await uns({ path: "/api/unsubscribe?t=" + vercel, headers: ONE_CLICK, body: "List-Unsubscribe=One-Click" });
  is("an old welcome's one-click unsubscribe works here", [r.status, r.calls.map(c => [pathOf(c), c.body])], [200, [["PATCH /contacts/reader%40example.org", { unsubscribed: true }]]]);
});

group("subscribe — a new address goes straight onto the list", async () => {
  let r = await sub({ body: { ...NAMES, email: "reader@example.org", page: "https://phish.example/x" }, addr: SEG, answer: [NO_CONTACT] });
  is("look up, create, welcome, tell the team", r.calls.map(pathOf),
     ["GET /contacts/reader%40example.org", "POST /contacts", "POST /emails", "POST /emails"]);
  is("  created subscribed, with first and last name, in the segment", r.calls[1].body, { email: "reader@example.org", unsubscribed: false, first_name: "Amina", last_name: "Bello", segments: [{ id: "seg_123" }] });
  is("  the form is told ok: subscribed", [r.status, r.json], [200, { ok: true, status: "subscribed" }]);
  ok("  and no email asks anyone to confirm", !JSON.stringify(r.calls).includes("/api/confirm") && r.calls.every(c => !c.body || !/confirm/i.test(c.body.subject)));
  const welcome = r.calls[2].body, team = r.calls[3].body;
  is("  the welcome goes to the subscriber", [welcome.to, welcome.subject], [["reader@example.org"], "You're subscribed to LAUNCH dashboard updates"]);
  ok("  opening with the owner's sentence", welcome.text.includes("You're now subscribed to the LAUNCH Transparency Dashboard.") && welcome.html.includes("You&#39;re now subscribed to the LAUNCH Transparency Dashboard."));
  const unsub = tokenIn(welcome.text, RBM.unsubscribePage);
  is("  with an unsubscribe link to RBM's own page, for this address and site", unsub && await read(unsub), { email: "reader@example.org", site: "rbm" });
  ok("  in the HTML too", welcome.html.includes(`${RBM.unsubscribePage}?t=${unsub}`));
  ok("  offered to whoever did not sign up, too", welcome.text.includes(`Didn't sign up, or don't want these emails? ${RBM.unsubscribePage}?t=${unsub}`));
  is("  and the mail app's own one-click unsubscribe, at this service", welcome.headers,
     { "List-Unsubscribe": `<${BASE}/api/unsubscribe?t=${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  is("  a reply to the welcome reaches the team", welcome.reply_to, ["team@example.org"]);
  ok("  and a link to RBM's dashboard", welcome.html.includes(`href="${RBM.dashboard}"`) && welcome.text.includes(RBM.dashboard));
  ok("  and never the page address the visitor sent", !JSON.stringify(r.calls).includes("phish.example"));
  ok("  nor the service's own address in the body", !welcome.html.includes(HOST) && !welcome.text.includes(HOST));
  is("  the team is told", team.to, ["team@example.org"]);
  ok("  who, from where, and that it is not a returning subscriber", team.text.includes("Email address: reader@example.org") && team.text.includes("Subscriber: New") &&
     team.text.includes("Mailing list: " + mail.SEGMENT_NAME) && team.text.includes(`Signed up on: ${RBM.name} (${RBM.dashboard})`));

  r = await sub({ headers: page(LAUNCH.origin), body: SUB, answer: [NO_CONTACT] });
  ok("from LAUNCH's page: its unsubscribe page and its dashboard", tokenIn(r.calls[2].body.text, LAUNCH.unsubscribePage) && r.calls[2].body.html.includes(`href="${LAUNCH.dashboard}"`));
  r = await sub({ headers: page(PAGES.origin), body: SUB, answer: [NO_CONTACT] });
  const pagesLink = tokenIn(r.calls[2].body.text, LAUNCH.unsubscribePage);
  ok("from the GitHub Pages copy, which has no page of its own: LAUNCH's unsubscribe page, its own dashboard",
     pagesLink && r.calls[2].body.html.includes(`href="${PAGES.dashboard}"`));
  is("  the link still names the site it came from", pagesLink && (await read(pagesLink)).site, "rbm-pages");
  r = await sub({ headers: { authorization: "Bearer " + LOCAL_TOKEN }, body: SUB, answer: [NO_CONTACT] });
  ok("from the local test server: its own pages", !!tokenIn(r.calls[2].body.text, LOCAL.unsubscribePage) && r.calls[2].body.html.includes(`href="${LOCAL.dashboard}"`));

  r = await sub({ body: { ...NAMES, email: "nope" } });
  is("a malformed address is a 400", r.status, 400);
  is("  and nothing reaches Resend", r.calls.length, 0);
  r = await sub({ body: { ...NAMES, email: "a@b.co\r\nBcc: victim@example.org" } });
  is("an address with a smuggled header line is refused", r.status, 400);
  r = await sub({ body: { ...NAMES, email: 12345 } });
  is("a non-string address is a 400, not a crash", r.status, 400);
});

group("subscribe — first and last name required, organisation optional", async () => {
  for (const [label, body] of [["no first name", { lastName: "Bello", email: "a@example.org" }], ["no last name", { firstName: "Amina", email: "a@example.org" }],
                               ["names of spaces only", { firstName: "  ", lastName: "\t", email: "a@example.org" }], ["names not strings", { firstName: 1, lastName: {}, email: "a@example.org" }]]) {
    const r = await sub({ body });
    is(`${label}: a 400 asking for both names, and nothing reaches Resend`, [r.status, r.json.error, r.calls.length], [400, "Please enter your first and last name.", 0]);
  }
  let r = await sub({ body: { ...SUB, organisation: "Ministry of Health, Nigeria" }, addr: SEG, answer: [NO_CONTACT] });
  is("an organisation is saved on the contact as the custom property", r.calls[1].body.properties, { [mail.ORG_PROPERTY]: "Ministry of Health, Nigeria" });
  ok("  and the team note shows it, with nothing to do", r.calls[3].body.text.includes("Organisation: Ministry of Health, Nigeria") && r.calls[3].body.text.includes("Nothing to do"));
  r = await sub({ body: SUB, addr: SEG, answer: [NO_CONTACT] });
  ok("no organisation: no properties sent, and \"Not given\" in grey", !("properties" in r.calls[1].body) && r.calls[3].body.html.includes('color:#6b7780">Not given'));

  // Resend refuses the whole call for a property not defined in the account
  const NO_PROP = { status: 422, body: { name: "validation_error", message: "Property organisation does not exist" } };
  r = await sub({ body: { ...SUB, organisation: "MoH Nigeria" }, addr: SEG, answer: [NO_CONTACT, NO_PROP] });
  is("the property not defined in Resend: saved again without it, so subscribing still works",
     [r.status, r.json, r.calls.map(pathOf).slice(0, 3), r.calls[2].body.properties, r.calls[2].body.first_name], [200, { ok: true, status: "subscribed" }, ["GET /contacts/reader%40example.org", "POST /contacts", "POST /contacts"], undefined, "Amina"]);
  const note = r.calls[4].body;
  ok("  the team note says what to do, and shows the organisation in the warning colour", note.text.includes('To do: create the contact property "organisation" in Resend') && note.html.includes('color:#b42318;font-weight:bold">MoH Nigeria'));
  ok("  and the log says the organisation was not saved", r.logs.some(l => l.includes("save organisation failed")));
  r = await sub({ body: { ...SUB, organisation: "MoH Nigeria" }, addr: SEG, answer: [UNSUBSCRIBED, NO_PROP] });
  is("  the same for a returning subscriber: the update is retried without it", [r.status, r.calls.map(pathOf).slice(1, 3), r.calls[2].body], [200, ["PATCH /contacts/reader%40example.org", "PATCH /contacts/reader%40example.org"], { unsubscribed: false, first_name: "Amina", last_name: "Bello" }]);
  r = await sub({ body: { ...SUB, organisation: "MoH Nigeria" }, answer: [NO_CONTACT, { status: 500, body: { name: "application_error" } }] });
  is("  but Resend failing for another reason is not retried: a 502", [r.status, r.calls.length], [502, 2]);
  r = await sub({ body: { ...SUB, organisation: "MoH Nigeria" }, addr: SEG, answer: [SUBSCRIBED] });
  is("already subscribed: the stored names and organisation are left alone", r.calls.map(pathOf), ["GET /contacts/reader%40example.org", "POST /contacts/reader%40example.org/segments/seg_123"]);
});

group("subscribe — returning, already subscribed, and failures", async () => {
  let r = await sub({ body: SUB, addr: SEG, answer: [UNSUBSCRIBED] });
  is("an address that had unsubscribed: re-subscribed, into the segment, welcomed", r.calls.map(pathOf),
     ["GET /contacts/reader%40example.org", "PATCH /contacts/reader%40example.org", "POST /contacts/reader%40example.org/segments/seg_123", "POST /emails", "POST /emails"]);
  is("  the update re-subscribes and sets the names", r.calls[1].body, { unsubscribed: false, first_name: "Amina", last_name: "Bello" });
  is("  and the form is told: subscribed", r.json, { ok: true, status: "subscribed" });
  ok("  and the team hears it is a returning subscriber", r.calls[4].body.text.includes("Subscriber: Returning"));

  const fresh = await sub({ body: SUB, addr: SEG, answer: [NO_CONTACT] });
  r = await sub({ body: SUB, addr: SEG, answer: [SUBSCRIBED] });
  is("already subscribed: made sure of the segment, and nothing sent", r.calls.map(pathOf),
     ["GET /contacts/reader%40example.org", "POST /contacts/reader%40example.org/segments/seg_123"]);
  is("  and the form is told so, to show its own message (the owner's decision, 8 Oct)", [r.status, r.json, fresh.json], [200, { ok: true, status: "already" }, { ok: true, status: "subscribed" }]);

  r = await sub({ body: SUB, addr: SEG, answer: [SUBSCRIBED, { status: 500, body: { name: "application_error" } }] });
  is("  a segment failure is not shown to them", [r.status, r.json], [200, { ok: true, status: "already" }]);
  ok("  but it is logged", r.logs.some(l => l.includes("add to segment failed")));
  r = await sub({ body: SUB, addr: SEG, answer: [SUBSCRIBED, { status: 409, body: { name: "conflict" } }] });
  is("  already in the segment (409) is fine, and not logged", [r.status, r.logs.some(l => l.includes("failed"))], [200, false]);

  r = await sub({ body: SUB, addr: SEG, answer: [UNSUBSCRIBED, { status: 200, body: {} }, { status: 500, body: {} }] });
  ok("a returning subscriber outside the segment: the team note says to add them by hand", r.calls[4] && r.calls[4].body.text.includes("Not added") && r.calls[4].body.text.includes("by hand in Resend (segment seg_123)") && r.calls[4].body.text.includes("To do:"));

  r = await sub({ body: SUB, answer: [{ status: 422, body: { name: "validation_error" } }] });
  is("a lookup answering some other 4xx is taken as 'no such contact'", r.calls.map(pathOf).slice(0, 2), ["GET /contacts/reader%40example.org", "POST /contacts"]);

  r = await sub({ body: SUB, answer: [{ status: 401, body: { name: "restricted_api_key" } }] });
  is("a sending-only key: the form is told it failed, nothing else happens", [r.status, r.json.ok, r.calls.length], [502, false, 1]);
  ok("  and the log says why", r.logs.some(l => l.includes("restricted_api_key")));
  r = await sub({ body: SUB, answer: [{ status: 429, body: { name: "rate_limit_exceeded" } }] });
  is("Resend's rate limit at the lookup → 502, nothing saved", [r.status, r.calls.length], [502, 1]);

  r = await sub({ body: SUB, answer: [{ status: 500, body: { name: "application_error" } }] });
  is("Resend down at the lookup → 502, nothing saved or sent", [r.status, r.calls.length], [502, 1]);
  ok("  and the log says what failed", r.logs.some(l => l.includes("look up contact failed")));
  r = await sub({ body: SUB, answer: [{ throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) }] });
  is("a network failure or timeout at the lookup → 502, not a crash", r.status, 502);

  r = await sub({ body: SUB, answer: [NO_CONTACT, { status: 500, body: { name: "application_error" } }] });
  is("the create failing: 502, and no welcome or team note", [r.status, r.calls.length], [502, 2]);
  r = await sub({ body: SUB, answer: [UNSUBSCRIBED, { status: 500, body: { name: "application_error" } }] });
  is("the re-subscribe failing: 502, and no welcome or team note", [r.status, r.calls.length], [502, 2]);

  r = await sub({ body: SUB, answer: [NO_CONTACT, { status: 201, body: {} }, { status: 500, body: {} }] });
  is("the welcome failing does not undo the subscription", [r.status, r.json, r.calls.length], [200, { ok: true, status: "subscribed" }, 4]);
  ok("  but it is logged", r.logs.some(l => l.includes("send welcome failed")));

  r = await sub({ body: SUB, answer: [NO_CONTACT, { status: 201, body: {} }, { status: 200, body: {} }, { status: 500, body: {} }] });
  is("the team's note failing does not either", [r.status, r.json], [200, { ok: true, status: "subscribed" }]);
  ok("  but it is logged", r.logs.some(l => l.includes("notify team failed")) && r.logs.some(l => l.includes("team NOT notified")));
});

group("the team's emails, laid out as a form", async () => {
  is("a time reads as a person would write it", mail.when(new Date(Date.UTC(2026, 9, 7, 15, 48, 57))), "7 Oct 2026, 15:48 UTC");
  is("  with leading zeros where a clock has them", mail.when(new Date(Date.UTC(2026, 0, 3, 4, 5))), "3 Jan 2026, 04:05 UTC");

  let r = await sub({ body: SUB, addr: SEG, answer: [NO_CONTACT] });
  const team = r.calls[3].body;
  ok("the subscriber note: a plain form, titled, saying who and that nothing is to do", team.html.includes(">New subscriber<") && team.text.includes("Amina Bello subscribed") && team.html.includes("Nothing to do"));
  ok("  the details as a bordered two-column table, eight rows", (team.html.match(/<td width="34%"/g) || []).length === 8 && team.html.includes("border:1px solid #d5dde2"));
  ok("  first name, last name, address and organisation come first", /First name: Amina\nLast name: Bello\nEmail address: reader@example.org\nOrganisation: Not given/.test(team.text));
  // The logo travels inside the email (an attachment shown with cid:), so
  // Outlook has nothing to block.
  const logo = `<img src="cid:${mail.LOGO_CID}" width="120" height="42" alt="Unitaid"`;
  const png = fs.readFileSync(path.join(here, "..", "assets", "email", "unitaid-logo.png")).toString("base64");
  const attached = (b) => Array.isArray(b.attachments) && b.attachments.length === 1 &&
    b.attachments[0].content_id === mail.LOGO_CID && b.attachments[0].content_type === "image/png" &&
    b.attachments[0].filename === "unitaid-logo.png" && b.attachments[0].content === png;
  ok("  the welcome: in the shared frame, with the Unitaid logo attached and shown inline, and \"Powered by Unitaid\"",
     r.calls[2].body.html.includes(logo) && attached(r.calls[2].body) && !/\.svg|https?:\/\/[^"]*unitaid-logo/.test(r.calls[2].body.html) && r.calls[2].body.html.includes("Powered by Unitaid"));
  ok("  the team note: no logo, no frame, nothing attached (the owner's \"just a form\")", !team.html.includes("<img") && !team.html.includes("Powered by") && !("attachments" in team));
  r = await fb({ body: REPORT });
  ok("  the feedback note: the same plain form", !r.calls[0].body.html.includes("<img") && !("attachments" in r.calls[0].body) && r.calls[0].body.html.includes("border:1px solid #d5dde2"));
  ok("  the inline logo is the PNG, byte for byte", LOGO_PNG_BASE64 === png);
  ok("  no email uses the font: shorthand, which Outlook ignores", [team.html, r.calls[0].body.html, mail.letter({ heading: "H", paras: ["p"], button: { label: "B", href: "https://x.example" } }).html].every(h => !/font:\s*[\d\w]/.test(h)));
  const hosted = mail.letter({ heading: "H", paras: [], button: { label: "B", href: "https://x.example" }, site: "https://launch.example.org", logo: "hosted" });
  ok("  a hosted logo (the broadcast's) loads from the site and attaches nothing", hosted.html.includes(`src="https://launch.example.org${mail.LOGO_PATH}"`) && !("attachments" in hosted));
  const bare = mail.letter({ heading: "H", paras: [], button: { label: "B", href: "https://x.example" }, logo: "hosted" });
  ok("  a hosted logo with no site to load it from: the name stands in", bare.html.includes(">Unitaid</span>") && !bare.html.includes("<img"));
  ok("  a readable time, not an ISO stamp", /Signed up: \d{1,2} [A-Z][a-z]{2} \d{4}, \d\d:\d\d UTC/.test(team.text) && !/\d{4}-\d\d-\d\dT/.test(team.text + team.html));
  ok("  the list by name, not by id", team.text.includes("Mailing list: " + mail.SEGMENT_NAME) && !team.html.includes("seg_123"));
  ok("  the site they signed up on is a link, because this code holds its address", team.html.includes(`href="${RBM.dashboard}"`));
  ok("  the address they typed is not a link", !/href="[^"]*reader@example\.org/.test(team.html));
  ok("  and a footer", team.html.includes("Sent automatically when someone subscribes"));

  r = await sub({ body: SUB, addr: SEG, answer: [UNSUBSCRIBED, { status: 200, body: {} }, { status: 500, body: {} }] });
  ok("a list that failed shows as something to do, in the warning colour", r.calls[4].body.html.includes("color:#b42318;font-weight:bold\">Not added."));

  r = await fb({ body: withReport({ page: { url: "https://phish.example/x" } }) });
  const fbody = r.calls[0].body;
  ok("the feedback note: title, type and medicine, the message in its own box", fbody.html.includes(">New feedback<") && fbody.html.includes("A data point looks wrong · Coartem Baby") && fbody.html.includes("border-left:3px solid #0E5A73") && fbody.html.includes("Tanzania approved this"));
  ok("  the page the visitor reports is shown, never linked", fbody.html.includes("https://phish.example/x") && !fbody.html.includes('href="https://phish.example'));
  ok("  the site it was sent from is a link, from this code", fbody.text.includes(`Sent from: ${RBM.name} (${RBM.dashboard})`) && fbody.html.includes(`href="${RBM.dashboard}"`));
  ok("  the footer says a reply reaches them", fbody.text.includes("Reply to this email to answer them: the reply goes to amina@moh.example."));
  r = await fb({ body: withReport({ email: null, name: null }) });
  ok("  with no address: says it cannot be answered, in the warning colour", r.calls[0].body.html.includes("color:#b42318;font-weight:bold\">Not given, so this cannot be answered") && r.calls[0].body.text.includes("They left no email address"));
});

group("feedback — request guard and configuration", async () => {
  // The guard is mail.mjs's, tested in full above through subscribe; these
  // check feedback goes through it at all.
  let r = await fb({ method: "GET" });
  is("GET is refused with 405", r.status, 405);
  r = await fb({ headers: page("https://evil.example"), body: REPORT });
  is("another site's Origin is refused with 403", [r.status, r.calls.length], [403, 0]);
  r = await fb({ headers: NOBODY, body: REPORT });
  is("no token and no Origin is refused with 401", [r.status, r.calls.length], [401, 0]);
  r = await fb({ headers: page(LAUNCH.origin), body: REPORT });
  is("a known site's page is accepted", r.status, 200);
  r = await fb({ headers: { "content-type": "text/plain" }, body: JSON.stringify(REPORT) });
  is("text/plain is refused with 415", r.status, 415);
  r = await fb({ body: "{" });
  is("malformed JSON is a 400, not a crash", r.status, 400);

  r = await fb({ env: env({ RESEND_API_KEY: undefined }), body: REPORT });
  is("no RESEND_API_KEY → 503", [r.status, r.calls.length], [503, 0]);
  ok("  and the log names what is needed", r.logs.some(l => l.startsWith("[feedback] not configured") && l.includes("RESEND_API_KEY")));
  r = await fb({ env: env({ UNSUBSCRIBE_SECRET: undefined }), body: REPORT });
  is("no UNSUBSCRIBE_SECRET → 503 too: one switch-on list for every form", r.status, 503);
  r = await fb({ env: env({ TEAM_INBOX: "" }), body: REPORT });
  is("no TEAM_INBOX → 503", r.status, 503);
  r = await fb({ env: env({ FORMS_BASE_URL: "" }), body: REPORT });
  is("no FORMS_BASE_URL → 503", r.status, 503);
});

group("feedback — the team's email", async () => {
  let r = await fb({ body: REPORT });
  is("a valid report is a 200", r.status, 200);
  ok("  answering ok with a LAUNCH-XXXXXXXX reference", r.json && r.json.ok === true && /^LAUNCH-[0-9A-F]{8}$/.test(r.json.ref), JSON.stringify(r.json));
  is("  in exactly one call to Resend", r.calls.length, 1);
  const c = r.calls[0];
  is("  to the send-email endpoint", pathOf(c), "POST /emails");
  is("  authorised with the key", c.auth, "Bearer re_test_key");
  is("  addressed to TEAM_INBOX", c.body.to, ["team@example.org"]);
  is("  from ADDRESSES.from (here the test sender)", c.body.from, "LAUNCH dashboard <onboarding@resend.dev>");
  is("  with Reply-To set to the visitor", c.body.reply_to, "amina@moh.example");
  ok("  subject carries type, medicine and the same reference",
     c.body.subject === `[LAUNCH feedback] A data point looks wrong — Coartem Baby (${r.json.ref})`, c.body.subject);
  ok("  text body carries the message", c.body.text.includes(REPORT.message));
  ok("  and the page it came from", c.body.text.includes("Page: " + REPORT.page.url));
  ok("  and the data version the visitor saw", c.body.text.includes("Data version: 2026-09-20 · draft"));
  is("  and is tagged for filtering in Resend", c.body.tags, [{ name: "form", value: "feedback" }]);
  const r2 = await fb({ body: REPORT });
  ok("two reports get different references", r2.json.ref !== r.json.ref);
  r = await fb({ headers: page(LAUNCH.origin), body: REPORT });
  ok("from LAUNCH's page, the note says so", r.calls[0].body.text.includes(`Sent from: ${LAUNCH.name} (${LAUNCH.dashboard})`));

  r = await fb({ body: withReport({ email: null }) });
  is("no email given → no reply_to at all", "reply_to" in r.calls[0].body, false);
  ok("  and the team is told it cannot be answered", r.calls[0].body.text.includes("cannot be answered"));

  r = await fb({ body: withReport({ message: "too short" }) });
  is("a message under 10 characters is a 400", [r.status, r.calls.length], [400, 0]);
  r = await fb({ body: withReport({ message: "          x         " }) });
  is("padding does not count towards the 10", r.status, 400);
  r = await fb({ body: withReport({ message: "x".repeat(5000) }) });
  is("a long message is capped at the form's 2000", (r.calls[0].body.text.split("\n").find(l => /^x+$/.test(l)) || "").length, 2000);
  r = await fb({ body: withReport({ message: "Line one of it\r\nline two" }) });
  ok("line breaks in the message survive, as \\n", r.calls[0].body.text.includes("Line one of it\nline two"));
  r = await fb({ body: withReport({ email: "not-an-address" }) });
  is("a malformed email is a 400", [r.status, r.calls.length], [400, 0]);

  r = await fb({ body: withReport({ type: "__proto__" }) });
  ok("an unknown type falls back to 'Something else'", r.status === 200 && r.calls[0].body.subject.includes("Something else"));
  r = await fb({ body: withReport({ productName: null }) });
  ok("no medicine → 'General'", r.calls[0].body.subject.includes("General — the dashboard as a whole"));
  r = await fb({ body: withReport({ productName: "X\r\nBcc: victim@example.org" }) });
  ok("CR/LF typed into a field cannot break the subject line", !/[\r\n]/.test(r.calls[0].body.subject), JSON.stringify(r.calls[0].body.subject));
  r = await fb({ body: withReport({ message: '<script>alert(1)</script> <a href="https://phish.example">click</a>' }) });
  const html = r.calls[0].body.html;
  ok("HTML in the message is escaped, not rendered", html.includes("&lt;script&gt;") && !html.includes("<script>"));
  ok("  and no visitor URL becomes a link", !html.includes('href="https://phish.example"'));
  r = await fb({ body: withReport({ page: "a string", data: 7, name: 42, userAgent: {} }) });
  is("wrong-typed optional fields are ignored, not fatal", r.status, 200);

  r = await fb({ body: REPORT, answer: [{ status: 403, body: { name: "validation_error", message: "You can only send testing emails to your own email address" } }] });
  is("Resend refusing is a 502 to the form", r.status, 502);
  is("  answering ok:false, which the form shows as its failure message", r.json.ok, false);
  ok("  and Resend's reason is in the log", r.logs.some(l => l.includes("HTTP 403 validation_error You can only send testing")));
  r = await fb({ body: REPORT, answer: [{ throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) }] });
  is("a network failure or timeout is a 502, not a crash", r.status, 502);
});

group("unsubscribe — opening the link sends the reader on to their site's page", async () => {
  const t = await token("unsubscribe", "reader@example.org", "rbm");
  let r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + t, headers: { "content-type": undefined, authorization: undefined } });
  is("GET: a 303 to RBM's page with the same token, and nothing changes", [r.status, r.h("location"), r.calls.length], [303, `${RBM.unsubscribePage}?t=${t}`, 0]);
  is("  never cached, and no Referer to pass the token on", [r.h("cache-control"), r.h("referrer-policy")], ["no-store", "no-referrer"]);
  is("  and no page in the body (Supabase would serve it as plain text)", r.raw, "");
  r = await uns({ method: "HEAD", path: "/api/unsubscribe?t=" + t, headers: { authorization: undefined } });
  is("HEAD (a mail scanner checking the link): the same, nothing changes", [r.status, r.h("location"), r.calls.length], [303, `${RBM.unsubscribePage}?t=${t}`, 0]);
  r = await uns({ method: "GET", path: "/functions/v1/api/unsubscribe?t=" + t, headers: { authorization: undefined } });
  is("  through Supabase's full path too", [r.status, r.h("location")], [303, `${RBM.unsubscribePage}?t=${t}`]);

  const local = await token("unsubscribe", "reader@example.org", "local");
  r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + local });
  is("a link from the local test server goes to its page", r.h("location"), `${LOCAL.unsubscribePage}?t=${local}`);
  const nosite = await token("unsubscribe");
  r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + nosite });
  is("a link naming no site goes to LAUNCH's page", r.h("location"), `${LAUNCH.unsubscribePage}?t=${nosite}`);
  const pages = await token("unsubscribe", "reader@example.org", "rbm-pages");
  r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + pages });
  is("a link from a site with no page of its own goes to LAUNCH's", r.h("location"), `${LAUNCH.unsubscribePage}?t=${pages}`);
  const gone = await token("unsubscribe", "reader@example.org", "no-such-site");
  r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + gone });
  is("a link naming a site no longer listed goes to LAUNCH's", r.h("location"), `${LAUNCH.unsubscribePage}?t=${gone}`);

  const cut = t.slice(0, -4);
  r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + cut });
  is("a cut-short link still goes to LAUNCH's page, token as given, for the page to report", [r.status, r.h("location"), r.calls.length], [303, `${LAUNCH.unsubscribePage}?t=${cut}`, 0]);
  r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + encodeURIComponent('"><script>x</script>') });
  is("a token with other characters is not passed on", r.h("location"), `${LAUNCH.unsubscribePage}?t=`);
  r = await uns({ method: "GET", path: "/api/unsubscribe" });
  is("no token at all: the same page, empty", [r.status, r.h("location")], [303, `${LAUNCH.unsubscribePage}?t=`]);
  r = await uns({ method: "GET", path: "/api/unsubscribe?t=" + t, env: env({ UNSUBSCRIBE_SECRET: "x" }) });
  is("no secret to read the link: LAUNCH's page", r.h("location"), `${LAUNCH.unsubscribePage}?t=${t}`);

  r = await uns({ method: "PUT", path: "/api/unsubscribe?t=" + t, headers: { "content-type": undefined } });
  is("other methods are refused, naming both that are allowed", [r.status, r.h("allow"), r.calls.length], [405, "GET, POST", 0]);
  r = await uns({ method: "PUT", path: "/api/unsubscribe?t=" + t });
  is("  also when sent as JSON", [r.status, r.h("allow"), r.calls.length], [405, "GET, POST", 0]);
});

group("unsubscribe", async () => {
  const t = await token("unsubscribe", "reader@example.org", "rbm");
  let r = await uns({ body: { t } });
  is("RBM's page, through its server: the contact is marked unsubscribed", r.calls.map(c => [pathOf(c), c.body]), [["PATCH /contacts/reader%40example.org", { unsubscribed: true }]]);
  is("  and the page is told so", [r.status, r.json], [200, { ok: true, status: "unsubscribed" }]);

  r = await uns({ headers: page(LAUNCH.origin), body: { t } });
  is("LAUNCH's page posting directly: done, and it may read the answer", [r.status, r.json && r.json.status, r.h("access-control-allow-origin")], [200, "unsubscribed", LAUNCH.origin]);
  r = await uns({ method: "OPTIONS", headers: { ...page(LAUNCH.origin), "access-control-request-method": "POST" } });
  is("  its preflight: 204 for that origin", [r.status, r.h("access-control-allow-origin")], [204, LAUNCH.origin]);
  r = await uns({ headers: page("https://evil.example"), body: { t } });
  is("JSON from another site is refused", [r.status, r.calls.length], [403, 0]);
  r = await uns({ headers: NOBODY, body: { t } });
  is("JSON with neither token nor Origin is refused", [r.status, r.calls.length], [401, 0]);

  r = await uns({ body: { t }, answer: [NO_CONTACT] });
  is("an address that is not a contact is still 'unsubscribed'", [r.status, r.json], [200, { ok: true, status: "unsubscribed" }]);
  r = await uns({ body: { t }, answer: [{ status: 500, body: { name: "application_error" } }] });
  is("Resend failing: 502, and the page is told it didn't work", [r.status, r.json.ok, /didn't work|could not/i.test(r.json.error)], [502, false, true]);
  ok("  and it is logged", r.logs.some(l => l.includes("unsubscribe contact failed")));
  r = await uns({ body: { t }, answer: [{ throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) }] });
  is("  a timeout too: 502, not a crash", r.status, 502);

  r = await uns({ body: { t: await token("unsubscribe", "reader@example.org", "rbm", Date.now() - 400 * DAY) } });
  is("a link from a year-old email still unsubscribes", r.status, 200);
  r = await uns({ body: { t: await token("confirm") } });
  is("a confirm link from before 6 Oct does not unsubscribe", [r.status, r.calls.length], [400, 0]);
  r = await uns({ body: { t: t.slice(0, -4) } });
  is("a cut-short link: 400, saying the link doesn't work", [r.status, r.calls.length, /doesn't work/.test(r.json.error)], [400, 0, true]);
  r = await uns({ body: {} });
  is("no token in the JSON: 400", [r.status, r.calls.length], [400, 0]);
  r = await uns({ body: { t: 42 } });
  is("a token that is not a string: 400, not a crash", r.status, 400);

  r = await uns({ path: "/api/unsubscribe?t=" + t, headers: ONE_CLICK, body: "List-Unsubscribe=One-Click" });
  is("the mail app's one-click POST (no Origin, token in the URL) works", [r.status, r.calls.map(pathOf)], [200, ["PATCH /contacts/reader%40example.org"]]);
  r = await uns({ path: "/functions/v1/api/unsubscribe?t=" + t, headers: ONE_CLICK, body: "List-Unsubscribe=One-Click" });
  is("  at Supabase's full path too", r.status, 200);
  r = await uns({ path: "/api/unsubscribe?t=" + t, headers: { ...ONE_CLICK, origin: "null" }, body: "List-Unsubscribe=One-Click" });
  is("  with Origin: null, accepted", r.status, 200);
  r = await uns({ path: "/api/unsubscribe?t=" + t, headers: { ...ONE_CLICK, origin: LAUNCH.origin }, body: "List-Unsubscribe=One-Click" });
  is("  from a known site's Origin, accepted", r.status, 200);
  r = await uns({ path: "/api/unsubscribe?t=" + t, headers: { ...ONE_CLICK, origin: "https://evil.example" }, body: "List-Unsubscribe=One-Click" });
  is("  from another site's Origin, refused", [r.status, r.calls.length], [403, 0]);
  r = await uns({ path: "/api/unsubscribe", headers: ONE_CLICK, body: "List-Unsubscribe=One-Click" });
  is("  with no token: 400, nothing changes", [r.status, r.calls.length], [400, 0]);
  r = await uns({ path: "/api/unsubscribe?t=" + t, headers: { "content-type": undefined, authorization: undefined } });
  is("  with no body or content type at all, still the token that counts", r.status, 200);
  r = await uns({ path: "/api/unsubscribe?t=" + t, headers: ONE_CLICK, body: "x".repeat(mail.MAX_BODY + 1) });
  is("  an oversized one-click body: 413, nothing changes", [r.status, r.calls.length], [413, 0]);

  r = await sub({ headers: page("null"), body: SUB });
  is("the subscribe form's JSON endpoint still refuses Origin: null", r.status, 403);
});

group("body size", async () => {
  let r = await sub({ headers: { "content-length": String(mail.MAX_BODY + 1) }, body: SUB });
  is("a declared Content-Length over 32 KB: 413, nothing read or sent", [r.status, r.json, r.calls.length], [413, { ok: false, error: "Too large." }, 0]);
  const over = JSON.stringify({ ...SUB, pad: "x".repeat(mail.MAX_BODY) });
  r = await sub({ body: over });
  is("a body over 32 KB with no Content-Length: 413", [r.status, r.calls.length], [413, 0]);
  const chunk = new TextEncoder().encode("x".repeat(8192));
  let sent = 0;
  const stream = new ReadableStream({ pull(c) { if (sent++ < 6) c.enqueue(chunk); else c.close(); } });
  r = await sub({ body: stream });
  is("  a stream that runs past 32 KB: 413", [r.status, r.calls.length], [413, 0]);
  const exact = (n) => { const base = JSON.stringify({ ...SUB, pad: "" }); return JSON.stringify({ ...SUB, pad: "x".repeat(n - base.length) }); };
  r = await sub({ body: exact(mail.MAX_BODY), answer: [NO_CONTACT] });
  is("exactly 32 KB is accepted", [exact(mail.MAX_BODY).length, r.status], [mail.MAX_BODY, 200]);
  r = await sub({ body: exact(mail.MAX_BODY + 1) });
  is("  one byte more is not", r.status, 413);
  r = await sub({ headers: page(LAUNCH.origin), body: over });
  is("a site's page can read the 413", [r.status, r.h("access-control-allow-origin")], [413, LAUNCH.origin]);
});

group("routing", async () => {
  let r = await call({ path: "/api/subscribe", body: SUB, answer: [NO_CONTACT] });
  is("/api/subscribe reaches subscribe", [r.status, r.json && r.json.status], [200, "subscribed"]);
  r = await call({ path: "/functions/v1/api/subscribe", body: SUB, answer: [NO_CONTACT] });
  is("  and so does Supabase's full path, /functions/v1/api/subscribe", [r.status, r.json && r.json.status], [200, "subscribed"]);
  r = await call({ path: "/api/subscribe/", body: SUB, answer: [NO_CONTACT] });
  is("  and with a trailing slash", r.status, 200);
  r = await call({ path: "/functions/v1/api/feedback", body: REPORT });
  ok("/functions/v1/api/feedback reaches feedback", r.status === 200 && /^LAUNCH-/.test(r.json.ref));
  for (const p of ["/", "/api", "/api/", "/api/nothing", "/api/constructor", "/api/__proto__", "/api/hasOwnProperty", "/api/toString", "/api/subscribe/extra", "/subscribe", "/api/Subscribe"]) {
    r = await call({ path: p, body: SUB });
    is(`${p} → 404, nothing sent`, [r.status, r.json, r.calls.length], [404, { ok: false, error: "Not found." }, 0]);
  }
  ok("  a 404 is never cached", r.h("cache-control") === "no-store");

  // Something throwing inside a form: here, reading the key. The message quotes
  // a visitor's address, as a real error might; only the error's name is logged.
  const boom = new Proxy(ENV, {
    get(t, k) {
      if (k === "RESEND_API_KEY") throw Object.assign(new Error("failed for private.person@example.org"), { name: "BoomError" });
      return t[k];
    }
  });
  r = await sub({ env: boom, body: SUB });
  is("an error thrown inside a form: 500, not a crash", [r.status, r.json], [500, { ok: false, error: "Something went wrong." }]);
  is("  and only the error's name is logged", r.logs, ["[subscribe] unexpected error: BoomError"]);
});

group("the whole journey", async () => {
  let r = await sub({ body: SUB, addr: SEG, answer: [NO_CONTACT] });
  is("subscribe on RBM → on the list at once, and welcomed", [r.status, r.calls.map(pathOf)],
     [200, ["GET /contacts/reader%40example.org", "POST /contacts", "POST /emails", "POST /emails"]]);
  const welcome = r.calls[2].body;
  const link = tokenIn(welcome.text, RBM.unsubscribePage);
  // The page on RBM's site was handed the token; it posts it back, through RBM's server.
  r = await uns({ body: { t: link }, addr: SEG });
  is("  → the link's page posts the token back → unsubscribed", [r.status, r.json, r.calls.map(c => c.body)], [200, { ok: true, status: "unsubscribed" }, [{ unsubscribed: true }]]);
  const header = /^<(.+)>$/.exec(welcome.headers["List-Unsubscribe"])[1];
  const oneClick = new URL(header);
  is("  the one-click address is this service's", oneClick.origin + oneClick.pathname, `${BASE}/api/unsubscribe`);
  r = await uns({ path: oneClick.pathname + oneClick.search, headers: ONE_CLICK, body: "List-Unsubscribe=One-Click", addr: SEG });
  is("  → or the mail app's own button → unsubscribed", [r.status, r.calls.map(c => c.body)], [200, [{ unsubscribed: true }]]);
  r = await uns({ method: "GET", path: oneClick.pathname + oneClick.search, headers: { authorization: undefined } });
  is("  → and a mail app that opens that address instead lands on RBM's page", [r.status, r.h("location")], [303, `${RBM.unsubscribePage}?t=${link}`]);
  r = await sub({ body: SUB, addr: SEG, answer: [UNSUBSCRIBED] });
  is("  → subscribe again → back on the list, with a new welcome", [r.status, r.calls[1].body, r.calls[3] && r.calls[3].body.subject],
     [200, { unsubscribed: false, first_name: "Amina", last_name: "Bello" }, "You're subscribed to LAUNCH dashboard updates"]);
});

group("logs never carry the submission", async () => {
  const who = "private.person@example.org";
  const t = await token("unsubscribe", who, "rbm");
  const runs = [
    await sub({ body: { ...NAMES, email: who }, answer: [NO_CONTACT] }),
    await sub({ body: { ...NAMES, email: who }, answer: [SUBSCRIBED] }),
    await sub({ body: { ...NAMES, email: who }, answer: [NO_CONTACT, { status: 500, body: { name: "application_error", message: "An unexpected error occurred." } }] }),
    await sub({ body: { ...NAMES, email: who }, answer: [NO_CONTACT, { status: 201, body: {} }, { status: 500, body: { name: "application_error" } }] }),
    await uns({ body: { t } }),
    await uns({ body: { t }, answer: [{ status: 500, body: {} }] }),
    await uns({ path: "/api/unsubscribe?t=" + t, headers: ONE_CLICK, body: "List-Unsubscribe=One-Click" })
  ];
  ok("seven runs, success and failure, each logged something", runs.every(r => r.logs.length > 0), JSON.stringify(runs.map(r => r.logs)));
  ok("  and none of it names the address, or a token", runs.every(r => r.logs.every(l => !l.includes("private.person") && !l.includes(t))), JSON.stringify(runs.map(r => r.logs)));

  const text = "UNIQUE-MESSAGE-TEXT-7731";
  let r = await fb({ body: withReport({ message: "Please look at " + text, email: who }) });
  ok("a sent report logs the reference only", r.logs.length === 1 && r.logs[0] === `[feedback] sent ${r.json.ref}`, JSON.stringify(r.logs));
  r = await fb({ body: withReport({ message: "Please look at " + text, email: who }), answer: [{ status: 500, body: { name: "application_error", message: "An unexpected error occurred." } }] });
  ok("a failed report logs neither message nor address",
     r.logs.length > 0 && r.logs.every(l => !l.includes(text) && !l.includes("private.person")), JSON.stringify(r.logs));
  r = await sub({ env: env({ RESEND_API_KEY: "" }), body: { ...NAMES, email: who } });
  ok("not configured: the log names settings, not the visitor", r.logs.length === 1 && !r.logs[0].includes("private.person"), JSON.stringify(r.logs));
});

group("draws every email exactly as api/_mail.js does", async () => {
  // The update email is drawn by api/_mail.js (scripts/notify-subscribers.js);
  // the welcome and the team's notes are drawn here. One family of emails, so
  // the two copies must agree byte for byte.
  const dates = [new Date(Date.UTC(2026, 9, 7, 15, 48, 57)), new Date(Date.UTC(2026, 0, 3, 4, 5)), new Date(Date.UTC(2027, 11, 31, 23, 59))];
  is("when(): the same text for every date", dates.map(d => mail.when(d)), dates.map(d => old.when(d)));

  const tricky = ['A & B <b>"quoted"</b> \'single\'', "Line one\r\nline two\ttab\u0000nul\u0007bell", "  padded  ", "é ü — · ✓", ""];
  is("esc(): the same", tricky.map(mail.esc), tricky.map(old.esc));
  is("line(): the same", tricky.map(s => mail.line(s, 20)), tricky.map(s => old.line(s, 20)));
  is("block(): the same", tricky.map(s => mail.block(s, 30)), tricky.map(s => old.block(s, 30)));
  is("  and for a non-string", [mail.line(7, 5), mail.block(null, 5)], [old.line(7, 5), old.block(null, 5)]);
  is("the same address check, logo name and path, list name and property", [String(mail.EMAIL_RE), mail.LOGO_CID, mail.LOGO_PATH, mail.SEGMENT_NAME, mail.ORG_PROPERTY],
     [String(old.EMAIL_RE), old.LOGO_CID, old.LOGO_PATH, old.SEGMENT_NAME, old.ORG_PROPERTY]);

  const renders = [
    ["New subscriber", "", [["First name", "Amina"], ["Organisation", "Not given", { tone: "muted" }], ["Mailing list", "Not added. <do it>", { tone: "warn" }], ["Signed up on", "RBM", { href: "https://x.example/en?a=1&b=2" }]],
     { intro: "Amina subscribed. To do: \"something\".", footer: "Sent automatically & quietly." }],
    ["New feedback", "<script>alert(1)</script>\nsecond line", [["Reference", "LAUNCH-0A1B2C3D"], ["Page", "https://phish.example/x"], ["Same", "https://x.example", { href: "https://x.example" }]],
     { intro: "A · B", footer: "" }],
    ["Bare", "", [], {}],
    ["Only a message", "Just this.", [["One", ""]], { intro: "", footer: "f" }]
  ];
  for (const [i, args] of renders.entries()) is(`render() #${i + 1}: text and HTML identical`, mail.render(...args), old.render(...args));

  const letters = [
    { heading: "You're subscribed", paras: ["You're now subscribed to the LAUNCH Transparency Dashboard. We'll email you when product information is updated."],
      button: { label: "Open the dashboard", href: "https://dashboards.endmalaria.org/en/unitaid" },
      small: [{ text: "Didn't sign up, or don't want these emails?", link: "https://x.example/u?t=abc_-1", linkLabel: "Unsubscribe" }] },
    { heading: "What changed <today>", paras: ["One & two", "Three"], button: { label: "See it", href: "https://launch.example.org/?a=1&b=\"2\"" },
      small: [{ text: "Plain small print" }, { text: "With a link", link: "https://x.example/l" }], site: "https://launch.example.org", logo: "hosted" },
    { heading: "No site", paras: [], button: { label: "B", href: "https://x.example" }, logo: "hosted" },
    { heading: "No small print", paras: ["p"], button: { label: "B", href: "https://x.example" } }
  ];
  for (const [i, args] of letters.entries()) is(`letter() #${i + 1} (${args.logo || "inline"} logo${args.small ? ", small print" : ""}): identical, attachments included`, mail.letter(args), old.letter(args));
  ok("  the inline ones carry the logo as an attachment in both", mail.letter(letters[0]).attachments.length === 1 && old.letter(letters[0]).attachments.length === 1);

  ok("the inline logo is the same PNG as api/_logo.js", LOGO_PNG_BASE64 === require("../api/_logo.js").LOGO_PNG_BASE64);
});

try {
  for (const run of queue) await run();
} finally {
  Object.assign(mail.ADDRESSES, SHIPPED);
}
console.log(`\n${pass} passed, ${fail} failed.`);
if (fail) {
  console.log("Failed:\n  " + failures.join("\n  "));
  process.exitCode = 1;
}
