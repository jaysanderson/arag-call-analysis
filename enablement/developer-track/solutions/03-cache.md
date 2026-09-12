# Solution — Exercise 3: cache behaviour

## What you should have observed

| Step | `arag.calls` | Why |
|---|---|---|
| First `/calls` load after boot | jumps by `1 + N` (N = calls shown) | `catalogIds()` cache miss (1 call) + one `summaryOf(id)` cache miss per call (`N` calls) |
| Second `/calls` load, same TTL window | flat (+0) | `catalog:` and every `summary:{id}` are cache hits — `TtlCache.getOrLoad` returns the cached value without calling `load()` |
| After `POST /admin/cache/invalidate {"prefix":"summary:"}` | flat (+0) at invalidation time — invalidation doesn't call ARAG | `TtlCache.invalidatePrefix("summary:")` just deletes map entries |
| `/calls` load right after that | jumps by `N` (not `1 + N`) | every `summary:{id}` key is gone and gets refetched, but `catalog:` (a different prefix) was never touched, so `catalogIds()` is still a hit |

## Question 1 — why doesn't invalidating `summary:` touch the dashboard?

`services/cache.ts`'s `cacheKeys` map is:

```ts
export const cacheKeys = {
  catalogIds: (query?: string) => `catalog:${query ?? ""}`,
  summary: (id: string) => `summary:${id}`,
  detail: (id: string) => `detail:${id}`,
  labelsets: () => "labelsets:all",
  dashboard: () => "dashboard:all",
  find: (query: string) => `find:${query}`,
};
```

`invalidatePrefix("summary:")` only deletes keys that literally start with the string `"summary:"`.
The dashboard is cached under its own key, `"dashboard:all"` (`services/dashboard.ts`:
`rt.cache.getOrLoad(cacheKeys.dashboard(), async () => aggregate(await allSummaries(rt)))`) — a
different namespace entirely. So invalidating `summary:` makes the *next full call list fetch*
re-hit ARAG per call, but a *dashboard* view within the same TTL window keeps serving its own
cached aggregate until `dashboard:all` itself expires or is explicitly cleared (e.g. by
"Invalidate all", which calls `TtlCache.clear()` and drops every namespace at once).

## Question 2 — why does upload/delete invalidate immediately instead of waiting for the TTL?

`services/calls.ts`'s `createCall()` and `deleteCall()` both call `invalidateCall(rt, id)` before
returning. If they didn't, a caller who uploads a call and then immediately lists calls (a very
common demo and product flow — "upload, then see it") could get a stale catalog for up to
`CALLS_CACHE_TTL_MS` (60 s by default) and simply not see their own upload, or keep seeing a
deleted call. That would look like a bug, not a caching trade-off — write-path correctness has to
be immediate; only *read-path freshness relative to changes made outside this process or by
ARAG's own async agents* is allowed to lag by up to the TTL.

## Question 3 — what does `CALLS_CACHE_TTL_MS` trade away?

It trades **freshness of ARAG-side state this app didn't just write itself** for **bounded ARAG
call volume**. Concretely:

- **Staleness scenario a customer would notice:** a call is uploaded (triggering an immediate
  cache invalidation, so it appears right away), but its `resource-labeler` / `call-insights`
  agents finish *after* the initial summary was cached — e.g. a slow transcription. If a viewer's
  first fetch of that call lands inside the TTL window before augmentation finished, they can see
  a summary with `metrics: undefined` or missing labels for up to `CALLS_CACHE_TTL_MS` even though
  the KB itself now has the finished data (a second natural request — this app doesn't proactively
  re-poll a still-augmenting call's cache entry).
- **What a shorter TTL (or no cache at all) would reintroduce:** exactly the defect `D-CA-04`
  fixed — `~600 ARAG requests per dashboard view at 200 calls` with rails multiplying it further.
  At scale that's added latency on every page view (each of those requests has real network and
  KB-processing time), added ARAG request-volume cost, and a much higher chance of hitting the
  per-account or per-KB rate limits ARAG itself enforces upstream.

The 60-second default is a deliberate middle point: short enough that "stale metrics right after
upload" is a rare, self-correcting annoyance (a page refresh a minute later has current data), long
enough that a normal browsing session (viewing the dashboard, several calls, a few filter changes)
costs a small, bounded number of ARAG requests instead of one full fan-out per click.
