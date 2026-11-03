// The forms service's one entry point: a Request in, a Response out. The
// host's wrapper (functions/api/index.js on Supabase) calls this with the
// request and its settings; the tests call it the same way.
//
// The paths are the ones api/ answered on Vercel, so a page or route that
// posted to <host>/api/subscribe posts to <FORMS_BASE_URL>/api/subscribe. On
// Supabase the function is named "api", and the platform may hand it the path
// with or without its own /functions/v1 prefix, so only the end is matched.

import { reply } from "./mail.mjs";
import { subscribe } from "./subscribe.mjs";
import { unsubscribe } from "./unsubscribe.mjs";
import { feedback } from "./feedback.mjs";

const ROUTES = { subscribe, unsubscribe, feedback };

export async function handle(request, env) {
  const m = /(?:^|\/)api\/([a-z]+)\/?$/.exec(new URL(request.url).pathname);
  const route = m && Object.prototype.hasOwnProperty.call(ROUTES, m[1]) ? ROUTES[m[1]] : null;
  if (!route) return reply(404, { ok: false, error: "Not found." });
  try {
    return await route(request, env);
  } catch (err) {
    // The error's name only: a message could quote the submission.
    console.error(`[${m[1]}] unexpected error: ${err && err.name}`);
    return reply(500, { ok: false, error: "Something went wrong." });
  }
}
