# Scaling

## Where the limits are

| Component | Current design | Limit |
|---|---|---|
| Read cache (`services/cache.ts`'s `TtlCache`) | In-process `Map`, 60 s TTL, single-flight de-dup, max 2,000 entries, stale-while-revalidate on the two hot keys | Per process. A second machine has its own empty cache; cache hit rate drops proportionally to instance count, and each machine independently serves its own stale window. |
| Rate limiter (`lib/api.ts`'s token buckets) | In-process `Map` keyed by IP or API key | Per process. A caller distributed across N machines gets N independent budgets — the limiter under-limits, not over-limits, as instance count grows. |
| Settings store (`services/config.ts`) | One JSON document in `DATA_DIR`, applied to the in-process runtime | **Per process and per volume.** A setting edited on one machine is written to that machine's `DATA_DIR` and applied to that machine's runtime only. Unless `DATA_DIR` is a shared volume, a second machine keeps serving the old value indefinitely — and even with a shared volume, the *apply* step is in-memory, so the other machine picks the change up only on its next restart. |
| API keys, taxonomy, saved views, share links, audit (`DATA_DIR` JSON) | One JSON file per collection | Same constraint: per volume. A key issued on machine A does not authenticate on machine B, a labelset created on A is not in B's vocabulary, and the audit trail is split across machines. |
| Job manager (vendored `JobManager`) | Concurrency 2, backed by `Store` (JSON files under `DATA_DIR`) | Per process/volume. Two long-running jobs (an ingest and a provision) can run at once; a third queues. Job history is only visible from the machine that ran it unless `DATA_DIR` is shared. |
| Retention purge | 200 calls per run, sequential deletes | Per invocation. A backlog larger than 200 needs repeated runs; there is no background sweeper that would work through it unattended. |
| ARAG round-trips per view | One per call per cache window, after caching (down from ~N per rail before D-CA-04) | Bounded by cache TTL and catalog walk cap (500 resources) — see [Limits](limits.md). |
| Catalog walk | `listResourceIds({ pageSize: 100, max: 500 })` | A Knowledge Box with more than 500 calls is silently truncated to the first 500 by creation order the catalog API returns — the dashboard and calls list will under-report `total`. |
| Data-augmentation agent throughput | One *running* task per operation type; provisioning starts agents sequentially and waits for idle between each | A re-provision of the full taxonomy over N calls takes roughly as long as the slowest of the three agents finishing its pass over all N, done three times in sequence — not parallelizable without ARAG allowing concurrent same-type tasks. |

Before caching, the pre-MVP audit measured roughly 600 ARAG requests for a single dashboard view
at 200 calls (N+1 fetches × rails). The 60-second TTL cache with single-flight loading
(D-CA-04) collapsed that to one upstream fetch per call per cache window, regardless of how many
concurrent renders (dashboard + rails + list) ask for the same data.

## Stale-while-revalidate, and what it means on more than one machine

`catalogIds()` and `summaryOf()` — the two reads every screen depends on — go through
`getOrLoadStale()` rather than `getOrLoad()`. Within `max(9 × TTL, 5 minutes)` of expiry the stale
value is returned immediately and exactly one refresh runs behind it; only a truly cold key waits.
This removed the cliff where the first reader after the TTL lapsed paid the whole per-call fan-out
(about eight seconds on a live Knowledge Box — DECISIONS D-CA-40).

It is safe only because every mutation invalidates its keys outright rather than letting them age
out, so staleness stays bounded by the TTL. The practical consequences at scale are:

- **A reader can see data up to `ttlMs + graceMs` old** — with the defaults, up to about ten
  minutes — when a key expires and nothing has written since. That is a deliberate trade against
  a periodic stall, not an accident.
- **On N machines it is N independent windows.** Each machine warms its own entries and serves its
  own stale values, so two browsers hitting two machines can legitimately disagree for up to that
  window. A write on machine A invalidates A's cache only.
- **The dashboard is not separately cached**, so a range change costs a re-aggregation of rows
  already in memory rather than a second pass over the Knowledge Box.

## The multi-machine constraint that is not about caching

This is the one worth stating plainly, because it is an operational constraint rather than a
performance one:

> **Each machine has its own read cache *and its own settings-store file*, unless `DATA_DIR` is a
> shared volume.**

`DATA_DIR` is no longer job history. It holds `settings.json`, `apikeys.json`, `taxonomy.json`,
`views.json`, `shares.json` and `audit.json`. On a second machine with its own volume, an operator
who changes the product name, rotates the service-account token, issues an API key, edits a
labelset, saves a view or revokes a share link changes **one machine**. The other keeps serving the
old configuration, rejects the new key, and classifies against the old vocabulary.

Sharing the volume fixes the *persistence* half but not the *apply* half: `applyToRuntime()`
mutates the in-process runtime container, so a machine that did not handle the write continues
serving its in-memory copy until it restarts. There is no cross-machine invalidation signal.

Until that is addressed (see 100x below), the honest statement is that this product is a
**single-machine deployment**, which is exactly what `fly.toml` describes: one machine,
`min_machines_running = 1`, one volume.

## What to do at 10x

At roughly 10x today's scale (hundreds of calls, low-double-digit concurrent users, still a
single Fly machine):

- **Raise `CALLS_CACHE_TTL_MS`** or accept the existing 60 s default — cache hit rate is already
  high at this scale since most traffic reads the same catalog/dashboard/summary keys.
- **Watch the catalog walk cap.** If the Knowledge Box approaches 500 resources, either raise the
  `max` in `catalogIds()` (`services/calls.ts`) — trading one larger catalog walk per cache miss
  for correctness — or start pruning/archiving old calls out of the KB.
- **Job concurrency of 2 is still fine** at this scale: uploads are infrequent relative to reads,
  and provisioning is an operator-triggered, not per-request, operation.
- **Back up `DATA_DIR`.** At this scale it is holding real configuration — settings, keys, a
  partner's taxonomy, the audit trail — and losing it is no longer just losing job history.
- **Keep to one machine** unless you make the changes below. Adding a second machine without a
  shared volume splits the configuration, which is a correctness problem rather than a performance
  one.
- No architecture change is required — this is the topology `fly.toml` already describes (single
  machine, single volume).

## What to do at 100x

At roughly 100x (thousands of calls, real concurrent load, likely multiple machines):

- **Shared cache.** Replace `TtlCache`'s in-process `Map` with a shared backend (Redis or
  similar) so a cache hit on one machine benefits every machine, and so upload/delete/provision
  invalidation (`invalidateCall`, `rt.cache.clear()`) is actually global rather than
  machine-local. The swap point is documented in
  [Extension points](../developer/extension-points.md#swap-the-cache) — the four methods every
  service calls (`getOrLoad`, `delete`, `invalidatePrefix`, `clear`) are the whole contract.
- **External job store.** Move `Store`/`JobManager` off local JSON files onto a real database or
  the platform's own shared store, so job history and in-flight job state are visible and
  resumable from any machine, and so a machine restart doesn't lose a running job's bookkeeping.
- **Shared rate limiter.** Move the token buckets to the same shared backend as the cache, keyed
  identically, so a caller's budget is enforced across the whole fleet rather than per machine —
  today, N machines behind a load balancer effectively multiply a caller's real rate limit by N.
- **Shared configuration, and a way to apply it.** Move the `Store` collections that hold
  configuration — `settings`, `apikeys`, `taxonomy`, `views`, `shares`, `audit` — onto the same
  shared backend, *and* add a signal that makes every machine re-run `applyToRuntime()` when the
  settings document changes. Shared storage alone is not enough: the "no restart" guarantee comes
  from mutating an in-process container, so a machine that did not serve the write has to be told.
  The smallest honest version is a version stamp on the settings document that each machine
  re-reads on a short interval and applies when it moves.
- **Retention as a scheduled job rather than a button.** The purge is capped at 200 calls per run
  and deliberately has no background sweeper. At 100x, point an external scheduler at
  `POST /api/v1/retention/purge` on a cadence that keeps up, rather than adding a timer inside the
  product — the property worth keeping is that a deletion is always something that was asked for.
- **Read replicas / pagination of the catalog, not a single 500-resource walk.** At this scale,
  `catalogIds()`'s single unpaginated-to-the-caller walk stops being viable even before hitting
  the cap: `GET /api/v1/calls` should paginate the *upstream* catalog request per page requested,
  rather than materializing every id up front and paginating in memory
  (`listCalls`'s current `.slice(start, start + pageSize)` over an in-memory array). This is the
  single biggest architectural change at 100x — everything else above is a component swap behind
  an unchanged interface; this one changes `services/calls.ts`'s contract with ARAG.
- **Agent throughput.** If re-provisioning thousands of calls sequentially through one `ask` task
  becomes the bottleneck, the fix is upstream of this product (parallel same-type ARAG tasks, or
  batching within one task's operations) rather than something `services/jobs.ts` can solve alone.
