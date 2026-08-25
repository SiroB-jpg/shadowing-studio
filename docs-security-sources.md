# Security implementation sources

- Cloudflare Workers Rate Limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ (accessed 2026-08-24). The binding is configured under `ratelimits`, exposed on `env`, and called as `await env.RATE_LIMITER.limit({ key })`, which returns an object containing `success`. Current supported fixed periods are 10 or 60 seconds. Cloudflare describes the counters as permissive/eventually consistent and recommends a stable user or API-key identifier rather than IP addresses when possible.
