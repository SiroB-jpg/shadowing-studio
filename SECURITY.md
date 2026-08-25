# Security policy

## Supported version

Security fixes are applied to the latest release on the default branch. Older static releases and copied deployments should be upgraded rather than patched independently.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository owner through the contact method listed on the maintainer’s GitHub profile. Do not open a public issue containing active credentials, personal learning data, exploitable relay details, or a working proof of concept against a live deployment.

Include the affected version, the relevant URL or file, reproduction steps, expected and observed behavior, and the potential impact. A minimal redacted proof of concept is helpful. Do not access other users’ data, consume paid provider quota, or degrade the live service while testing.

## If a credential may have leaked

Rotate the affected Cloudflare `APP_TOKEN`, Gemini key, or ElevenLabs key immediately. Review provider and Worker logs, usage, spending limits, and alerts. The browser app must never contain a provider API key. The relay passphrase is session-only in v1.10.2, but it should still be rotated if exposed.

## Security boundaries

The static app stores the learning library, hierarchy titles, preferences, and optional cached speech audio locally in the browser. Complete backups intentionally exclude relay passphrases, provider API keys, cached audio, and pronunciation data. Sentence generation and optional premium speech use the authenticated relay described in `SETUP-GENERATOR.md`.

CORS restricts cooperating browsers but is not authentication. Public relay deployments should therefore use a long random `APP_TOKEN`, the native `RATE_LIMITER` binding, exact `ALLOWED_ORIGIN`, minimal `ELEVENLABS_VOICE_IDS`, provider spending limits, and the supplied emergency kill switches.
