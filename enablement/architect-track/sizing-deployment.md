# Sizing and Deployment

What actually drives cost and latency in this product, the topology it ships with, and how to
size a real deployment. Every number and file path below is taken from this repo as it stands on
branch `mvp` — check `fly.toml`, `Dockerfile`, `.env.example` and `services/*.ts` alongside this
document.

## What drives cost and latency

### 1. ARAG calls per view, before and after caching

This is the dominant cost driver. Every screen ultimately does one or more `rt.arag.*` calls;
`services/cache.ts`'s `TtlCache` is the only thing standing between a page view and an ARAG request
per call shown.

| View | Uncached | Cached (warm, within `CALLS_CACHE_TTL_MS`) |
|---|---|---|
| Calls list (`GET /api/v1/calls`, N calls on the page after filtering) | 1 (`listResourceIds`) + N (`getResource` per call) | 0 |
| Dashboard (`GET /api/v1/dashboard`, aggregates every call) | 1 + N (same shape, over the whole catalog, not just a page) | 0 (dashboard itself is a cached aggregate under its own key) |
| Category rails (client component, one `/api/v1/calls` fetch per rail) | Each rail repeats the "1 + N" catalog+summary pattern (mitigated by the shared per-id `summary:` cache — rail 2 doesn't refetch a call rail 1 already warmed in the same window) | 0 once warm |
| Call detail (`GET /api/v1/calls/{id}`) | 1 (`getResource` with full text + metadata) | 0 |
| Ask a question (`POST /api/v1/calls/{id}/ask`) | 1 cached `getCall` (404 pre-check) + 1 `askStream` (always live — never cached, it's a generative call) + 1 `remi` (always live, best-effort) | Same — grounded answers and quality scores are never cache candidates |

The audit that motivated `D-CA-04` measured **~600 ARAG requests for a single dashboard view at
200 calls** before this cache existed (rails multiplying the base N+1 pattern). The cache collapses
a browsing session (dashboard + a few rails + several call detail views, all within one TTL window)
to roughly one ARAG request per distinct call touched, not per view.

**Sizing implication:** ARAG request volume for *reads* scales with **distinct calls touched per
TTL window**, not with page views. A demo with 24 seeded calls costs at most ~25 ARAG requests per
cold TTL window regardless of how many times the dashboard is refreshed inside it. A production
tenant's read cost scales with **catalog size** (every call is a dashboard/rail candidate) far more
than with visitor count.

### 2. Tokens per ask

Each `POST /api/v1/calls/{id}/ask` call does one generative round-trip (`rt.arag.askStream`,
scoped to a single call's transcript via `resource_filters`) plus one `predict/remi` scoring call.
`services/ask.ts` taps the stream to record `rt.usage.tokensIn` / `tokensOut` (surfaced at
`GET /api/v1/admin/usage`) — use those live counters to build a real per-tenant cost model rather
than estimating from transcript length, since REMi's own token cost isn't visible client-side.
`CALLS_MAX_QUESTION_CHARS` (default 500) bounds the input side; the KB's generative model and
retrieval `top_k` bound the rest and are outside this product's control at the app-config level.

### 3. Transcription time

Recording upload (`POST /api/v1/calls`) returns immediately (`202`); the ingest job
(`services/jobs.ts`, `JOB_INGEST`) waits on `rt.arag.waitProcessed()` with a 10-minute timeout.
Transcription time is entirely ARAG-side and scales with recording length, not something this app
controls — but it is the reason ingestion is a poll/SSE job rather than a synchronous response, and
it's the number to ask a customer about when they describe "upload and immediately want to see it"
as a requirement.

## Machine sizing

`fly.toml` ships:

```toml
[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

with `min_machines_running = 1`, `auto_stop_machines = "stop"`, `auto_start_machines = true`, and a
concurrency policy of `soft_limit = 40` / `hard_limit = 80` requests. This is sized for a demo/pilot
tenant (the shipped 24-call seed, a handful of concurrent admin/demo users). It is **not** sized
for the 50,000-calls/month whiteboard scenario in `WORKSHOP.md` without at least one change (below).

**What actually consumes memory on this machine:**
- Next.js' standalone server process itself (baseline).
- `TtlCache`'s in-memory map, capped at 2,000 entries (`services/cache.ts`'s `TtlCache` constructor
  default `max = 2_000`) — bounded and small (JSON view models, not transcripts) even at full
  catalog size.
- In mock mode only, the in-process mock ARAG server and its seeded corpus (`CALLS_MOCK_SEED`) —
  irrelevant to a production sizing exercise, since a real deployment runs `ARAG_MOCK=0` against a
  live KB and never loads this.
- `MAX_BODY_BYTES` (default 100 MB) × concurrent uploads in flight — this is the real memory
  pressure point at higher ingestion concurrency, since each upload buffers into memory before
  `uploadFileField()` forwards it.

## The Fly topology this repo ships

```
                       ┌─────────────────────────────┐
   fly.io edge  ─────▶ │  call-analysis-arag (Fly app) │ ─────▶  ARAG KB (aws-us-east-2-1)
  (force_https)        │  1 machine, shared-cpu-1x/1gb │         (co-located region, iad)
                        │  Next.js standalone server    │
                        │  in-process TtlCache          │
                        │  in-process JobManager (×2)   │
                        └───────────────┬───────────────┘
                                        │
                                 [[mounts]] "data" 1gb
                                 DATA_DIR=/data (job records only —
                                 never call recordings/transcripts,
                                 which live in the KB)
```

`primary_region = "iad"` is chosen to co-locate with the KB's `aws-us-east-2-1` zone — the `fly.toml`
header comment states this explicitly. `DATA_DIR` holds only the `Store`'s JSON job records
(ingestion/provisioning job state), not any call content — every byte of transcript, recording, and
generated analysis lives in the ARAG Knowledge Box, not on the Fly volume. That's why the volume is
sized at 1 GB regardless of catalog size.

## What changes for multi-machine

This is the single most important sizing conversation to have explicitly with a customer, because
the current code has a documented limitation here (`D-CA-04`):

1. **Cache is per-machine.** Each Fly machine runs its own `TtlCache` instance. Two viewers hitting
   different machines within the same TTL window can see slightly different data (one has a warm
   cache reflecting a recent upload, one is still serving a load from just before it). This is a
   staleness-window widening, not a correctness bug — every write path (`invalidateCall`) still
   invalidates its own machine's cache immediately; it just can't invalidate a cache on a machine it
   isn't running on. **Fix, if required:** move the cache to a shared store (Redis, or ARAG's own
   catalog/`find` calls directly if the TTL can be dropped), or accept and document the
   multi-machine staleness window — genuinely acceptable for a KPI dashboard, less so if a customer
   has a hard "read your own write across any replica" requirement.
2. **Jobs are per-machine.** `JobManager` and its `DATA_DIR`-backed `Store` are process-local.
   `[[mounts]]` in `fly.toml` currently attaches one volume to one machine. Scaling to multiple
   machines means either: (a) each machine gets its own volume and job visibility is scoped to
   whichever machine handled the request (acceptable if `GET /api/v1/jobs/{id}` is always hit
   against the same machine — not guaranteed behind Fly's load balancer), or (b) the job store
   moves to a shared backend (e.g. a small Postgres/SQLite-over-network or a managed queue).
   **This is real work, not a config flag — flag it as a required change, not a switch.**
3. **Rate limiting is per-machine.** The token-bucket limiter (`lib/api.ts`, `buckets()`) lives on
   `globalThis` per process. Multi-machine means the effective per-IP rate limit is
   `RATE_LIMIT_RPS × machine count`, not the configured value. Acceptable for a soft limit meant to
   blunt abuse; worth disclosing if a customer is sizing rate limits for a compliance reason.
4. **Concurrency and health checks scale normally.** `http_service.concurrency` and the `/healthz`
   check in `fly.toml` work per-machine as designed — Fly's load balancer already spreads requests
   and stops routing to an unhealthy machine; nothing here needs to change to add machines from an
   HTTP-serving perspective, only from the cache/job/rate-limit perspective above.

## Worked example

**Scenario:** a mid-size regional health-insurance contact centre, 8,000 calls/month, ~15 admin
users, dashboard checked by ~40 supervisors a few times a day, no hard multi-region requirement.

- **ARAG read load:** 8,000 calls/month ≈ 270/day. At any given 60-second TTL window, the realistic
  "distinct calls touched" is bounded by how many calls a viewer's dashboard/rails/list touch at
  once — for an 8,000-call catalog, that's the full catalog on every cold dashboard load (N+1 by
  design once per TTL window per machine), so budget ~8,000 `getResource` calls per cold
  dashboard load, not per page view. With a 60 s TTL and bursty supervisor usage, this is a few
  cold loads per hour at most — comfortably inside typical KB rate limits, and a single machine's
  cache (max 2,000 entries) does **not** fully cover an 8,000-call catalog, so the oldest entries
  evict before their TTL in a busy period. **Action:** raise `TtlCache`'s `max` (currently a
  hardcoded default in `services/cache.ts`, not an env var — flag this as a code change needed
  past a few thousand calls, or accept more frequent re-fetches of the tail of the catalog).
- **Machine:** one `shared-cpu-1x` / 1 GB machine is very likely sufficient for this call volume
  and this admin headcount — the bottleneck at this scale is the cache-size ceiling above, not CPU
  or memory.
- **Volume:** 1 GB `DATA_DIR` is unaffected by call volume (job records only) — no change needed.
- **Ingestion:** 270 calls/day at an assumed 5x peak ratio is ~55/hour at peak, well inside
  `JobManager({ concurrency: 2 })`'s throughput for a transcription-bound wait (the job itself
  mostly polls; it doesn't hold CPU).
- **Recommendation to the customer:** single machine, default sizing, with one flagged follow-up —
  raise the in-process cache's entry cap before the catalog exceeds ~2,000 hot entries, and revisit
  this document's multi-machine section only if they later require horizontal scaling or true
  read-your-write consistency across replicas, neither of which this scenario needs.
