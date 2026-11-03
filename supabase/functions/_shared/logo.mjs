// The Unitaid logo for emails, as base64: assets/email/unitaid-logo.png
// (240x84 PNG on white), byte for byte. A copy of api/_logo.js in the module
// format the forms service uses; generated, do not edit. The test "the inline
// logo is the same PNG as api/_logo.js" in scripts/test-forms-service.mjs
// fails if the two ever differ (docs/email-backend-notes.md §2.14 says how to
// regenerate api/_logo.js after changing the PNG).
//
// Kept in code rather than read from disk, so the function bundle cannot miss
// it: a missing file would stop every form, not just the logo.
export const LOGO_PNG_BASE64 =
  "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" +
  "RU5ErkJggg==";
