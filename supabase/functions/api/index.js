// The forms service on Supabase: one Edge Function, named "api", that hands
// every request to the shared code with the function's settings. Everything
// else — the routes, the checks, the emails — is in ../_shared/ and runs the
// same in the tests (scripts/test-forms-service.mjs).
//
//   https://<project>.supabase.co/functions/v1/api/subscribe
//                                              /api/unsubscribe
//                                              /api/feedback
//
// Its settings are the function's secrets (`supabase secrets set …`); the
// list is at the top of ../_shared/mail.mjs. Deploy with
//   supabase functions deploy api --project-ref <ref>
// See docs/forms-service-notes.md.

import { handle } from "../_shared/handle.mjs";

Deno.serve((request) => handle(request, Deno.env.toObject()));
