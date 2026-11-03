// POST /api/feedback — "Send feedback". A port of api/feedback.js.
//
// Receives the report the dashboard's feedback form builds, from a site's
// server (with its token) or a site's page (with its Origin) — see SITES in
// mail.mjs — re-checks what the form already checked in the browser, and
// emails it to the team inbox through Resend. Answers { ok: true, ref } — the
// form shows that reference to the visitor, and the same reference is in the
// subject line of the team's copy, so the two can be matched when quoted.

import * as mail from "./mail.mjs";

// The form's own four values. A page may relabel them for visitors, but the
// value is what arrives here, so the team always reads the same four labels
// whichever page a report came from.
const TYPES = {
  correction: "A data point looks wrong",
  source: "A source is missing, broken or out of date",
  suggestion: "Suggestion or feature request",
  other: "Something else"
};

export async function feedback(request, env) {
  const got = await mail.readRequest(request, env);
  if (got.response) return got.response;
  const { body, site, cors } = got;
  const answer = (status, b) => mail.reply(status, b, cors);
  const cfg = mail.config(env);
  if (!cfg) return mail.notConfigured("feedback", env, cors);

  // Same limits the form enforces: a message of 10 to 2000 characters, and an
  // optional address that must look like one.
  const message = mail.block(body.message, 2000);
  if (message.length < 10) {
    return answer(400, { ok: false, error: "Please describe the issue — at least 10 characters." });
  }
  const email = mail.line(body.email, 254);
  if (email && !mail.EMAIL_RE.test(email)) {
    return answer(400, { ok: false, error: "That email address does not look right." });
  }

  const type = Object.prototype.hasOwnProperty.call(TYPES, body.type) ? body.type : "other";
  const product = mail.line(body.productName, 120) || "General — the dashboard as a whole";
  const name = mail.line(body.name, 200);
  const org = mail.line(body.organisation, 200);
  const page = body.page && typeof body.page === "object" ? body.page : {};
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const version = [mail.line(data.lastUpdated, 40), mail.line(data.dataStatus, 40)].filter(Boolean);
  const ref = mail.newRef();

  // Laid out as a form (mail.render). The page address is the visitor's own
  // report of where they were, so it is shown as text, never as a link. "Sent
  // from" is the site the service recognised (its token or Origin), so it can
  // be a link: the address comes from SITES, not from the request.
  const MUTED = { tone: "muted" };
  const rows = [
    ["Reference", ref],
    ["About", TYPES[type]],
    ["Medicine", product],
    ["Name", name || "Not given", name ? null : MUTED],
    ["Email address", email || "Not given, so this cannot be answered", email ? null : { tone: "warn" }],
    ["Organisation", org || "Not given", org ? null : MUTED],
    ["Sent from", site.name, { href: site.dashboard }],
    ["Page", mail.line(page.url, 500) || "Not recorded"],
    // Which data the visitor was looking at — a correction is only checkable
    // against the version it was made on.
    ["Data version", version.length ? version.join(" · ") : "Not recorded"],
    ["Received", mail.when()],
    ["Browser", mail.line(body.userAgent, 300) || "Not recorded", MUTED]
  ];

  const sent = await mail.sendEmail(cfg, {
    subject: `[LAUNCH feedback] ${TYPES[type]} — ${product} (${ref})`,
    ...mail.render("New feedback", message, rows, {
      intro: `${TYPES[type]} · ${product}`,
      footer: email
        ? `Reference ${ref}. Reply to this email to answer them: the reply goes to ${email}.`
        : `Reference ${ref}. They left no email address, so this cannot be answered.`
    }),
    // Reply in the inbox goes straight to the visitor when they left an address.
    replyTo: email || null,
    form: "feedback"
  });
  if (!sent.ok) {
    mail.logFailure("feedback", "send " + ref, sent);
    return answer(502, { ok: false, error: "Could not send just now." });
  }

  console.log(`[feedback] sent ${ref}`);   // the reference only — never the contents
  return answer(200, { ok: true, ref });
}
