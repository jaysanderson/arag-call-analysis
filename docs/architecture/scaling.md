# Scaling

## Where the limits are

| Component | Current design | Limit |
|---|---|---|
| Read cache (`services/cache.ts`'s `TtlCache`) | In-process `Map`, 60 s TTL, single-flight de-dup, max 2,000 entries | Per process. A second machine has its own empty cache; cache hit rate drops proportionally to instance count. |
| Rate limiter (`lib/api.ts`'s token buckets) | In-process `Map` keyed by IP or API key | Per process. A caller distributed across N machines gets N independent budgets — the limiter under-limits, not over-limits, as instance count grows. |
| Job manager (vendored `JobManager`) | Concurrency 2, backed by `Store` (JSON files under `DATA_DIR`) | Per process/volume. Two long-running jobs (an ingest and a provision) can run at once; a third queues. Job history is only visible from the machine that ran it unless `DATA_DIR` is shared. |
| ARAG round-trips per view | One per call per cache window, after caching (down from ~N per rail before D-CA-04) | Bounded by cache TTL and catalog walk cap (500 resources) — see [Limits](limits.md). |
| Catalog walk | `listResourceIds({ pageSize: 100, max: 500 })` | A Knowledge Box with more than 500 calls is silently truncated to the first 500 by creation order the catalog API returns — the dashboard and calls list will under-report `total`. |
| Data-augmentation agent throughput | One *running* task per operation type; provisioning starts agents sequentially and waits for idle between each | A re-provision of the full taxonomy over N calls takes roughly as long as the slowest of the three agents finishing its pass over all N, done three times in sequence — not parallelizable without ARAG allowing concurrent same-type tasks. |

Before caching, the pre-MVP audit measured roughly 600 ARAG requests for a single dashboard view
at 200 calls (N+1 fetches × rails). The 60-second TTL cache with single-flight loading
(D-CA-04) collapsed that to one upstream fetch per call per cache window, regardless of how many
concurrent renders (dashboard + rails + list) ask for the same data.

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
