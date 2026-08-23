# Verb table generator

The 112-verb table in `app.js` is generated, not hand-written. This is where it
comes from, kept in the repository so the table can be rebuilt and re-checked.

- `conjugator.mjs` — rule-based Italian subjunctive conjugator. Present
  subjunctive is derived from the first-person singular present indicative
  stem; imperfect subjunctive from the infinitive. Irregulars are stored as a
  stem pair, not as four tables.
- `test-conjugator.mjs` — validates the rules against the 46 verb tables that
  were originally written by hand. Run `node test-conjugator.mjs`. Two entries
  (`finire`, `vivere`) are declared corrections rather than matches; any other
  mismatch fails.
- `build-verbs.mjs` — regenerates `verbs.generated.json`.
- `verbs.generated.json` — the data that was folded into `Verb.V`.
- `REPORT.md` — validation report, including the list of judgements a human
  Italian speaker should check.

To add verbs: extend the tables in `conjugator.mjs`, run the test, run the
build, then fold the JSON into `Verb.V` in `app.js`.
