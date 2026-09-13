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
TTL window**, not with page views. The sample deployment (13 calls: `CALLS_MOCK_SEED`, default 12,
plus the platform's own sample) costs at most ~14 ARAG requests per cold TTL window regardless of
how many times the dashboard is refreshed inside it; the live demo Knowledge Box, at 24 calls,
costs ~25. A production tenant's read cost scales with **catalogue size** — every call is a
dashboard candidate — far more than with visitor count.

**Since D-CA-40 this is better than the table suggests, in one specific way.** `catalogIds()` and
`summaryOf()` are served **stale-while-revalidate**: past the TTL, within `graceMs`
(default `ttlMs × 9`), the expired value is returned immediately and refreshed behind the reader.
So the cost is unchanged — the same upstream requests are made — but it is no longer *paid by a
user waiting*. Only a genuinely cold key blocks. The dashboard aggregate is also no longer cached
under a key of its own; `aggregate()` is pure and O(N) and is recomputed per render, which means
every dashboard render re-warms exactly the entries the calls list reads next. Budget the request
volume from the table; budget the *latency* from the fact that a warm deployment does not block.

**And the cost of that:** the freshness bound a customer should be told is no longer
`CALLS_CACHE_TTL_MS` but `CALLS_CACHE_TTL_MS × 10` — ten minutes at the default, per machine. See
`enablement/architect-track/configuration-cache-and-sharing.md` §2.

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
concurrency policy of `soft_limit = 40` / `hard_limit = 80` requests. This is sized for a
demo/pilot tenant (a two-dozen-call catalogue, a handful of concurrent operator and demo users). It
is **not** sized for the 50,000-calls/month whiteboard scenario in `WORKSHOP.md` without at least
one change (below).

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
                                 DATA_DIR=/data — jobs, settings,
                                 API keys, taxonomy, views, shares,
                                 audit. Never call recordings or
                                 transcripts, which live in the KB.
```

`primary_region = "iad"` is chosen to co-locate with the KB's `aws-us-east-2-1` zone — the
`fly.toml` header comment states this explicitly.

### What `DATA_DIR` actually holds now — read this before sizing or planning backups

It is no longer "job records". It is the **deployment's own state**, in seven JSON collections:

| Collection | File | Cap | What is lost with the volume |
|---|---|---|---|
| `jobs` | `jobs.json` | 500 | Ingestion/provisioning history |
| `settings` | `settings.json` | 1 doc | Every in-product configuration override — **including, if the operator rotated it there, the Knowledge Box service-account credential** (D-CA-45; the file is `chmod 0600`) |
| `apikeys` | `apikeys.json` | 500 | Every issued API key's digest and revocation state. Losing it does **not** leak keys (they are SHA-256 digests) but it does silently reopen the API, because `apiKeysEnforced()` reads this file |
| `taxonomy` | `taxonomy.json` | 200 | Every labelset and agent customisation. Recreated from the shipped seed on next boot — so a partner's whole vocabulary silently reverts to health insurance |
| `views` | `views.json` | 100 | Every shared saved view |
| `shares` | `shares.json` | 2,000 | Every live share link — and these are **stored as plaintext tokens** |
| `audit` | `audit.json` | 5,000 | The audit trail |

Still true: **no call content lives here.** Every transcript, recording and generated analysis is in
the Knowledge Box, which is why 1 GB is adequate regardless of catalogue size.

No longer true: that losing the volume is a cosmetic event. Three consequences worth stating to a
customer explicitly —

1. **Losing `apikeys.json` reopens the API**, because enforcement is derived from the presence of
   rows, not from a config flag.
2. **Losing `taxonomy.json` reverts the taxonomy to the shipped default** on the next boot, without
   an error, because `seedTaxonomy()` will find no `seeded` marker and re-seed.
3. **`settings.json` may hold a secret**, so it belongs in whatever the customer's policy says about
   credential-bearing files — backups, disk encryption, snapshot retention.

**Sizing verdict unchanged (1 GB is plenty; these are small JSON files with hard caps). Backup and
DR posture materially changed.** `DATA_DIR` needs a backup story, and this repo ships none.

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
2. **The whole `DATA_DIR` store is per-machine, and that is now much more than jobs.** `Store` is
   process-local over a Fly volume, and `[[mounts]]` attaches one volume to one machine. Since the
   store grew from "job records" to seven collections, a second machine means **seven divergences**,
   not one. Walk them explicitly with the customer:

   | Collection | What a second machine does |
   |---|---|
   | `jobs` | `GET /api/v1/jobs/{id}` 404s on a machine that did not handle the upload — including the SSE progress stream the upload screen is watching |
   | `settings` | **An operator changes a setting and it applies to one machine.** The other keeps the old branding, the old limits, the old Knowledge Box. `GET /api/v1/settings` then answers differently depending on which machine you reach, and so does the UI it drives |
   | `apikeys` | A key issued on machine A does not authenticate on machine B — and because enforcement is derived from row presence, machine B may still be **open** while A is closed |
   | `taxonomy` | A labelset edited on A is not edited on B, so the two machines provision and label with different vocabularies |
   | `views` | A saved view is visible to half the users |
   | `shares` | A share link resolves on one machine and 404s on the other |
   | `audit` | The trail is split in two, and neither half is complete |

   Options are the same as before and the work is larger: (a) accept machine-scoped state, which is
   **not** tenable now that settings and credentials live here; or (b) move the store to a shared
   backend. **This is the single change that has to happen before this product is multi-machine.**
   Treat any "just scale it horizontally" proposal as blocked on it.

   *A note on how this fails:* none of the above raises an error. It presents as intermittent —
   "the setting didn't save", "the key works sometimes", "the share link is broken for Dave" — which
   is the worst possible way for it to surface. Say so.
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
- **Recommendation to the customer:** single machine, default sizing, with three flagged
  follow-ups:
  1. **Raise `TtlCache`'s entry cap before the catalogue passes ~1,500–2,000 hot entries.** It is a
     constructor default, not an environment variable, so this is a code change — and past the cap
     each render evicts entries the same render needs, so the hit rate collapses rather than
     degrading gently. At 8,000 calls this is a pre-go-live change, not a later optimisation.
  2. **Give `DATA_DIR` a backup story.** At 8,000 calls their retention policy, API keys, taxonomy
     customisations and audit trail all live on one Fly volume, and this repo ships no backup. See
     the `DATA_DIR` table above for what each file's loss actually does.
  3. **Disclose the freshness bound as `CALLS_CACHE_TTL_MS × 10`** (ten minutes at the default),
     not one minute, because of serve-stale.

  Revisit the multi-machine section only if they later require horizontal scaling or true
  read-your-write consistency across replicas, neither of which this scenario needs — and if they
  do, read item 2 of that section first, because it is now a blocker rather than a caveat.
