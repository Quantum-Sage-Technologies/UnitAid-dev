# Translations from professional translators

One folder per delivery, named by the date it was imported. Each holds the
files exactly as the translators sent them and `imported.json`, written by
`scripts/import-xliff.js`: each file's sha256 and counts, and the text taken
per key (`key(English)`, as in `i18n/translations.json`) and language.

- Which lines did a person write? The keys in `imported.json`.
- A value was overwritten (a new engine target, a hand edit):
  `node scripts/import-xliff.js i18n/translator/*/*.xlf`, oldest first.
- What to send the translators next: `node scripts/export-xliff.js --out <folder>`.

Notes: `docs/translation-notes.md`, "Professional translations".
