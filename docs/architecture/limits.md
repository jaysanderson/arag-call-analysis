# Limits

Concrete numeric bounds, where each is enforced, and how to change it.

| Limit | Value | Enforced in | Env override |
|---|---|---|---|
| List page size | max 200 | OpenAPI `page_size` schema (`lib/openapi.ts`, `PageQuery`) | — |
| Catalog walk | max 500 resources | `AragClient.listResourceIds({ pageSize: 100, max: 500 })`, called from `services/calls.ts`'s `catalogIds()` | — (code change; see [Scaling](scaling.md)) |
| Question length | 3–500 characters | OpenAPI `AskRequest.question` schema, re-checked against `rt.env.maxQuestionChars` in `app/api/v1/calls/[id]/ask/route.ts` | `CALLS_MAX_QUESTION_CHARS` (default 500) — **editable in Settings → Limits**, 40–4,000 |
| Upload size | 100 MB | Route-level `bodyLimit` resolved per request from `rt.env.maxUploadBytes` (`app/api/v1/calls/route.ts`), backstopped by `MAX_BODY_BYTES` | `CALLS_MAX_UPLOAD_BYTES` (default 104,857,600 — 100 MB) — **editable in Settings → Limits**, 1 KiB–2 GiB; `MAX_BODY_BYTES` is the process-wide backstop |
| Upload MIME allowlist | `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/mp4`, `audio/ogg`, `audio/webm`, `video/mp4`, `video/webm`, `video/quicktime` | `ALLOWED_RECORDING_TYPES` in `app/api/v1/calls/route.ts` | — |
| Media `field` allowlist | `media`, `transcript` | OpenAPI enum + `MEDIA_FIELD_ALLOWLIST` in `services/calls.ts` (checked twice) | — |
| Cache TTL | 60 s | `services/cache.ts`'s `TtlCache`, constructed with `env.cacheTtlMs` in `lib/runtime.ts` and replaced by `applyToRuntime()` when the setting moves | `CALLS_CACHE_TTL_MS` (default 60000) — **editable in Settings → Limits**, 0–3,600,000 ms |
| Cache stale window | `max(9 × TTL, 5 min)` after expiry | `getOrLoadStale()`'s `graceMs` default (`services/cache.ts`), used by `catalogIds()` and `summaryOf()` | — (code change) |
| Cache max entries | 2,000 | `TtlCache` constructor default (`services/cache.ts`) | — |
| Rate limit | 5 requests/sec, burst 20 (Fly deployment boots with 10/40) | `lib/api.ts`'s token bucket, per IP or API key | `RATE_LIMIT_RPS` (0–10,000), `RATE_LIMIT_BURST` (1–100,000) — **both editable in Settings → Limits** |
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

## Settings, stores and the editable surface

| Limit | Value | Enforced in | Notes |
|---|---|---|---|
| Settings sections | `branding`, `connection`, `limits`, `retention` | OpenAPI `section` path enum on `/api/v1/settings/{section}` | Unknown body keys are rejected (`SettingsUpdateRequest` is `additionalProperties: false`) |
| ARAG request timeout (setting) | 1,000–300,000 ms | `validateConnection()` (`services/config.ts`) | `ARAG_TIMEOUT_MS` is the boot default |
| Branding text fields | 200 characters | `bounded()` in `services/config.ts`, mirrored by the OpenAPI schema | `productName` may not be empty |
| Branding URL fields | 500 characters, `https` or same-origin | `safeLogoUrl` via `validateBranding()` | `logoUrl`, `docsUrl`, `supportUrl` |
| Logo upload | 512 KB; `image/svg+xml`, `image/png`, `image/jpeg`, `image/webp` | `MAX_LOGO_BYTES` and the type map in `app/api/v1/settings/logo/route.ts` | Stored as `DATA_DIR/branding/logo.<ext>`; the other extensions are removed |
| Retention policy | 0–3,650 days (`0` = no limit) | `validateRetention()`; the OpenAPI `days` schema on the preview | There is no background sweeper |
| Purge batch | 200 calls per run | `MAX_PURGE_PER_CALL` in `services/retention.ts` | `ids` in the request body is also capped at 200 |
| API key name | 1–80 characters | `ApiKeyCreateRequest`/`ApiKeyUpdateRequest` and `createApiKey()` | |
| API key material | `ca_live_` + 24 random bytes, base64url | `generateKey()` (`services/apikeys.ts`) | Stored as a SHA-256 digest; returned once |
| API key last-used write | at most once per 60 s per key | `LAST_USED_THROTTLE_MS` (`services/apikeys.ts`) | Stops a read-only call becoming a disk write |
| Labelset id | `^[a-z][a-z0-9_]{1,48}$` | `ID_RE` in `services/taxonomy-store.ts` and the OpenAPI pattern | Immutable after creation |
| Labels per labelset | 60 | `MAX_LABELS_PER_SET` (`services/taxonomy-store.ts`) | Every label needs a description (≤ 500 chars), ≤ 10 examples of ≤ 300 chars |
| Agent prompt | 20–8,000 characters | `updateAgent()` (`services/taxonomy-store.ts`); OpenAPI caps it at 8,000 | Keyed by the destination field the operation writes |
| Saved views | 100 per deployment | `MAX_VIEWS` (`services/views.ts`) | Name ≤ 80 chars and unique case-insensitively; query ≤ 2,000 chars; description ≤ 200 |
| Saved-view parameters | 12 allowlisted keys | `VIEW_PARAMS` (`services/views.ts`) | `label` may repeat up to 30 times; each value ≤ 200 chars |
| Share link TTL | 1–90 days, default 7 | `ShareCreateRequest` and `services/shares.ts` | Token is 32 random bytes, base64url |
| Audit page size | max 500 per request, default 100 | OpenAPI `limit` on `GET /api/v1/admin/audit`, re-clamped in `listAudit()` | |
| Store collection caps | jobs 500 · apikeys 500 · taxonomy 200 · views 100 · shares 2,000 · audit 5,000 | The `cap` passed to `rt.store.collection(...)` in each service | The oldest rows are dropped first |
| Dashboard windows | `7d`, `30d`, `90d`, `12m`, `all` (default `all`), or explicit `from`/`to` | `DASHBOARD_RANGES` (`services/dashboard.ts`) and the OpenAPI enum | Named windows snap to whole UTC days |
| API explorer response body | 256 KB or 8 s, whichever comes first | `MAX_BODY_BYTES`/`MAX_BODY_MS` in `components/api/TryIt.tsx` | An SSE stream never ends on its own, and media can be tens of megabytes |

Most limits are read from `.env` at boot and, where the table says so, are **editable in Settings**
afterwards — at which point the store is the authority and the environment variable only supplies
the value a reset returns to. The fastest way to confirm what a deployment is actually running
with is `GET /api/v1/settings` (public, no secrets) for the editable set, and
`GET /api/v1/admin/config` — rendered by the operator console's Connection → Configuration view —
for the full redacted environment.
