# Tests

A regression net for the behaviour the app has today, so that the UI redesign
can proceed without silently changing how anything works.

## Running them

Needs Node 18+ and Playwright with a Chromium build.

```
npm install playwright        # once
node tests/run-all.mjs        # all three suites, one verdict
node tests/test-study.mjs     # or a single suite
```

If Chromium is somewhere unusual, set `CHROMIUM_PATH`. Otherwise Playwright's
own download is used.

The suites serve the app over a local web server and drive a real browser.
Nothing touches the network: the sentence-generation relay is stubbed, and
ElevenLabs is never called because the tests run on the system voice.

## What each suite covers

**test-study.mjs — 98 checks.** The pre-redesign behaviour of the library,
Study and Verb drill. CSV import including the Group/Item columns, the tree
and selectors, group and single display modes, search, sentence and group
navigation with its wrapping rules, all six playback scopes and their exact
item counts, the playback engine's start/pause/resume, mutual exclusion
between players, verb detection and conjugation building, all five verb drill
modes, bookmarks, the sentence editor, export, settings persistence, theme,
and Clear all.

**test-generate.mjs — 59 checks.** The Generate tab: the relay contract, the
CSV template round-trip, saving to the library, in-tab playback, dropping a
sentence, and every failure message the relay can produce.

**test-worker.mjs — 25 checks.** The Cloudflare relay itself, with Google
stubbed: passphrase and origin checks, request validation, count clamping,
error mapping, and the guarantee that the API key is never echoed back to the
browser.

## A note on timing

Headless Chromium has no speech voices, so utterances resolve instantly.
Where a test needs to observe playback while it is running, it sets a long
pause and a high repeat count first. This is a property of the test
environment, not of the app.

## Before every deployment

Run `node tests/run-all.mjs`. All three suites should pass. Then bump the
service worker cache name, and check the result on the iPad — its caching has
caught out every previous release.
