# Shadowing Studio v1.10.2 Stabilization Release Guide

**Author:** Manus AI

**Release type:** Pronunciation-free stabilization

**Baseline:** Public `main` branch at the start of implementation

## Release decision

Version 1.10.2 is suitable for maintainer review and staged deployment. It deliberately excludes the proposed pronunciation feature and all related corpus data. The release focuses on the verified security, accessibility, playback, recovery, offline-update, and regression-test issues identified in the application assessment.

The source package is not a native iOS or Android application. It remains an installable progressive web app and a stronger foundation for a later Capacitor pilot. The major native-readiness improvement in this release is separation of billable provider credentials from the browser, explicit media-player ownership, complete local backup, and deterministic release/update behavior.

## Delivered changes

| Domain | Delivered behavior |
|---|---|
| Pronunciation scope | Preview markup, renderer code, controls, styles, and tests are removed. No pronunciation corpus or derived data is included. |
| Provider security | Gemini and ElevenLabs keys remain Worker secrets. Premium speech uses the authenticated `/tts` relay route. |
| Client secrets | The shared relay passphrase is held in `sessionStorage`; legacy persistent values are migrated once and removed. |
| Relay validation | The Worker rejects unknown fields, invalid types, unsupported origins, oversized bodies, invalid counts, unapproved speech voices/models, malformed provider output, and oversized audio. |
| Abuse response | The Worker supports the native `RATE_LIMITER` binding plus independent generation and speech emergency switches. Cloudflare documents that this binding returns a `success` result and is permissive/eventually consistent, so provider spending limits remain a necessary second control.[1] |
| Browser policy | Inline scripts are removed. The app contains a restrictive in-document CSP fallback and an optional `_headers` response policy for compatible hosts. |
| CSV safety | Exported spreadsheet cells beginning with formula-trigger characters are neutralized without changing the in-app values. |
| Accessibility | Native semantic controls, keyboard tabs, dialog focus containment, focus restoration, labels, live regions, contrast, visible focus, and 44-pixel targets are implemented. |
| Media controls | Study, Verb Drill, and Generate use one explicit active-player owner for lock-screen/headset Play, Pause, and Stop. |
| Recovery | Versioned complete JSON backup and validated atomic restore cover learner-created data and non-secret preferences. |
| Destructive flow | Clearing local data requires the exact phrase `DELETE ALL` and clears sentences, metadata, cache, non-secret preferences, and residual legacy secrets. |
| Offline delivery | The complete shell is pre-cached; navigation is network-first with offline fallback; updates wait for user approval. |
| Repository hygiene | Pinned test dependencies, lockfile, CI, `.gitignore`, security policy, static-header template, version utility, and relay configuration example are included. |

## Deployment order

Deploy the relay before the static app if premium speech or Generate will be enabled. This avoids exposing a new client that expects `/tts` before the Worker supports it.

| Step | Maintainer action | Verification |
|---|---|---|
| 1 | Create a backup of the current repository and live Worker configuration. Rotate any credential that may previously have been entered into a browser or committed elsewhere. | Confirm provider dashboards show the new keys and old keys are disabled. |
| 2 | Deploy the revised `worker.js`. Set `ALLOWED_ORIGIN`, `APP_TOKEN`, `GEMINI_API_KEY`, and optionally `ELEVENLABS_API_KEY` plus `ELEVENLABS_VOICE_IDS`. | `GET` returns the relay health object. A foreign Origin is rejected. |
| 3 | Configure the `RATE_LIMITER` binding using `wrangler.example.jsonc` as a starting point. Enable provider budgets, alerts, and spending limits independently. | A test environment returns HTTP 429 after the configured quota. |
| 4 | Test sentence generation with an approved Origin and the new passphrase. If premium speech is enabled, test one approved and one deliberately unapproved Voice ID. | Approved calls succeed; unapproved voice/model requests return HTTP 400. |
| 5 | Deploy the complete static release folder as one unit. Do not mix files from different versions. | The red mismatch banner remains hidden; the visible version is 1.10.2. |
| 6 | Open the app online once, allow service-worker installation, and reload. Then test an offline reload of both `/` and `/index.html`. | Both routes load the app shell offline. |
| 7 | Import a disposable corpus, create a bookmark and note, download a complete backup, mutate the library, and restore the backup. | The sentence, bookmark, note, hierarchy titles, and preferences return; cached audio does not. |
| 8 | Test Study, Verb Drill, Generate, Focus mode, keyboard navigation, and lock-screen/headset controls on at least one phone and one desktop browser. | The active player alone responds to Play, Pause, and Stop. |

## User-facing migration behavior

An existing `v08relayToken` in local storage is copied into session storage once and then deleted. This supports the first load after upgrading, but the passphrase intentionally disappears when the browser tab or session ends. Users who rely on Generate or premium speech will therefore need to re-enter the relay passphrase in a later session. The non-secret relay address may still be saved.

Direct browser-side ElevenLabs keys are no longer accepted. Existing `v08key` values are deleted by the migration. Before deploying, ensure the ElevenLabs key is configured as a Worker secret and each intended Voice ID appears in `ELEVENLABS_VOICE_IDS`.

The complete backup format is new in 1.10.2. CSV imports and exports continue to work, but CSV is not a complete device backup because it cannot represent all hierarchy titles and application preferences.

## Verification evidence

Nine automated suites pass **352 checks**. The suite runs release-integrity, Study/Library/Verb, Generate, relay, accessibility, media-session, backup, service-worker, and responsive-flow tests. The final static scan also passes JavaScript syntax validation, finds no embedded provider-secret pattern or dangerous dynamic-execution primitive, and reports no known dependency vulnerabilities.

| Mobile Lighthouse category | Final score |
|---|---:|
| Performance | 97 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

The measured Core Web Vitals proxies were FCP **2.1 s**, LCP **2.3 s**, total blocking time **60 ms**, and CLS effectively **0.0002** in the final audit. Remaining Lighthouse performance opportunities concern optional minification, unused code in the single application bundle, and render-blocking delivery; none blocks the stabilization release.

## Known limits and deferred work

The relay still uses one shared application passphrase rather than per-user authentication. Rate limiting and provider budgets reduce abuse impact but do not turn the shared token into user identity. A commercial multi-user release should add per-user authentication and per-account quotas.

The application logic remains concentrated in a large `app.js`. The stabilization work adds behavioral boundaries but does not perform the larger module split recommended before native development. The next architecture phase should separate storage, playback, speech, backup, library, generator, and platform adapters while preserving the current regression suite.

Provider-live end-to-end tests were not executed with production Gemini or ElevenLabs credentials. The Worker’s request and response contracts were exercised through deterministic stubs. Conduct a limited live smoke test in a non-production Worker environment before public rollout.

The pronunciation feature remains deferred. When licensing is established, begin from the revised pronunciation specification rather than restoring the removed preview code. Keep pronunciation metadata separate from canonical sentence text, validate all annotations, retain plain text for assistive technology, and avoid bundling corpus data until provenance and licence obligations are settled.

## Rollback

If the static release must be rolled back, deploy the previous complete static folder rather than individual files. If the Worker must be disabled without a deployment, set `GENERATION_DISABLED=true` and `TTS_DISABLED=true`; both routes return a retryable service-unavailable response. Do not restore direct browser provider keys as a fallback.

Before rollback, ask affected users to download a complete backup if the current version remains functional. The IndexedDB database name is unchanged, so the previous app may still see sentence records, but older versions do not understand the new complete-backup workflow or the session-only relay policy.

## References

[1]: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ "Cloudflare Workers — Rate Limiting API"
