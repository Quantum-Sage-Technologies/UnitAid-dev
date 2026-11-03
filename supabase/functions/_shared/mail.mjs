// Shared code for the forms service: the Supabase Edge Function behind the
// dashboard's two forms, "Subscribe for updates" (subscribe.mjs,
// unsubscribe.mjs) and "Send feedback" (feedback.mjs). A port of api/_mail.js,
// which stays where it is: scripts/notify-subscribers.js (the update email)
// still uses it, and scripts/test-forms-service.mjs checks that the two draw
// every email identically.
//
// Web-standard JavaScript only (fetch, Request, Response, crypto.subtle,
// btoa/atob), with no Node or Deno built-ins, so the same files run on
// Supabase (Deno), in the Node tests, and on another host later. Only
// functions/api/index.js knows which host it is on.
//
// Settings arrive as `env`, a plain object the host's wrapper builds. Secrets,
// set with `supabase secrets set` and never in the repo:
//   RESEND_API_KEY      Full access, not "Sending access" — subscribing writes
//                       a contact, which a sending-only key may not do
//   UNSUBSCRIBE_SECRET  32+ random characters. Encrypts the unsubscribe links.
//                       Must be the value api/ uses on Vercel, or every link
//                       already emailed stops working
//   TEAM_INBOX          the team inbox; several separated by commas. A secret
//                       because both repos are public, and an address in them
//                       is collected for spam
//   FORMS_BASE_URL      this service's own address, up to but not including
//                       /api (https://<project>.supabase.co/functions/v1). The
//                       one-click unsubscribe link in each welcome points here
//   …_FORMS_TOKEN       one per server that passes forms on (SITES, below)
// The sender, the segment and the sites are not secret, so they live here,
// where a change to them is reviewed like any other.
//
// See docs/forms-service-notes.md for why it is built this way.

import { LOGO_PNG_BASE64 } from "./logo.mjs";

const RESEND = "https://api.resend.com";

export const ADDRESSES = {
  // Sender, on a domain verified in Resend. Left empty, Resend's shared test
  // sender is used, which only delivers to the Resend account's own address.
  from: "LAUNCH dashboard <updates@tamarind.tech>",
  // Resend segment that subscribers join ("LAUNCH dashboard updates"), so a
  // broadcast can go to exactly them. Optional: without it they are plain
  // contacts.
  segment: "759df0a9-0fe5-4b96-ac7a-581fb77a5edc"
};
const DEFAULT_FROM = "LAUNCH dashboard <onboarding@resend.dev>";
// What the team's emails call the segment, rather than its id.
export const SEGMENT_NAME = "LAUNCH dashboard updates";
// The subscriber's organisation is saved on the Resend contact as this custom
// property. Resend refuses a whole create or update that names a property not
// yet defined in the account (its docs, read 8 Oct 2026), so subscribe.mjs
// retries without it and the team's note says to define it (Audience →
// Properties, key "organisation", type string).
export const ORG_PROPERTY = "organisation";

// Every site whose forms may use this service, and how each is recognised:
//   tokenSetting  the env setting holding the token a site's SERVER sends, as
//                 "Authorization: Bearer …". RBM's pages work this way: the
//                 browser posts to /api/unitaid/… on RBM's own site, and that
//                 route passes the form on (RBM's module rules, 3 Nov 2026)
//   origin        the scheme and host a BROWSER page sends as Origin, for
//                 pages that post here directly. Exact match only: no
//                 prefixes, no wildcards, so a look-alike host is not a site
//   dashboard     where the welcome email's button and the team's note link
//   unsubscribePage  the page the email's unsubscribe link opens. It shows the
//                 "Unsubscribe?" button and posts the link's token back here.
//                 It lives on the site, not here: on Supabase's own address a
//                 page is served as plain text (docs/forms-service-notes.md)
// `name` is what the team's emails call the site. Not secret, so here, where a
// change is reviewed. A site missing here gets 401 or 403 on every form.
// RBM's paths (/en/unitaid…) are assumed from its module folder,
// src/app/[locale]/unitaid/; confirm them with RBM before go-live.
export const SITES = [
  {
    id: "launch",
    name: "LAUNCH dashboard",
    origin: "https://launch-development-test.vercel.app",
    dashboard: "https://launch-development-test.vercel.app/",
    unsubscribePage: "https://launch-development-test.vercel.app/unsubscribe.html"
  },
  {
    id: "rbm",
    name: "Global Malaria Dashboard (RBM)",
    tokenSetting: "RBM_FORMS_TOKEN",
    dashboard: "https://dashboards.endmalaria.org/en/unitaid",
    unsubscribePage: "https://dashboards.endmalaria.org/en/unitaid/unsubscribe"
  },
  {
    id: "rbm-test",
    name: "RBM test site",
    tokenSetting: "RBM_TEST_FORMS_TOKEN",
    dashboard: "https://rbm-testdashboards.ecritportfolio.org/en/unitaid",
    unsubscribePage: "https://rbm-testdashboards.ecritportfolio.org/en/unitaid/unsubscribe"
  },
  // The static RBM test copy, codebyjackson/launch-rbm-test, on GitHub Pages.
  // It has no unsubscribe page of its own, so its readers get LAUNCH's.
  {
    id: "rbm-pages",
    name: "RBM test copy (GitHub Pages)",
    origin: "https://codebyjackson.github.io",
    dashboard: "https://codebyjackson.github.io/launch-rbm-test/en/"
  },
  // A developer's own computer running the React version with `npm run dev`
  // on its default port, so the forms can be tested end to end: from the page
  // directly (Origin), or through its own server routes (the token). Only a
  // page served at exactly this address, on the machine of whoever opens it,
  // sends this Origin. Remove once the React version is tested on RBM's host.
  {
    id: "local",
    name: "Local test of the React version",
    origin: "http://localhost:3000",
    tokenSetting: "LOCAL_FORMS_TOKEN",
    dashboard: "http://localhost:3000/en",
    unsubscribePage: "http://localhost:3000/en/unsubscribe"
  }
];
// The site an unsubscribe link belongs to when it does not say: every link
// emailed by api/ on Vercel, before links carried their site.
export const DEFAULT_SITE = "launch";

// The same test both forms already run in the browser, so an address the page
// accepts is never refused here.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Vercel capped request bodies on its own; this host's cap is far larger, so
// the service sets its own. The largest real form, a 2,000-character report
// with its page details, is a few kilobytes.
export const MAX_BODY = 32 * 1024;

const str = (v) => (typeof v === "string" ? v.trim() : "");

export function config(env) {
  const key = str(env.RESEND_API_KEY);
  const secret = str(env.UNSUBSCRIBE_SECRET);
  const to = str(env.TEAM_INBOX).split(",").map(s => s.trim()).filter(Boolean);
  const base = baseUrl(env.FORMS_BASE_URL);
  if (!key || secret.length < 32 || !to.length || !base) return null;
  return {
    key,
    secret,
    to,
    base,
    from: ADDRESSES.from.trim() || DEFAULT_FROM,
    segment: ADDRESSES.segment.trim() || null
  };
}

// FORMS_BASE_URL with no trailing slash, or null if it is not a plain https
// address (http only for this computer, when testing locally).
function baseUrl(v) {
  let u;
  try { u = new URL(str(v)); } catch (e) { return null; }
  const local = u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
  if ((u.protocol !== "https:" && !local) || u.search || u.hash || u.username) return null;
  return u.origin + u.pathname.replace(/\/+$/, "");
}

// Loud in the logs, because from the outside this looks like any failure.
// Names what is missing, never a value.
export function logNotConfigured(form, env) {
  const missing = [];
  if (!str(env.RESEND_API_KEY)) missing.push("RESEND_API_KEY");
  if (str(env.UNSUBSCRIBE_SECRET).length < 32) missing.push("UNSUBSCRIBE_SECRET (32+ characters)");
  if (!str(env.TEAM_INBOX)) missing.push("TEAM_INBOX");
  if (!baseUrl(env.FORMS_BASE_URL)) missing.push("FORMS_BASE_URL (an https address)");
  console.error(`[${form}] not configured: needs ${missing.join(", ")} in the function's secrets.`);
}

export function notConfigured(form, env, headers) {
  logNotConfigured(form, env);
  return reply(503, { ok: false, error: "Not configured." }, headers);
}

// The answer differs by Origin, so no cache may hand one site's to another.
export function reply(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Origin", ...headers }
  });
}

export function siteById(id) {
  return SITES.find(s => s.id === id) || null;
}

// Where a site's readers confirm an unsubscribe: its own page, or LAUNCH's.
export function unsubscribePageOf(site) {
  return (site && site.unsubscribePage) || siteById(DEFAULT_SITE).unsubscribePage;
}

// ---- who is asking -----------------------------------------------------------

// → { site, via: "token" } for a site's server, { site, via: "origin" } for a
// site's page, { site: null, via: "bad-token" } for a token that matches no
// site, or null for neither. A token too short to be one (under 32
// characters) counts as not set.
export async function callerOf(request, env) {
  const auth = request.headers.get("authorization");
  if (auth !== null) {
    const m = /^Bearer +(\S+) *$/i.exec(auth);
    for (const site of SITES) {
      const want = site.tokenSetting ? str(env[site.tokenSetting]) : "";
      if (m && want.length >= 32 && await sameSecret(m[1], want)) return { site, via: "token" };
    }
    return { site: null, via: "bad-token" };
  }
  const origin = request.headers.get("origin");
  const site = origin ? SITES.find(s => s.origin === origin) : null;
  return site ? { site, via: "origin" } : null;
}

// Compares SHA-256 digests in constant time, so the time taken says nothing
// about how much of a guessed token was right.
async function sameSecret(given, expected) {
  const digest = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// The headers that let a site's page read the answer. A browser on another
// site checks with CORS first: it sends a preflight (OPTIONS) for the JSON
// POST, and lets the page read the answer only if it names the page's origin.
// Nobody else gets these headers, so for every other site the browser still
// blocks the call. A site's server needs none.
export function corsFor(caller) {
  return caller && caller.via === "origin" ? { "Access-Control-Allow-Origin": caller.site.origin } : {};
}

function preflight(cors) {
  return new Response(null, {
    status: 204,
    headers: { ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" }
  });
}

// → { body, site, cors } for a JSON POST from a known site, or { response }:
// the answer to send instead (the preflight, or a refusal).
export async function readRequest(request, env) {
  const caller = await callerOf(request, env);
  const cors = corsFor(caller);
  if (request.method === "OPTIONS" && caller && caller.via === "origin") return { response: preflight(cors) };

  if (request.method !== "POST") {
    return { response: reply(405, { ok: false, error: "Use POST." }, { ...cors, Allow: "POST" }) };
  }

  // Unlike api/ on Vercel, which also served the pages, every caller here is
  // on another site, so "same site" means nothing. A form comes from a site's
  // server with its token, or from a site's page with its Origin. Anything
  // else is turned away: a request naming another site is that site trying to
  // use this as a mail relay, and one with neither is a script. A script can
  // forge an Origin, so this guards browsers and stops casual misuse, not a
  // determined sender.
  if (!caller || !caller.site) {
    if (caller && caller.via === "bad-token") {
      return { response: reply(401, { ok: false, error: "Wrong token." }, { "WWW-Authenticate": 'Bearer realm="launch-forms"' }) };
    }
    if (request.headers.get("origin") !== null) {
      return { response: reply(403, { ok: false, error: "Cross-origin requests are not accepted." }) };
    }
    return { response: reply(401, { ok: false, error: "Only the dashboard's forms may use this service." }, { "WWW-Authenticate": 'Bearer realm="launch-forms"' }) };
  }

  // JSON only. Besides being the only thing the forms send, it means a
  // browser on another site needs a preflight, which only a site's page gets
  // an answer to — so the Origin check is not the only thing in the way.
  if (!/^application\/json\b/i.test(request.headers.get("content-type") || "")) {
    return { response: reply(415, { ok: false, error: "Send JSON." }, cors) };
  }

  const text = await readBody(request);
  if (text === null) return { response: reply(413, { ok: false, error: "Too large." }, cors) };
  let body;
  try { body = JSON.parse(text); } catch (e) { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { response: reply(400, { ok: false, error: "Malformed request." }, cors) };
  }
  return { body, site: caller.site, cors };
}

// The body as text, or null when it is over MAX_BODY. Counted while reading,
// so a body with a false Content-Length, or none, is cut off too.
export async function readBody(request) {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return new TextDecoder().decode(concat(parts));
}

// ---- visitor text --------------------------------------------------------------

// One line of visitor text: control characters (CR/LF included) become
// spaces, so nothing typed can break a subject line.
export function line(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
}

// A block of visitor text: keeps line breaks and tabs, drops other controls.
export function block(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// A feedback report's reference. The visitor is shown it and may quote it, so
// it also goes in the subject line of the team's copy, where search finds it.
export function newRef() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return "LAUNCH-" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// ---- links in emails -----------------------------------------------------------

// An unsubscribe link carries its address ENCRYPTED (AES-256-GCM), not merely
// signed. Signing would stop forgery, but the address would still be readable
// in the URL — and URLs land in request logs, which must never carry an
// address. The key is derived from UNSUBSCRIBE_SECRET exactly as api/_mail.js
// derives it (HKDF-SHA-256, the same salt and info), and the token has the
// same layout (12-byte IV, ciphertext, 16-byte tag, base64url), so a link made
// by either reads in the other.
const enc = new TextEncoder();

async function linkKey(secret, usage) {
  const raw = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("launch-dashboard"), info: enc.encode("email-links-v1") },
    raw, { name: "AES-GCM", length: 256 }, false, [usage]);
}

// `site` is the id of the site the link belongs to, so a link opened later
// finds that site's unsubscribe page. api/_mail.js's readToken ignores the
// extra field, so these links also work there while both run.
export async function makeToken(secret, purpose, email, site = null, now = Date.now()) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = { p: purpose, e: email, t: Math.floor(now / 1000) };
  if (site) plain.s = site;
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await linkKey(secret, "encrypt"), enc.encode(JSON.stringify(plain)));
  return toBase64url(concat([iv, new Uint8Array(sealed)]));
}

// → { email, site } for a good link (`site` null when it names none), or null
// for anything else: tampered, wrong key, junk, or the wrong purpose — such as
// a confirm link emailed before 6 Oct 2026, when subscribing still needed one.
// Unsubscribe links never expire: they sit in emails people keep.
export async function readToken(secret, purpose, token) {
  if (typeof token !== "string" || token.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const raw = fromBase64url(token);
  if (!raw || raw.length < 12 + 16 + 2) return null;
  let v;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(0, 12) }, await linkKey(secret, "decrypt"), raw.subarray(12));
    v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch (e) {
    return null;
  }
  if (!v || v.p !== purpose || typeof v.e !== "string" || !EMAIL_RE.test(v.e) || !Number.isInteger(v.t)) return null;
  return { email: v.e, site: typeof v.s === "string" ? v.s : null };
}

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

function toBase64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// null for text that is not base64url (the token check above already refuses
// other characters; a length of 1 more than a multiple of 4 is the rest).
function fromBase64url(s) {
  if (s.length % 4 === 1) return null;
  let bin;
  try { bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)); } catch (e) { return null; }
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// ---- emails ----------------------------------------------------------------------
// From here to the Resend section, a copy of api/_mail.js, byte for byte in
// what it draws: the update email (scripts/notify-subscribers.js) is drawn by
// that file, and every email should look like one family. The test "draws
// every email exactly as api/_mail.js does" holds the two together; change
// both, or neither.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");
// "7 Oct 2026, 15:48 UTC": what the team's emails show for a time, rather
// than 2026-10-07T15:48:57.440Z.
export function when(d = new Date()) {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

// The Unitaid logo for emails: a PNG, because Gmail and Outlook do not show
// SVG, attached to the email itself and shown with src="cid:…", so nothing is
// fetched from the internet (Outlook blocks fetched images for senders not
// marked safe). The "hosted" form, loaded from the LAUNCH site, is for the
// update email only, which api/_mail.js draws.
export const LOGO_PATH = "/assets/email/unitaid-logo.png";
export const LOGO_CID = "unitaid-logo";
const LOGO_ATTACHMENT = { filename: "unitaid-logo.png", content: LOGO_PNG_BASE64, content_id: LOGO_CID, content_type: "image/png" };
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Font styles as separate properties. Outlook's renderer ignores the `font:`
// shorthand, which left headings plain there (the owner's screenshot, 8 Oct).
const font = (size, weight = "normal", lineHeight = "1.5") =>
  `font-family:${FONT};font-size:${size}px;font-weight:${weight};line-height:${lineHeight}`;

// The frame every email shares (8 Oct 2026, at the owner's request: "make it
// professional, with the Unitaid logo"): a white card on a light grey page;
// the Unitaid logo top left and the dashboard's name top right; the heading
// and body; small print under a divider; and "Powered by Unitaid" under the
// card, as the dashboard itself says. Tables, bgcolor and inline styles only,
// because Outlook's Word-based renderer ignores most modern CSS. `logo` is
// "inline" (the attached copy) or "hosted" (from `site`, the absolute origin
// of the LAUNCH site); a hosted logo with no site gives the name in text instead.
export function frame({ site, logo: how = "inline", heading, body, small = "" }) {
  const src = how === "inline" ? "cid:" + LOGO_CID : site ? site + LOGO_PATH : null;
  const logo = src
    ? `<img src="${esc(src)}" width="120" height="42" alt="Unitaid" ` +
      `style="display:block;width:120px;height:42px;border:0;outline:none;text-decoration:none">`
    : `<span style="${font(18, "bold", "1")};color:#212E92">Unitaid</span>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f5f7" style="background:#f3f5f7">` +
    `<tr><td align="center" style="padding:32px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" ` +
      `style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8ec;border-radius:12px">` +
    // header: logo, and the dashboard's name
    `<tr><td style="padding:26px 32px 22px;border-bottom:1px solid #edf1f3">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td valign="middle">${logo}</td>` +
        `<td valign="middle" align="right" style="${font(11, "bold", "1.35")};letter-spacing:.08em;text-transform:uppercase;color:#0E5A73">` +
          `LAUNCH Transparency<br>Dashboard</td>` +
      `</tr></table>` +
    `</td></tr>` +
    // heading and body
    `<tr><td style="padding:30px 32px 6px;${font(16, "normal", "1.6")};color:#1f2a30">` +
      `<div style="margin:0 0 16px;${font(24, "bold", "1.3")};color:#111b21">${esc(heading)}</div>` +
      body +
    `</td></tr>` +
    // small print
    (small
      ? `<tr><td style="padding:10px 32px 28px">` +
        `<div style="border-top:1px solid #edf1f3;padding-top:18px;${font(13, "normal", "1.55")};color:#6b7780">${small}</div>` +
        `</td></tr>`
      : `<tr><td style="padding:0 0 22px"></td></tr>`) +
    `</table>` +
    // under the card
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">` +
      `<tr><td align="center" style="padding:16px 12px 0;${font(12)};color:#8a959d">` +
        `LAUNCH Transparency Dashboard · Powered by Unitaid</td></tr>` +
    `</table>` +
    `</td></tr></table>`
  );
}

// A note to the team inbox, as a plain form (8 Oct 2026, the owner's
// request: "just a form", no logo): the title, one line on what happened or
// what to do, the visitor's message in a box when there is one, then the
// details as a bordered two-column table (label on grey, answer on white), and
// a footer. Tables, bgcolor and separate font properties only, for Outlook.
//
// Each row is [label, value] or [label, value, { href, tone }]: `tone` is
// "warn" (something to do) or "muted" (detail). Every value is escaped, and
// none a visitor typed ever becomes a link, because the inbox reading these is
// the team's, and a form is an easy way to put a phishing URL in front of it.
// `href` is only ever an address this code holds (a SITES page).
export function render(heading, message, rows, { intro = "", footer = "" } = {}) {
  const text = [heading, intro, "", message, "",
    ...rows.map(([k, v, o]) => `${k}: ${v}` + (o && o.href && o.href !== v ? ` (${o.href})` : "")),
    "", footer]
    .filter((l, i, a) => !(l === "" && (i === 0 || a[i - 1] === "")))
    .join("\n").replace(/\n+$/, "") + "\n";

  const border = "border:1px solid #d5dde2";
  const cell = (v, o) => {
    const shown = esc(v);
    const style = o && o.tone === "warn" ? "color:#b42318;font-weight:bold"
      : o && o.tone === "muted" ? "color:#6b7780" : "color:#1f2a30";
    const body = o && o.href
      ? `<a href="${esc(o.href)}" style="color:#0E5A73;text-decoration:underline">${shown}</a>`
      : shown;
    return `<span style="${style}">${body}</span>`;
  };
  const tableRows = rows.map(([k, v, o]) =>
    `<tr>` +
    `<td width="34%" valign="top" bgcolor="#f3f6f8" style="padding:10px 14px;${border};background:#f3f6f8;${font(13, "bold", "20px")};color:#4a5761">${esc(k)}</td>` +
    `<td valign="top" style="padding:10px 14px;${border};${font(15, "normal", "20px")};word-break:break-word">${cell(v, o)}</td>` +
    `</tr>`).join("");

  const html =
    `<div style="max-width:620px;${font(15)};color:#1f2a30">` +
    `<p style="margin:0 0 8px;${font(20, "bold", "1.3")};color:#111b21">${esc(heading)}</p>` +
    (intro ? `<p style="margin:0 0 18px;${font(15)}">${esc(intro)}</p>` : "") +
    (message
      ? `<div style="margin:0 0 18px;padding:12px 14px;border-left:3px solid #0E5A73;background:#f4f7f8;${font(15)};white-space:pre-wrap;word-break:break-word">${esc(message)}</div>`
      : "") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${border}">${tableRows}</table>` +
    (footer ? `<p style="margin:16px 0 0;${font(12)};color:#6b7780">${esc(footer)}</p>` : "") +
    `</div>`;
  return { text, html };
}

// An email to a subscriber, in the frame every email shares: a heading, a few
// paragraphs, one button, and small print. Every link in it is one this code
// built from SITES or the service's own address, never anything a visitor
// typed. `site` is where a hosted logo is loaded from (frame()).
export function letter({ heading, paras, button, small = [], site = null, logo = "inline" }) {
  const text = [heading, "", ...paras.flatMap(p => [p, ""]),
    `${button.label}: ${button.href}`, "", ...small.map(s => s.link ? `${s.text} ${s.link}` : s.text)]
    .join("\n").replace(/\n+$/, "") + "\n";
  // the button as a table cell with a background: the one form Outlook draws
  const btn =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr>` +
    `<td bgcolor="#0E5A73" style="background:#0E5A73;border-radius:8px">` +
    `<a href="${esc(button.href)}" style="display:inline-block;padding:13px 26px;${font(15, "bold", "1")};color:#ffffff;text-decoration:none;border-radius:8px">${esc(button.label)}</a>` +
    `</td></tr></table>`;
  const body = paras.map(p => `<p style="margin:0 0 16px">${esc(p)}</p>`).join("") + btn;
  const smallHtml = small.map(s => `<p style="margin:0 0 6px">${esc(s.text)}` +
    (s.link ? ` <a href="${esc(s.link)}" style="color:#6b7780;text-decoration:underline">${esc(s.linkLabel || s.link)}</a>` : "") +
    `</p>`).join("");
  return withLogo(logo, { text, html: frame({ site, logo, heading, body, small: smallHtml }) });
}

// An inline logo travels as an attachment, which sendEmail() passes on.
function withLogo(logo, email) {
  return logo === "inline" ? { ...email, attachments: [LOGO_ATTACHMENT] } : email;
}

// ---- Resend ----------------------------------------------------------------------

export async function resendRequest(cfg, method, path, body) {
  let res;
  try {
    const init = { method, headers: { Authorization: "Bearer " + cfg.key }, signal: AbortSignal.timeout(8000) };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    res = await fetch(RESEND + path, init);
  } catch (err) {
    return { ok: false, status: 0, name: err.name || "network_error", message: err.message || "" };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, name: data.name || "", message: data.message || "", data };
}

// Status and Resend's own error name/message only. Never the submission: the
// payload carries names, addresses and organisations, and function logs are
// kept on the host under whatever retention it happens to have.
export function logFailure(form, what, r) {
  console.error(`[${form}] ${what} failed: HTTP ${r.status} ${r.name} ${String(r.message).slice(0, 200)}`.trim());
}

// To the team inbox unless `to` says otherwise.
export function sendEmail(cfg, { to, subject, text, html, replyTo, headers, attachments, form }) {
  const body = { from: cfg.from, to: to || cfg.to, subject, text, html, tags: [{ name: "form", value: form }] };
  if (replyTo) body.reply_to = replyTo;
  if (headers) body.headers = headers;
  if (attachments && attachments.length) body.attachments = attachments;
  return resendRequest(cfg, "POST", "/emails", body);
}

const contactPath = (email) => "/contacts/" + encodeURIComponent(email);

export function getContact(cfg, email) {
  return resendRequest(cfg, "GET", contactPath(email));
}

export function updateContact(cfg, email, fields) {
  return resendRequest(cfg, "PATCH", contactPath(email), fields);
}

// `fields` adds Resend's own first_name/last_name and any custom `properties`.
export function addContact(cfg, email, fields = {}) {
  const body = { email, unsubscribed: false, ...fields };
  if (cfg.segment) body.segments = [{ id: cfg.segment }];
  return resendRequest(cfg, "POST", "/contacts", body);
}

export function addToSegment(cfg, email) {
  return resendRequest(cfg, "POST", contactPath(email) + "/segments/" + encodeURIComponent(cfg.segment));
}
