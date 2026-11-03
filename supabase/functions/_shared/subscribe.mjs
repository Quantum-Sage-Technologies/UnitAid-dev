// POST /api/subscribe — "Subscribe for updates". A port of api/subscribe.js.
//
// Receives { firstName, lastName, email, organisation (optional), page }, from
// a site's server (with its token) or a site's page (with its Origin) — see
// SITES in mail.mjs. Single opt-in, the owner's decision on 6 Oct 2026
// (docs/email-backend-notes.md §2.3): the address joins the list at once, and
// the welcome email's unsubscribe link is the way off it. In this order:
//   1. The address becomes a subscribed Resend contact in ADDRESSES.segment:
//      created if new, re-subscribed if it had unsubscribed. If this fails,
//      the form says so, and nothing else happens.
//   2. A welcome email, with an unsubscribe link, goes to the subscriber.
//   3. The team inbox is told.
// A failure in 2 or 3 is logged, not shown: the person is on the list.
//
// The answer says which case it was, so the page can say so: { status:
// "subscribed" } for a new or returning address, { status: "already" } for one
// already on the list (the owner's decision, 8 Oct 2026). Someone already
// subscribed is still sent no email, so the form cannot be used to send a
// subscriber the welcome over and over.

import * as mail from "./mail.mjs";

export async function subscribe(request, env) {
  const got = await mail.readRequest(request, env);
  if (got.response) return got.response;
  const { body, site, cors } = got;
  const answer = (status, b) => mail.reply(status, b, cors);
  const cfg = mail.config(env);
  if (!cfg) return mail.notConfigured("subscribe", env, cors);

  // What the form collects (owner's list, 8 Oct 2026): first and last name and
  // the address, all required, and the organisation, optional. The same
  // checks the page runs.
  const firstName = mail.line(body.firstName, 100);
  const lastName = mail.line(body.lastName, 100);
  const organisation = mail.line(body.organisation, 200);
  if (!firstName || !lastName) {
    return answer(400, { ok: false, error: "Please enter your first and last name." });
  }
  const email = mail.line(body.email, 254);
  if (!mail.EMAIL_RE.test(email)) {
    return answer(400, { ok: false, error: "Please enter an email address we can reach you at." });
  }
  const failed = () => answer(502, { ok: false, error: "Could not subscribe you just now." });

  // ---- 1. on the list ---------------------------------------------------------
  // Look the address up first. The API reference does not say what a lookup of
  // an unknown address returns, so any 4xx other than an auth or rate-limit
  // answer is taken as "no such contact" and a create is tried — which then
  // fails loudly if that guess was wrong.
  const found = await mail.getContact(cfg, email);
  let state;
  if (found.ok) {
    state = found.data && found.data.unsubscribed ? "returning" : "already";
  } else if (found.status >= 400 && found.status < 500 && ![401, 403, 429].includes(found.status)) {
    state = "new";
  } else {
    mail.logFailure("subscribe", "look up contact", found);
    return failed();
  }

  // Names go in Resend's own fields. The organisation goes in the custom
  // property mail.ORG_PROPERTY, which Resend refuses, with the whole call, until
  // it is defined in the account: then the save is tried once more without it,
  // so subscribing never fails for it, and the team's note says what to do.
  const names = { first_name: firstName, last_name: lastName };
  let orgSaved = !organisation;
  const save = async (send) => {
    if (organisation) {
      const r = await send({ ...names, properties: { [mail.ORG_PROPERTY]: organisation } });
      if (r.ok) { orgSaved = true; return r; }
      if (!(r.status >= 400 && r.status < 500 && ![401, 403, 429].includes(r.status))) return r;
      mail.logFailure("subscribe", "save organisation", r);
    }
    return send(names);
  };

  if (state === "new") {
    const made = await save(fields => mail.addContact(cfg, email, fields));
    if (!made.ok) {
      mail.logFailure("subscribe", "add contact", made);
      return failed();
    }
  } else if (state === "returning") {
    const back = await save(fields => mail.updateContact(cfg, email, { unsubscribed: false, ...fields }));
    if (!back.ok) {
      mail.logFailure("subscribe", "re-subscribe contact", back);
      return failed();
    }
  }

  // An existing contact may not be in the segment yet. A failure here is not
  // shown to the person, who is subscribed either way; the team's note says
  // so, because a contact outside the segment misses every broadcast.
  let segmentOk = true;
  if (cfg.segment && state !== "new") {
    const seg = await mail.addToSegment(cfg, email);
    segmentOk = seg.ok || seg.status === 409;
    if (!segmentOk) mail.logFailure("subscribe", "add to segment", seg);
  }

  if (state === "already") {
    console.log("[subscribe] already subscribed");
    return answer(200, { ok: true, status: "already" });
  }

  // Two links carry the same token. The one in the email opens the site's own
  // "Unsubscribe?" page, which posts it back here; a page cannot be served
  // from this address (mail.mjs, SITES). The one in the List-Unsubscribe
  // header is this service's own: a mail app's "Unsubscribe" button posts
  // straight to it, with no page in between (RFC 8058).
  const token = await mail.makeToken(cfg.secret, "unsubscribe", email, site.id);
  const unsubscribe = `${mail.unsubscribePageOf(site)}?t=${token}`;
  const oneClick = `${cfg.base}/api/unsubscribe?t=${token}`;
  // Back to the site they subscribed on: its address from SITES, never from
  // the request.
  const home = site.dashboard;

  // ---- 2. welcome ----------------------------------------------------------------
  // Anyone can type any address into the form, so the welcome says how to get
  // off the list in the same breath as saying you are on it.
  const welcome = await mail.sendEmail(cfg, {
    to: [email],
    subject: "You're subscribed to LAUNCH dashboard updates",
    ...mail.letter({
      heading: "You're subscribed",
      paras: [
        // The opening sentence is the owner's wording (8 Oct 2026). The second
        // follows the Subscribe box's wording (15 Oct 2026 feedback).
        "You're now subscribed to the LAUNCH Transparency Dashboard. We'll email you when product information is updated."
      ],
      button: { label: "Open the dashboard", href: home },
      small: [{ text: "Didn't sign up, or don't want these emails?", link: unsubscribe, linkLabel: "Unsubscribe" }]
    }),
    // A reply to the welcome reaches the team, not the sending address.
    replyTo: cfg.to,
    // RFC 2369 + RFC 8058: the mail app's own "Unsubscribe" button.
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    form: "subscribe-welcome"
  });
  if (!welcome.ok) mail.logFailure("subscribe", "send welcome", welcome);

  // ---- 3. tell the team ------------------------------------------------------------
  // Laid out as a form (mail.render): plain labels, a readable time, the list's
  // name rather than its id, and what (if anything) the team has to do.
  const MUTED = { tone: "muted" }, WARN = { tone: "warn" };
  const todo = [];
  if (!segmentOk) todo.push(`add them to "${mail.SEGMENT_NAME}" in Resend by hand`);
  if (!orgSaved) todo.push(`create the contact property "${mail.ORG_PROPERTY}" in Resend (Audience → Properties, type text), so organisations are saved with the contact; this one is only in this email`);
  const rows = [
    ["First name", firstName],
    ["Last name", lastName],
    ["Email address", email],
    ["Organisation", organisation || "Not given", organisation ? (orgSaved ? null : WARN) : MUTED],
    ["Signed up", mail.when()],
    ["Signed up on", site.name, { href: home }],
    ["Subscriber", state === "returning" ? "Returning: had unsubscribed before" : "New"],
    !cfg.segment ? ["Mailing list", "None set: saved as a plain contact", MUTED]
      : segmentOk ? ["Mailing list", mail.SEGMENT_NAME]
      : ["Mailing list", `Not added. Add them to "${mail.SEGMENT_NAME}" by hand in Resend (segment ${cfg.segment}).`, WARN]
  ];
  const note = await mail.sendEmail(cfg, {
    subject: "[LAUNCH] New subscriber for dashboard updates",
    ...mail.render("New subscriber", "", rows, {
      intro: todo.length
        ? `${firstName} ${lastName} subscribed to updates from the LAUNCH dashboard. To do: ${todo.join("; and ")}.`
        : `${firstName} ${lastName} subscribed to updates from the LAUNCH dashboard. Nothing to do: they are on the mailing list, and every update email carries their unsubscribe link.`,
      footer: "Sent automatically when someone subscribes on the dashboard. Their details are used only for the update emails."
    }),
    form: "subscribe-team"
  });
  if (!note.ok) mail.logFailure("subscribe", "notify team", note);

  console.log("[subscribe] subscribed" + (state === "returning" ? " (returning)" : "") + (note.ok ? ", team notified" : ", team NOT notified"));
  return answer(200, { ok: true, status: "subscribed" });
}
