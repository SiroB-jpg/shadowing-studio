# Setting up the secure relay

Shadowing Studio uses one small Cloudflare Worker for sentence generation and, optionally, ElevenLabs speech. The Worker keeps both provider keys out of the browser, rejects unapproved request fields, accepts requests only from the configured app origin, and can use Cloudflare’s native rate-limit binding.

## Available configurations

| Configuration | What works | Trade-off |
|---|---|---|
| System voice only | Study, Verb Drill, Generate, offline shell, and browser speech | Simplest. Configure only Gemini if you want Generate; speech quality depends on the device. |
| Secure premium speech | Everything above plus relayed ElevenLabs audio and pre-download | Requires an ElevenLabs key and explicit voice allowlist on the Worker. The provider key never enters the app. |

## 1. Create provider credentials

Create a Gemini API key at <https://aistudio.google.com/apikey>. If you want premium speech, also create an ElevenLabs API key and identify the exact Voice ID or IDs that this app may use.

Create a long, random relay passphrase. Treat it as a billable service credential: do not commit it to the repository, post it publicly, or reuse an account password.

## 2. Deploy `worker.js`

Create a Cloudflare Worker and replace the starter source with this repository’s `worker.js`. Deploy it, then add these settings under the Worker’s variables and secrets.

| Name | Type | Required | Value |
|---|---|---:|---|
| `GEMINI_API_KEY` | Secret | For Generate | Gemini key |
| `APP_TOKEN` | Secret | Yes | Long random relay passphrase |
| `ALLOWED_ORIGIN` | Text | Yes | Exact origin, such as `https://sirob-jpg.github.io`; no trailing slash |
| `ELEVENLABS_API_KEY` | Secret | For premium speech | ElevenLabs provider key |
| `ELEVENLABS_VOICE_IDS` | Text | For premium speech | Comma-separated approved Voice IDs |
| `GEMINI_MODEL` | Text | No | Defaults to `gemini-3.6-flash` |
| `GENERATION_DISABLED` | Text | No | Set to `true` for an emergency Generate kill switch |
| `TTS_DISABLED` | Text | No | Set to `true` for an emergency premium-speech kill switch |

The Worker refuses to start billable generation if its exact allowed origin or required provider secret is missing. CORS is still a browser control rather than authentication; the passphrase and rate limiter protect the billable routes.

## 3. Add rate limiting

Configure a Cloudflare Workers Rate Limiting binding named `RATE_LIMITER`. Cloudflare documents the binding and `limit({ key })` API at <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>.

A conservative personal-use starting point is 30 calls per 60 seconds. Use your own positive integer namespace ID, unique within the Cloudflare account when counters should remain independent.

```jsonc
{
  "main": "worker.js",
  "compatibility_date": "2026-08-24",
  "ratelimits": [
    {
      "name": "RATE_LIMITER",
      "namespace_id": "1001",
      "simple": {
        "limit": 30,
        "period": 60
      }
    }
  ]
}
```

The Worker uses separate keys for generation and speech. The native rate limiter is intentionally an abuse brake, not exact billing accounting; also configure provider-side spending limits and alerts where available.

## 4. Connect the app

Open **Settings → Sentence generator** and enter the Worker address and relay passphrase. Choose whether to remember the address, then select **Use generator settings**.

The address may be saved because it is not secret. The passphrase remains in session storage and is removed when the browser tab/session ends. Legacy releases’ persisted relay passphrases are migrated into the current session once and deleted from persistent storage.

For premium speech, enter an allowed Voice ID under **Settings → ElevenLabs**, choose an approved model, and select **Save voice settings**. There is no provider-key field: the ElevenLabs key exists only on the Worker.

## 5. Verify both routes

First generate ten sentences for a word such as `farcela`. Then select ElevenLabs as the voice and play one sentence. An unapproved Voice ID must return an error and fall back to the system voice; an approved Voice ID should play and cache the returned audio locally.

## Troubleshooting

| Message | Likely cause |
|---|---|
| Passphrase does not match | `APP_TOKEN` and the app’s session passphrase differ. |
| Relay is configured for another address | `ALLOWED_ORIGIN` does not exactly match the app’s origin. |
| Generator address must use HTTPS | The app rejects non-HTTPS remote relay endpoints. Localhost HTTP remains available for tests. |
| Voice ID is not approved | Add the exact ID to `ELEVENLABS_VOICE_IDS` and redeploy. |
| Too many requests | The rate limiter rejected the route; wait and check for unexpected traffic. |
| Temporarily disabled | A kill switch is active. |
| Provider allowance used up | Review provider quotas, spending limits, and alerts. |

## Operational checklist

Rotate `APP_TOKEN` and provider keys if they may have leaked. Keep `ALLOWED_ORIGIN` exact, keep the voice allowlist minimal, enable Worker logs without recording request text or secrets, configure provider spending alerts, and test both kill switches before a public release.
