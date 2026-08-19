# Italian Shadowing Studio v1.4.0

## v1.4.0 notes — shadow straight from the Generate tab

Generated sentences are now playable where they appear. The set shows as cards
with the same controls as Study — repeat, speed, pause, playback mode with loops,
Start/Pause, sentence navigation and tap-to-jump — so you can shadow a set the
moment it arrives.

Use **✕ Drop** to remove any sentence you do not want, then **Save to library**
to file the rest. Saving leaves the set on screen and playing.

## v1.3.0 notes — private sentence generator

The Generate tab now works through a small relay you host yourself on
Cloudflare, rather than calling an AI provider straight from the browser.
Google does not accept requests made directly by a web page, and this also
keeps your API key out of the browser entirely.

**Setting it up is a one-off, browser-only job — see `SETUP-GENERATOR.md`.**

In Settings you enter two things: your generator's address and a passphrase
you invent. No provider key is stored in the app.

## v1.2.0 notes — Generate tab

A new **Generate** tab writes fresh shadowing sentences around any word or expression you want to drill.

Enter the target expression, pick the number of sentences, the tense or mood, and the register. The sentences are written into the standard corpus template — the same twelve columns as the Italian Subjunctive and Pronominal Verbs CSVs — and then read back through the ordinary CSV importer, so a generated set behaves exactly like a hand-made one.

Saved sets go into the book **Generated**, one chapter per target word, in groups of ten. Generating the same word twice continues the numbering rather than overwriting. **Download CSV** saves the set as a file if you would rather edit it in a spreadsheet first.

### Setup

Settings → *AI sentence generation (OpenAI)*: paste an OpenAI API key, adjust the model name if needed, and set *Save locally* to keep it on this browser.

The key is held in this browser only and sent directly to OpenAI. Note that a key saved into a publicly deployed copy of the app is readable by anyone who opens that copy — for a public or paid release, move the call behind a small server-side proxy instead.

Generated Italian is usually sound but is not guaranteed. Read a set through before drilling it.

## v1.0.3 notes

This build keeps the v1.0.2 loop controls, but fixes a playback issue where the first sentence could speak and later sentences could advance visually without speaking. It also updates the service-worker cache name so GitHub Pages/iPad browsers are more likely to fetch the new code after deployment.


## v1.0.2 notes

Playback now separates repeat count from loop mode again.

- **Repeat each sentence** controls how many times each sentence is spoken before moving on.
- **Playback mode** controls the range and whether it loops.

The default mode is hands-free progression through the current group, with 1.0× speed and a short pause.

ElevenLabs requests now have a timeout. If ElevenLabs stalls or fails, the app falls back to the system voice instead of hanging indefinitely.

## Deployment

Replace the existing GitHub Pages files as a set, commit to `main`, push to GitHub, then allow GitHub Pages time to redeploy.

If the old version remains visible, unregister/clear the service worker or remove website data for the app, especially on iPad/iPhone.
