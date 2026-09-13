# Solution — Exercise 3: cache behaviour

## What you should have observed

Run while writing this solution, against the sample deployment with `cacheTtlMs` lowered to
`2000` and a 13-call corpus (so `1 + N` = 14).

| Step | `stats` | `arag.calls` | Why |
|---|---|---|---|
| After `PUT limits {"cacheTtlMs":2000}` | `entries=0 hits=0 misses=0 stale=0 ttlMs=2000` | — | `TtlCache.ttlMs` is `readonly`; a TTL change is a **new cache**, not a re-stamped one |
| Cold `/calls` | `entries=14 hits=0 misses=14 stale=0` | 106 | catalogue miss + one summary miss per call |
| Warm `/calls`, inside 2 s | `entries=14 hits=14 misses=14 stale=0` | **106 (flat)** | every key is a hit; `getOrLoad` returns without calling `load()` |
| `sleep 3`, then `/calls` | `entries=14 hits=28 misses=14 **stale=14**` | **120 (+14)** | every entry is expired but inside the grace window: returned immediately, refreshed *behind* the response |
| `invalidate {"prefix":"summary:"}` | `{"invalidated": 13}`, `entries=1` | unchanged | invalidation deletes map entries; it does not call ARAG |
| `/calls` again | — | +13 (**N**, not `1 + N`) | every `summary:` was evicted; `catalog:` is a different prefix and was never touched |

Two things in that table are the whole lesson.

**The `stale` counter moved and the response did not slow down.** `arag.calls` climbed by 14
*after* the bytes were sent. Under `getOrLoad()` alone that reader would have blocked on a 14-call
fan-out before its first byte.

**There is no `dashboard:` key, at any point.** Check `GET /api/v1/admin/cache`'s `keys` array
after loading the dashboard: `catalog:` and thirteen `summary:<id>` entries, nothing else.

## Question 1 — why `getOrLoadStale()` does not re-enter `getOrLoad()`

The background refresh calls the cache's internal `load()` directly. If it called the public
`getOrLoad()` instead, that method would begin by calling `get()` — which, on an entry past its TTL,
**deletes it**. The stale value the next reader was about to be served would be gone, and that
reader would block on the refresh after all.

The symptom is specific and easy to misdiagnose as a fluke: the cache serves an entry stale exactly
once, then blocks, then behaves normally again. It looks like a race. It is a self-inflicted
eviction, and the code comment calls it out precisely because the correct version looks like a
missed refactor.

## Question 2 — what in-flight de-duplication buys, and what it costs

`getOrLoad()` keeps a `Map` of in-progress promises keyed by cache key. Two callers who miss the
same cold key at the same instant share one promise instead of each calling ARAG.

The concrete scenario: several browser tabs (or several Fly machines' worth of health checks, or a
showcase recording opening two screens at once) hitting the dashboard right after a cold boot or a
cache clear. Without it, `N` concurrent renders means `N × (1 + calls)` upstream requests against a
service that rate-limits.

What it costs: the second caller inherits the first caller's *latency* — including its timeout — and
its failure. One slow upstream read makes every concurrent reader of that key slow, rather than only
the one that asked first. That is the right trade here (the alternative is a thundering herd), but
it is a trade.

## Question 3 — why stale-while-revalidate depends on explicit invalidation

Every write path in this product invalidates outright: `createCall()`/`deleteCall()` call
`invalidateCall()`, provisioning and a Knowledge Box swap call `rt.cache.clear()`. Staleness is
therefore bounded by the TTL and never by a missed invalidation.

If one write path forgot, under `getOrLoad()` the damage is bounded at **one TTL**: the entry
expires, the next reader takes a miss, and the correct value is read. Under `getOrLoadStale()` the
grace window is `ttlMs * 9`, so a reader can be handed a value up to **`ttlMs + graceMs` — ten
TTLs — old**, and is handed it *before* the refresh that would have corrected it. With the 60 s
default that is a ten-minute exposure rather than a one-minute one.

The mechanism is still self-correcting — each stale serve does start a real refresh, so the reader
after the affected one gets fresh data — but "self-correcting after one more request, up to ten
minutes late" is a materially different promise from "wrong for at most a minute", and it is the
promise you would have to make to a customer. That is why the safety precondition is written into
the code as a comment rather than assumed: the mechanism is only sound for read models whose every
write path deletes outright, which is why it is applied to `catalogIds` and `summaryOf` and not
blanket-applied to the whole cache.

## Question 4 — what `dirty`/`supersede()` closes

The classic read-modify-write race across a cache:

1. Reader A misses `summary:X` and starts loading it from ARAG.
2. Writer B deletes call X (or re-labels it) and invalidates `summary:X`. There is nothing in the
   map to delete — A's load has not resolved yet.
3. A's load resolves with the **pre-write** value and writes it into the cache.

The cache now holds a value that is older than an invalidation that already happened, and it will
sit there for a full TTL. `invalidate`/`invalidatePrefix`/`clear` therefore also mark any matching
in-flight load `dirty`, and `load()` checks that flag before storing: A's result is returned to A
and thrown away rather than cached.

## Question 5 — when the 2,000-entry cap stops being an implementation detail

The cap is a `TtlCache` constructor default, not an environment variable, so it cannot be tuned
without a code change.

It stops being an implementation detail the moment the **catalogue** exceeds it, not the moment
traffic does — because `catalogIds()` + `summaryOf(id)` per call means a single full dashboard or
calls-list render touches one entry *per call in the corpus*. At 2,000 calls, one render fills the
cache exactly; past that, each render evicts entries the same render is about to need, and the hit
rate collapses toward zero while ARAG request volume climbs back toward the `D-CA-04` numbers.

Practically: flag it as a required follow-up somewhere around **1,500 calls**, and treat it as
blocking past ~2,000. `enablement/architect-track/sizing-deployment.md` works this through for an
8,000-call tenant, where the honest recommendation is a code change before go-live.
