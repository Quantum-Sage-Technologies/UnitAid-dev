# Forms service on Supabase — working notes

This document covers `supabase/`, the forms service that takes over from
`api/` on Vercel: one Supabase Edge Function, `api`, behind the dashboard's
two forms, **Subscribe for updates** and **Send feedback**, and the
unsubscribe links in the welcome email. The code is a port of `api/`; why
`api/` works the way it does is in
[email-backend-notes.md](email-backend-notes.md), and is not repeated here.
Per [CLAUDE.md](../CLAUDE.md), this document is updated in the same commit as
any change it describes.

Branch `forms/supabase`, started 3 Nov 2026 from `main` at `11681f2`. Local
only until the owner says otherwise (§5).

```
supabase/
  config.toml                 Supabase's login check off for the function (§2.10)
  functions/
    api/index.js              the host wrapper: Deno.serve → handle()
    _shared/handle.mjs        the router: /api/subscribe | unsubscribe | feedback
    _shared/mail.mjs          port of api/_mail.js: settings, SITES, checks, emails, Resend
    _shared/subscribe.mjs     ports of the three handlers
    _shared/feedback.mjs
    _shared/unsubscribe.mjs
    _shared/logo.mjs          copy of api/_logo.js in this module format
scripts/test-forms-service.mjs  the tests (no network: Resend is stubbed)
```

`api/` stays until the switch (§1, step 9). `scripts/notify-subscribers.js`,
the update email, keeps using `api/_mail.js` (§2.7).

---

## 1. Switching it on

Steps 1–3 are for a **test** project; the production project repeats them in
Unitaid's organisation (step 6).

1. **A test project.** On a Supabase account the team owns, Free plan. One
   person may own or administer only **2 active free projects** across all
   their organisations (Supabase billing FAQ, read 3 Nov); paused projects do
   not count. Kyler's personal organisation already holds 2, so either pause
   one, or create the test organisation from a shared Tamarind login and join
   it as Developer (an Owner or Admin member's quota counts against the
   organisation).
2. **Test settings in Resend:** a new key with **Full access** (subscribing
   writes a contact), and a separate **test segment**, so test contacts never
   get the update email, which goes to the whole real segment
   (`scripts/notify-subscribers.js`). The test project's settings name it as
   `RESEND_SEGMENT_ID`, which replaces `ADDRESSES.segment` (added 3 Nov,
   before the first test deploy). Production leaves it unset.
3. **Deploy and set the secrets** (never in the repo; both repos are public).
   With Supabase CLI 3.0.0 (released 2 Nov 2026), from the repo root:
   ```
   supabase login
   supabase link --project-ref <ref>
   supabase secrets set --env-file supabase/.env.test
   supabase functions deploy api --use-api
   ```
   `supabase/.env.test` holds `RESEND_API_KEY=…`, `UNSUBSCRIBE_SECRET=…`,
   `TEAM_INBOX=…`, `FORMS_BASE_URL=https://<ref>.supabase.co/functions/v1`,
   `LOCAL_FORMS_TOKEN=…` and `RESEND_SEGMENT_ID=…`, one per line. It is git-ignored (`supabase/.env*`),
   and a file keeps the values out of the shell's history, where
   `secrets set NAME=value` would leave them. `--use-api` bundles on Supabase's
   side, so Docker is not needed. To target a project other than the linked
   one, add `--remote=<ref>`. In CI, v3 refuses both commands without `--yes`
   and deprecates `--project-ref` on them, so pin the CLI version there.
   `UNSUBSCRIBE_SECRET` for the test: a new value (`openssl rand -hex 32`),
   never the production one. Tokens: `openssl rand -hex 32` each. No secret
   name may start with `SUPABASE_` (Supabase reserves the prefix), and a
   changed secret takes effect without a redeploy.
4. **Check it** with curl and from the React version on `localhost:3000`: the
   refusals (401, 403, 405, 413, 415), a preflight from a site (204), a real
   subscribe with a `+test` address, a feedback report, the unsubscribe link
   (303 to the page) and a one-click unsubscribe.
5. **Unitaid's approvals** (asked 3 Nov): written approval of Supabase, an
   organisation Unitaid owns on the Pro plan, Kyler and Oakkar invited as
   Administrators; the WHO mailbox shown to accept outside mail; WHO IT's
   allow-list for the sender.
6. **Production project** in Unitaid's organisation, before its address goes
   to RBM (the docs do not say a transferred project keeps its address). The
   production secrets: the Resend key on the account that will keep it,
   **the same `UNSUBSCRIBE_SECRET` as Vercel's** (otherwise every unsubscribe
   link already emailed stops working), `TEAM_INBOX` = the WHO team mailbox
   once step 5 confirms it receives outside mail (its address is kept out of
   the repo, §2.4), and `RBM_FORMS_TOKEN` / `RBM_TEST_FORMS_TOKEN`.
7. **RBM's settings,** sent to RBM privately: the service's address and each
   site's token, under `UNITAID_`-prefixed names (RBM's contract check).
8. **Check on RBM's test site,** then production.
9. **Switch off `api/` on Vercel** and delete its two secrets there. Before
   that, `/api/unsubscribe` on Vercel must keep answering old links: a
   redirect to the service (§4).

---

## 2. Decisions, and why

### 2.1 Supabase, chosen by the owner on 3 Nov 2026

The forms' backend moves off Vercel (owner's decision, 2 Nov), on an
account Unitaid owns. Vercel stays for the LAUNCH review site and PR
previews. Considered:

| Option | Why not chosen |
|---|---|
| Cloudflare Workers (recommended on 2 Nov) | Owner's choice. Free with no idle pause, and could host the review site too, but the owner chose Supabase |
| A route on RBM's own server | The Resend key would sit on RBM's server, and fixes would wait for RBM's releases |
| Keep Vercel | Owner's decision of 2 Nov |

**Plan: Pro.** Free projects pause after 7 days of low activity and stay
paused until someone presses Resume in the dashboard (Supabase docs, read
3 Nov). A form used a few times a week is exactly such a project, and a
paused service fails every form with nothing on the page to say why. Pro is
$25 a month for the organisation, and includes $10 of compute credits a
month, which covers one project at the smallest size (about $10 a month).
One project therefore costs $25 a month in total. A second project in the
same paid organisation adds about $10 a month, so the test project stays
elsewhere (§1, step 1). Function calls: 2 million a month on Pro, 500,000 on
Free; a contact form uses a tiny fraction. The owner asked Unitaid for Pro
on 3 Nov.

### 2.2 The "Unsubscribe?" page lives on each site, not here

On Supabase's own address (`*.supabase.co`), a GET that answers `text/html`
is rewritten to `text/plain` (Supabase Edge Functions limits page, read 3 Nov).
`api/unsubscribe.js` answered the link in the welcome email with exactly
such a page, with an "Unsubscribe" button, because mail systems open every
link in an email to scan it and must not unsubscribe anyone by doing so
(email-backend-notes.md §2.4). Considered:

| Option | Why not chosen |
|---|---|
| A custom domain on Supabase (`forms.unitaid.org`) | HTML is allowed there, but it needs Pro plus $10 a month for the project, and a DNS record from Unitaid IT. Supabase also says custom domains are not meant for serving pages |
| Supabase's `static_files` | The files are still served through the function, on the same address, so the same rule applies |
| **Each site serves the page; the service answers it** | Chosen. No cost, and the reader stays on the site they subscribed on |

So `/api/unsubscribe` now:
- answers a **GET** (the link opened, or scanned) with a **303** to the
  site's page, carrying the same token. It never unsubscribes on a GET;
- answers that page's **JSON POST** `{ t }` with `{ status: "unsubscribed" }`;
- still takes a mail app's **one-click POST** (RFC 8058) directly, because
  the `List-Unsubscribe` header points at the service itself. No page is
  needed for that.

Each site's page address is in `SITES` (`unsubscribePage`). A link records
its site (§2.5); a link emailed from Vercel names none, so its reader goes to
LAUNCH's page. **Not built yet:** LAUNCH's `unsubscribe.html` and the RBM
module's page (§4).

### 2.3 Callers: a site's server with a token, or a site's page with its Origin

RBM's module rules (3 Nov) allow no `NEXT_PUBLIC_*` setting, and say the
browser calls only `/api/unitaid/…` on RBM's own site. So RBM's pages post to
RBM's server, and a route there passes the form on with
`Authorization: Bearer <token>`. Pages that post here directly — the LAUNCH
review site, the static RBM test copy, a developer's `localhost:3000` — are
recognised by their exact Origin, with CORS as before
(email-backend-notes.md §2.13). Both kinds are listed in `SITES`.

A change from `api/`: a request with **no Origin and no token is now
refused** (401). On Vercel it was let through, because the service also
served the pages and a request with no Origin was treated as same-site.
Here every caller is on another site, so "same site" means nothing. A script
can still forge an Origin, so this only stops casual misuse; the abuse
guards are unchanged (email-backend-notes.md §2.9, and §4 below). The one
exception is the one-click unsubscribe, which arrives from mail providers
with no Origin; the encrypted token authorises it.

Tokens are compared as SHA-256 digests in constant time. A token shorter
than 32 characters counts as not set, so a short test value cannot open
production. The **client IP** is not forwarded from RBM's server yet; it
only matters once there is a rate limit (§4).

### 2.4 Settings: the team inbox becomes a secret; the service's own address is set

`api/` kept every address in code (email-backend-notes.md §2.6). Two change:
- **`TEAM_INBOX`** is a secret. The team inbox becomes a WHO team mailbox,
  both repos are public, and addresses in public repos are collected for
  spam, so its address is in no file here. The sender and the segment stay in
  code, where changing them is reviewed.
- **`FORMS_BASE_URL`** is the service's own address. `api/` built its links
  from the request's Host header. On Supabase the function's path carries
  `/functions/v1`, so the address is set instead. It must be https (http
  only for `localhost`), with no query string.
- **`RESEND_SEGMENT_ID`** (optional) replaces the segment in code. It is
  for the test project only: test sign-ups go to a test segment, never the
  real list the update email goes to. The alternatives were rejected: editing
  `ADDRESSES.segment` for the test would deploy code that is not committed,
  and adding no segment would still put test contacts beside real ones.
  Tests: "configuration — a test segment" (5 checks; 320 in all).

### 2.5 The same links, one optional field added

Unsubscribe links keep `api/`'s format exactly (email-backend-notes.md §2.5):
HKDF-SHA-256 from `UNSUBSCRIBE_SECRET` with the same salt and info,
AES-256-GCM, 12-byte IV, 16-byte tag, base64url. The new code uses WebCrypto
(the encryption built into browsers, Deno and Node) instead of Node's
`crypto`. Links now carry an optional `s`, the site's id, so a link opened
later finds its site's page. `api/_mail.js`'s `readToken` ignores fields it
does not know, so links work **both ways** while both services run. This was
checked in Node and in Deno on 3 Nov: a Vercel-made link read in the new
code, a new link read in `api/_mail.js`, and a link made in Node decrypted
in Deno. A wrong secret, the wrong purpose, or one changed character →
refused.

### 2.6 Web-standard code, `.mjs` files

The shared code uses only fetch, Request, Response, `crypto.subtle` and
`btoa`/`atob`. It therefore runs unchanged on Supabase (Deno), in the Node
tests, and on another host if the service ever moves; only
`functions/api/index.js` (three lines of code) knows the host. The shared
files are `.mjs`, the one extension that means "module" to Node with no
`package.json` (this repo has none on purpose, developer-guide.md §1) and to
Deno. The Supabase CLI accepts `.js` and `.mjs` entrypoints (its 3.0.0
template).

### 2.7 A copy of the email drawing, held together by a test

`api/_mail.js` stays: `scripts/notify-subscribers.js` (CommonJS, run by
GitHub Actions) draws the update email with it. `_shared/mail.mjs` copies the
drawing code (`frame`, `render`, `letter`, `when`) unchanged, and the test
"draws every email exactly as api/_mail.js does" fails if the two differ, so
the welcome and the update email stay one family. Rejected for now: moving
`notify-subscribers.js` onto the new module, which would mean converting it
and its 67 tests to modules for no change in behaviour.

### 2.8 Smaller changes

- **A 32 KB body cap** (413). Vercel capped bodies on its own; the largest
  real form, a 2,000-character report with its page details, is a few
  kilobytes. The body is counted while it is read, so a false or missing
  Content-Length does not get past it.
- **The welcome's Reply-To is the team inbox,** so a reader who answers it
  reaches the team rather than the sending address.
- **The feedback note has a "Sent from" row,** the site the service
  recognised, because reports now arrive from several sites.
- **Errors inside a route answer 500** and log the error's name only: a
  message could quote the submission (email-backend-notes.md §2.10).

### 2.9 The "Unsubscribe?" page's words go through the translation pipeline

Option A (owner, 3 Nov): the page lives on RBM's site, in the React version.
Its words therefore follow the React version's interface-text pipeline
(docs/rbm-messages-notes.md), not hand edits in `launch-rbm-test`. There
are twelve keys, `unsubscribe.*` in `i18n/ui.en.json`, worded as
`api/unsubscribe.js`'s pages were. One exception: the page no longer names
the address, because RBM's server cannot decrypt the link (the secret stays
on the service). They are the first messages marked `{ "uiOnly": true }` in
`i18n/ui.page-forms.json`, because the old page has no such text.
`content.en.json` was rebuilt (`assemble-content.js --check`: current). The
dry run of `translate-strings.js` shows 12 strings to translate per language
(534 characters in Portuguese). Built with `--allow-stale` and copied into
`launch-rbm-test` with `copy-rbm-messages.js`; French and Portuguese stay
English until the translate bot runs after the change reaches `main`.

**A test was wrong, not the code.** `test-build-rbm-messages.js` required
every message to have a translation-memory entry already. The bot runs only
after a push to `main`, while `validate.yml` runs on pull requests and
builds with `--allow-stale` for exactly this case ("on a pull request the bot
has not translated new text yet"). So the check would have failed every pull
request that adds text; this is the first since the check was added on
28 Oct. It now allows a missing entry only for a `uiOnly` message, and only
if the build reports it as English in both languages. Any other message is
also on the page, which is translated already, so a missing entry there
still fails, as before. Checked both ways on 3 Nov: with the twelve new keys,
65 passed. With the memory entry for `subscribe.button` (a translated page
string) removed for the test, the check failed, naming it.

### 2.10 Supabase's login check is off

By default Supabase refuses any call without a Supabase login token (JWT).
The dashboard's readers have none, so every form would get a 401.
`config.toml` sets `verify_jwt = false` for the function. The service checks
its callers itself (§2.3).

It is written out on purpose, never left to the default: in the CLI's source,
a deploy with the key missing and no flag sends nothing, so the live
function keeps whatever setting it had before. The `--no-verify-jwt` flag
overrides the file. `config.toml` also names the entrypoint,
`functions/api/index.js`. Without that line the CLI looks for `index.ts` and
finds no function. And `supabase functions new` must not be used to recreate
the function: its 3.0.0 template wraps the handler in
`withSupabase({ auth: ["publishable", "secret"] })`, which would refuse
anonymous form posts.

---

## 3. How it was verified

- **Links across both codes** (§2.5): in Node and in Deno, 3 Nov.
- **The wrapper under Deno** (`deno run --allow-net --allow-env
  supabase/functions/api/index.js`, 3 Nov; Docker was not running, so not
  `supabase functions serve`): unknown path 404; no token and no Origin 401;
  wrong token 401; another site 403; a preflight from `localhost:3000` 204
  with its CORS header; `/functions/v1/api/subscribe` routed; no Resend key →
  503, with the log naming the missing settings and no values; an
  unsubscribe link → 303 to the local site's page with no-referrer; a 40 KB
  body → 413.
- **The tests:** `node scripts/test-forms-service.mjs`: **315 passed, 0
  failed** (3 Nov). It ports every group of `test-mail-api.js` that still
  applies, and adds: callers (tokens and Origins), configuration and
  `FORMS_BASE_URL`, links made on Vercel, unsubscribe by GET, JSON POST and
  one-click, the body cap (declared, undeclared, streamed, and exactly 32 KB
  against one byte more), routing (`/functions/v1` prefix, prototype names
  such as `constructor` → 404), logs, and parity with `api/_mail.js`. What was
  dropped, and why, is listed at the top of the file. Its first run found one
  bug: a JSON `PUT` to `/api/unsubscribe` was told `Allow: POST` instead of
  `Allow: GET, POST`, because JSON was routed to the form check before the
  method was. The code was wrong, not the test, and it was fixed.
  `node scripts/test-mail-api.js`: 194 passed, unchanged.
  `node scripts/test-notify-subscribers.js`: 67 passed, unchanged.
- **The verify block** (CLAUDE.md), 3 Nov: the treatment-policy file
  regenerated byte-identical; the validator gave 0 errors and 1 warning (the
  synthetic file: 0 and 0); the preview built; build-dataset: 58 passed,
  0 failed; country names cover all 252. No NUL bytes in any new or changed
  file (counted in Python).
- **Supabase's documentation and source, read 3 Nov** (docs repo at
  `0e0f84a`, plus the CLI and edge-runtime source where the docs say nothing):
  - Inside the function, the path is `/api/subscribe`: the function's name,
    without `/functions/v1`. The router matches the end of the path, so it
    works either way.
  - Preflights reach the function, which must answer them itself.
  - `.js` and `.mjs` entrypoints are allowed, given the `entrypoint` line.
  - Relative imports with an extension are uploaded with the function.
  - Outbound `fetch` is allowed; only ports 25 and 587 are blocked. The
    docs' own email example calls Resend.
  - Limits: 2 s of CPU per request, not counting time waiting on the
    network; 256 MB of memory; 150 s wall clock on Free, 400 s on paid.
  - HKDF and AES-GCM are in the runtime's WebCrypto: from its source; no
    docs page lists the algorithms.
- **Not documented anywhere official:** a request body limit (hence the
  service's own cap, §2.8); whether the HTML rewrite also applies to POST
  answers (the service sends only JSON and a bodiless 303, so it does not
  matter); and how long function logs are kept on Pro (the pricing page's
  "7 days" row is labelled for API and database logs).
- **End to end with the React version, 3 Nov** (Stage 2, by an independent
  tester agent). The service ran under Deno with Resend faked (every call
  recorded); the React version ran with `next build && next start` from
  `launch-rbm-test` `feat/forms-relay`, through its relays, driven by
  headless Chrome over the DevTools protocol:
  - The browser: 115 of 116 checks passed, in en, fr and pt. The browser
    called only `/api/unitaid/*` on its own site, never the service.
  - Each flow worked: Subscribe, already subscribed, feedback (the
    reference matched the team note), and the unsubscribe page (no PATCH
    before the click, a PATCH after it, bad-link and failed states).
  - The welcome's link pointed at the local site's page, and
    List-Unsubscribe at the service.
  - Four small bugs in the relays and page were fixed and passed a re-test.
    Two more are documented for RBM: the page's forms state lags a settings
    change by up to 5 minutes (its cache), and Referer reaches the same
    server before the page's no-referrer tag takes effect.
  - Details: `launch-rbm-test` `docs/react-port-notes.md`, decision 60.
- **On Supabase, the test project, 3 Nov** (`launch-forms-test`,
  `tbllmexjrmjwopgrfmce`, Free plan, region eu-west-1, in Kyler's personal
  organisation):
  - Set up with CLI 3.0.0: `link --yes`; `secrets set --env-file
    supabase/.env.test --yes` (6 secrets); `functions deploy api --use-api
    --yes`, with no Docker.
  - The deploy warned "Skipping import path outside source root:
    /assets/email/unitaid-logo.png". The scanner took `LOGO_PATH`, an
    address string in `mail.mjs`, for an import. Harmless: only the update
    email loads the hosted logo, and it does not run here.
  - With curl:
    - unknown path 404;
    - no token 401 with the service's own message (so the login check is
      really off);
    - wrong token 401;
    - a preflight from `localhost:3000` 204, with its CORS headers; from
      another site 405, with none;
    - a junk unsubscribe link 303 to LAUNCH's page.
  - Real emails:
    - feedback 200 with `LAUNCH-6AC08726`;
    - subscribing `delivered@resend.dev` (Resend's test inbox) 200
      `subscribed`, then `already`. The team notes went to the test inbox.
  - The answer came from the `ap-southeast-1` edge; the function runs where
    the request lands.
- **Not verified:** a real welcome email opened in a mail app, its unsubscribe
  link through the React version's page, and a mail app's one-click
  unsubscribe.

---

## 4. Deferred, open, and found in passing

- **The unsubscribe pages** (§2.2): LAUNCH's `unsubscribe.html` (static,
  posts `{ t }` to the service with CORS), and the RBM module's page plus its
  pass-along route. A link that cannot be read (cut short, or tampered)
  names no site, so its GET goes to LAUNCH's page; the tester confirmed this
  on 3 Nov. Until LAUNCH's page exists, such a reader lands on a missing
  page. Until they exist, the link in a new welcome email leads
  to a missing page; the mail app's one-click button works.
- **RBM's module routes** (`/api/unitaid/subscribe`, `/api/unitaid/feedback`,
  `/api/unitaid/unsubscribe`) and the React version's switch away from
  `NEXT_PUBLIC_LAUNCH_FORMS_URL`. That is a separate change in the React
  version's repo, coordinated with Oakkar.
- **RBM's paths are assumed:** `/en/unitaid` and `/en/unitaid/unsubscribe`,
  from the module folder `src/app/[locale]/unitaid/`. Confirm with RBM.
- **Old links after the switch:** links emailed from Vercel point at
  `https://launch-development-test.vercel.app/api/unsubscribe?t=…`. When
  `api/` goes, that path needs a redirect to the service that keeps the
  method (307/308, so a one-click POST stays a POST).
- **Rate limiting:** still none, as on Vercel, where the firewall rule was
  never set (email-backend-notes.md §2.9). With RBM's server in between,
  every request arrives from one address, so a per-visitor limit needs RBM's
  route to forward the visitor's IP. A counter kept in memory would not hold,
  because each request may run in a fresh isolate (Supabase's architecture
  page: "No persistent state"). The documented example uses Upstash Redis;
  Pro's Postgres database could hold a counter instead. Supabase's own
  examples read the visitor's IP from `x-forwarded-for`, but no page
  guarantees it, or says whether a value the caller sends is overwritten.
- **A 500 carries no CORS header,** so a site's page cannot read its message
  (it shows its own generic failure, as it does for every error).
- **The update email's preview** still goes to `ADDRESSES.to` in
  `api/_mail.js` (one developer's address). It moves to a GitHub secret when the
  team inbox becomes the WHO mailbox, for the same reason as §2.4.
- **`localhost:3000` in `SITES`** is for testing; remove it once the React
  version has been tested on RBM's host.
- **The production `UNSUBSCRIBE_SECRET`:** it must be copied from wherever
  it was saved when it was set on Vercel (made with `openssl rand -hex 32`);
  Vercel may not show it again. Without it, links already emailed break. That
  matters only if real people have subscribed.
- **Mail tests in CI:** `test-mail-api.js` never ran in CI; whether
  `test-forms-service.mjs` should is open.

---

## 5. Status

- Branch `forms/supabase`, from `main` at `11681f2`, pushed 3 Nov
  (KylerXiv), and merged into `main` the same day as PR #137 (`d007738`).
  `main` (to Oakkar's #136) and `docs/handoff-nov-3` were merged into it
  first. The only conflict was `i18n/content.en.json`, a generated file,
  which was resolved by regenerating it (`assemble-content.js --check`:
  current; the dry run translates exactly the 12 new keys).
- Commits:
  - `7cb9779`, Stage 1: `supabase/` (new: `config.toml`,
    `functions/api/index.js`, six files in `functions/_shared/`),
    `scripts/test-forms-service.mjs` (new), this document (new),
    `.gitignore` (+7 lines: Supabase's local files and secrets);
  - `cc3c69a`, Stage 2, LAUNCH side (§2.9): `i18n/ui.en.json`,
    `i18n/ui.page-forms.json`, `i18n/content.en.json`,
    `scripts/test-build-rbm-messages.js`;
  - `851160a`: `RESEND_SEGMENT_ID`, and Stage 3 (§3).
- The React side is on `launch-rbm-test` branch `feat/forms-relay`
  (`55c66c1`; the page in French and Portuguese since `c03823c`), on
  `feat/data-route`. It is pushed, with no pull request, and
  is not mergeable into that repo's `main` (handoff §0).
- The test project `launch-forms-test` (`tbllmexjrmjwopgrfmce`) is live with
  this code. Its secrets are in `supabase/.env.test` on Kyler's Mac only.
- CI: `validate.yml` passed on `cc3c69a` (3 Nov), and on the pull request.
- Next: handoff §0, "Still to do", item 2.
