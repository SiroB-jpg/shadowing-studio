# Italian Shadowing Studio v1.10.2

Italian Shadowing Studio is an **offline-first progressive web app** for practising Italian through repeated listening and shadowing. It provides a local sentence library, configurable Study playback, Focus mode, a 112-verb subjunctive drill, optional sentence generation, and optional premium speech through a private relay.

> **Pronunciation annotations are intentionally excluded from v1.10.2.** The earlier preview has been removed, no pronunciation corpus is distributed, and no pronunciation data is exported in complete backups. The feature can be reintroduced after its source-data licensing and linguistic review are complete.

## What v1.10.2 changes

This is a stabilization release rather than a feature release. It preserves the existing learning workflows while addressing the security, accessibility, recovery, playback, release, and test issues identified in the application assessment.

| Area | Stabilization result |
|---|---|
| Security | Provider keys remain on the relay; the browser passphrase is session-only; relay requests use strict schemas, size limits, origin checks, optional native rate limiting, allowlisted premium voices/models, and emergency switches. |
| Accessibility | Native buttons now power sentence and library selection; tabs support arrow-key navigation; dialogs trap and restore focus; form labels, live regions, contrast, visible focus, and 44-pixel targets are corrected. |
| Playback | Lock-screen and headset actions now remain bound to the active Study, Verb, or Generate player. Only one player owns playback at a time. |
| Recovery | A versioned complete JSON backup preserves sentences, bookmarks, notes, hierarchy titles, and non-secret preferences. Restore is validated and atomic; cached audio and secrets are excluded. |
| Destructive actions | Clearing local data requires typing `DELETE ALL`; the interface recommends downloading a complete backup first. |
| Offline updates | The service worker pre-caches the complete shell, uses network-first navigation with offline fallback, and waits for the user to approve a ready update. |
| Release hygiene | One version utility updates HTML, JavaScript, CSS, service-worker, and package markers. GitHub Actions runs the complete regression suite. |
| Verification | Nine suites pass **352 checks**. Final mobile Lighthouse scores are **97 Performance, 100 Accessibility, 100 Best Practices, and 100 SEO**. |

## Running the app

The production app has no runtime package dependencies. Serve the repository over HTTP or HTTPS; do not rely on `file://` when testing installability, offline caching, or service workers.

For development and regression testing, install the pinned development dependencies and run the complete suite:

```bash
npm ci
npx playwright install chromium
npm test
```

The tests use `CHROMIUM_PATH` when a system Chromium executable is preferred:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm test
```

## Library data and recovery

CSV remains the editable interchange format for corpus content. Use **Manage library → Import CSV** to add or update sentences, and **Export CSV** when you need a spreadsheet-friendly corpus copy. Spreadsheet exports neutralize leading formula characters to reduce formula execution risk when opened in spreadsheet software.

Use **Download complete backup** for device migration or disaster recovery. The JSON backup includes local sentences, bookmarks, difficulty flags, notes, book and chapter titles, and non-secret preferences. It intentionally excludes relay passphrases, provider keys, cached premium audio, and pronunciation data. Restore validates the schema and every sentence before replacing the IndexedDB library in one transaction.

## Sentence generation and premium speech

Both optional network features use the same private Cloudflare Worker relay. The app sends only structured generation fields or premium-speech text, approved voice ID, and approved model. Gemini and ElevenLabs provider credentials remain Worker secrets and are never entered in the browser.

Follow [`SETUP-GENERATOR.md`](SETUP-GENERATOR.md) to deploy the relay. A safe starting configuration is provided in [`wrangler.example.jsonc`](wrangler.example.jsonc). Public deployments should use an exact `ALLOWED_ORIGIN`, a long random `APP_TOKEN`, the native `RATE_LIMITER` binding, provider spending limits, a minimal `ELEVENLABS_VOICE_IDS` allowlist, and the supplied emergency kill switches.

The app works without the relay. On first use it defaults to the browser’s Italian system voice; Generate and premium speech remain unavailable until the relay settings are supplied.

## Release process

Set the next semantic version through the version utility rather than editing markers by hand:

```bash
npm run version:set -- 1.10.3
npm test
```

The utility synchronizes `index.html`, `app.js`, `styles.css`, `sw.js`, and `package.json`. Commit and deploy the complete folder as one release. The app will warn when runtime version markers do not agree, and a waiting service-worker update is presented through the **Update now** banner rather than being forced during an active study session.

GitHub Pages supports the in-document Content Security Policy fallback. Hosts that support static response-header configuration should also deploy [`_headers`](_headers) to enable the stronger response-level policy, including frame protection and permissions restrictions.

## Repository security

Read [`SECURITY.md`](SECURITY.md) before reporting or handling a vulnerability. Do not commit `.dev.vars`, `wrangler.jsonc`, provider keys, relay passphrases, browser data exports, or other secrets. The supplied `.gitignore` excludes the common local secret and test-artifact paths.

## Project structure

| Path | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js`, `boot.js` | Static application shell, styles, application logic, and secure bootstrap/update behavior. |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA installation, offline shell, and app identity. |
| `worker.js` | Cloudflare relay for sentence generation and optional premium speech. |
| `SETUP-GENERATOR.md`, `wrangler.example.jsonc` | Relay deployment and hardening guidance. |
| `scripts/set-version.mjs` | Reproducible release-version synchronisation. |
| `tests/` | Functional, relay, accessibility, media, backup, offline, responsive, and release-integrity suites. |
| `.github/workflows/ci.yml` | Automated regression execution on pushes and pull requests. |

## Licence

No software licence file existed in the public repository at the start of this stabilization work. Add a software licence before inviting reuse or external contributions. This release does not include the proposed Wiktionary/WikiPron-derived pronunciation corpus or its licensing materials.
