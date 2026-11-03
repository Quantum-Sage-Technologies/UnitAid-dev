// /api/unsubscribe?t=… — leaving the list. A port of api/unsubscribe.js,
// which showed its own "Unsubscribe?" page. This service cannot: on Supabase's
// own address a page is served as plain text (docs/forms-service-notes.md), so
// the page lives on each site (SITES in mail.mjs) and this answers it:
//
//   GET   the link in the welcome email, or a mail app opening the
//         List-Unsubscribe address. Never unsubscribes: many mail systems open
//         every link in an incoming email to scan it. Sends the reader on
//         (303) to their site's "Unsubscribe?" page, with the same token.
//   POST  JSON { t } from that page (a site's server with its token, or its
//         page with its Origin): unsubscribes, and answers { status }.
//   POST  anything else: a mail app's own "Unsubscribe" button (RFC 8058),
//         which posts "List-Unsubscribe=One-Click" straight to the address in
//         the List-Unsubscribe header, token in the query string, no Origin.
//
// The encrypted token is what authorises an unsubscribe. The POST marks the
// Resend contact unsubscribed — the same flag Resend's own broadcast
// unsubscribe link sets, so every later broadcast skips the address. The
// contact itself is kept, as Resend does: deleting it would lose the record
// that this address said no.

import * as mail from "./mail.mjs";

const BAD_LINK = "This link doesn't work. It may have been copied incompletely: use the unsubscribe link in your most recent email from us.";
const FAILED = "We could not unsubscribe you just now. Please try the link again in a few minutes.";

export async function unsubscribe(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET" || request.method === "HEAD") return sendOn(url, env);

  // A site's page or server, as for the other forms (the preflight included).
  const json = /^application\/json\b/i.test(request.headers.get("content-type") || "");
  if (request.method === "OPTIONS" || (request.method === "POST" && json)) {
    const got = await mail.readRequest(request, env);
    if (got.response) return got.response;
    return leave(got.body.t, env, got.cors);
  }

  if (request.method !== "POST") {
    return mail.reply(405, { ok: false, error: "Use the link in your email." }, { Allow: "GET, POST" });
  }

  // The one-click POST. A mail provider sends no Origin. A browser form
  // posting here from some other site would name that site, and is turned
  // away; the token, not this check, is what authorises the request.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== "null" && !mail.SITES.some(s => s.origin === origin)) {
    return mail.reply(403, { ok: false, error: "Cross-origin requests are not accepted." });
  }
  // The body only says "List-Unsubscribe=One-Click"; the token is in the URL.
  if (await mail.readBody(request) === null) return mail.reply(413, { ok: false, error: "Too large." });
  return leave(url.searchParams.get("t"), env, {});
}

// The 303 to the "Unsubscribe?" page of the site the link belongs to, or
// LAUNCH's for a link that names none (every link emailed from Vercel). A
// link that cannot be read goes there too, and the page reports it when its
// button is pressed. No-referrer, so the token in the address is not passed on.
async function sendOn(url, env) {
  const t = url.searchParams.get("t") || "";
  const secret = (env.UNSUBSCRIBE_SECRET || "").trim();
  const who = secret.length >= 32 ? await mail.readToken(secret, "unsubscribe", t) : null;
  const site = mail.siteById(who && who.site);
  const token = /^[A-Za-z0-9_-]{1,1000}$/.test(t) ? t : "";
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${mail.unsubscribePageOf(site)}?t=${token}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}

async function leave(token, env, cors) {
  const cfg = mail.config(env);
  if (!cfg) return mail.notConfigured("unsubscribe", env, cors);

  const who = await mail.readToken(cfg.secret, "unsubscribe", token);
  if (!who) return mail.reply(400, { ok: false, error: BAD_LINK }, cors);

  // An address that is not a contact at all is already not getting emails, so
  // a 404 is still "unsubscribed" — the click must never look like it failed.
  const done = await mail.updateContact(cfg, who.email, { unsubscribed: true });
  if (!done.ok && done.status !== 404) {
    mail.logFailure("unsubscribe", "unsubscribe contact", done);
    return mail.reply(502, { ok: false, error: FAILED }, cors);
  }

  console.log("[unsubscribe] unsubscribed");
  return mail.reply(200, { ok: true, status: "unsubscribed" }, cors);
}
