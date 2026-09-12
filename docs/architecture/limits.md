# Limits

Concrete numeric bounds, where each is enforced, and how to change it.

| Limit | Value | Enforced in | Env override |
|---|---|---|---|
| List page size | max 200 | OpenAPI `page_size` schema (`lib/openapi.ts`, `PageQuery`) | — |
| Catalog walk | max 500 resources | `AragClient.listResourceIds({ pageSize: 100, max: 500 })`, called from `services/calls.ts`'s `catalogIds()` | — (code change; see [Scaling](scaling.md)) |
| Question length | 3–500 characters | OpenAPI `AskRequest.question` schema, re-checked against `CALLS_MAX_QUESTION_CHARS` in `app/api/v1/calls/[id]/ask/route.ts` | `CALLS_MAX_QUESTION_CHARS` (default 500) |
| Upload size | 100 MB | `MAX_RECORDING_BYTES` in `app/api/v1/calls/route.ts` (route-level `bodyLimit`), backstopped by `MAX_BODY_BYTES` | `MAX_BODY_BYTES` (default 104,857,600 — 100 MB) |
| Upload MIME allowlist | `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/mp4`, `audio/ogg`, `audio/webm`, `video/mp4`, `video/webm`, `video/quicktime` | `ALLOWED_RECORDING_TYPES` in `app/api/v1/calls/route.ts` | — |
| Media `field` allowlist | `media`, `transcript` | OpenAPI enum + `MEDIA_FIELD_ALLOWLIST` in `services/calls.ts` (checked twice) | — |
| Cache TTL | 60 s | `services/cache.ts`'s `TtlCache`, constructed with `env.cacheTtlMs` in `lib/runtime.ts` | `CALLS_CACHE_TTL_MS` (default 60000) |
| Cache max entries | 2,000 | `TtlCache` constructor default (`services/cache.ts`) | — |
| Rate limit | 5 requests/sec, burst 20 (Fly deployment: 10/40) | `lib/api.ts`'s token bucket, per IP or API key | `RATE_LIMIT_RPS`, `RATE_LIMIT_BURST` |
| Job event cap | 200 events retained per job | Vendored `JobManager` default `maxEvents` (`vendor/arag-platform/src/store/jobs.ts`) — not overridden by this product | — (platform-level) |
| Job store cap | 500 job records retained | Vendored `Store` collection default `cap` (`vendor/arag-platform/src/store/jobs.ts`) | — (platform-level) |
| Job concurrency | 2 concurrent jobs | `new JobManager(store, log, { concurrency: 2 })` in `lib/runtime.ts` | — (code change) |
| Log ring buffer | 500 records in memory | `new Logger({ ringSize: 500 })` in `lib/runtime.ts`, surfaced at `GET /api/v1/admin/logs` | — (code change) |
| Admin logs page size | max 500 per request | OpenAPI `limit` schema on `GET /api/v1/admin/logs` | — |
| REMi scoring timeout | 12,000 ms (12 s) | `REMI_TIMEOUT_MS` in `services/ask.ts` — a `Promise.race` against the `/predict/remi` call | — (code change) |
| ARAG request timeout | 60,000 ms (60 s) | `AragClient` constructor option, sourced from env | `ARAG_TIMEOUT_MS` (default 60000) |
| Ask route max duration | 120 s | `export const maxDuration = 120` in `app/api/v1/calls/[id]/ask/route.ts` (Next.js route segment config) | — |
| Job events SSE max duration | 300 s | `export const maxDuration = 300` in `app/api/v1/jobs/[id]/events/route.ts` | — |
| Mock demo corpus size | 12 calls (plus 1 platform sample) | `CALLS_MOCK_SEED`, read in `lib/runtime.ts` | `CALLS_MOCK_SEED` |
| Title / metadata field lengths | title 200 chars; `agent_name`/`member_id`/`queue` 120 chars; `created` 40 chars | `field()` helper in `app/api/v1/calls/route.ts` and the OpenAPI multipart schema | — |
| Label filter string length | 120 chars per value | OpenAPI `label` query parameter schema | — |
| Search query length | 200 chars | OpenAPI `q` query parameter schema | — |

Most limits are read from `.env` and surfaced (already redacted where sensitive) on
`GET /api/v1/admin/config`, which the `/admin/config` page renders directly — that page is the
fastest way to confirm what a given deployment is actually running with, rather than trusting
this table's defaults blindly.
