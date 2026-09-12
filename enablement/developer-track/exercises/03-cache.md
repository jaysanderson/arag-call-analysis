# Exercise 3 — Cache behaviour

**Time:** 15 minutes. **Difficulty:** core.

## Task

`services/cache.ts`'s `TtlCache` sits in front of every ARAG read this product makes for calls:
catalog ids (`cacheKeys.catalogIds()`), search results (`cacheKeys.find(query)`), per-call
summaries (`cacheKeys.summary(id)`), full call detail (`cacheKeys.detail(id)`), labelsets, and the
dashboard aggregation. Its existence is a direct response to a real defect: `DECISIONS.md`'s
`D-CA-04` records that an early audit measured **~600 ARAG requests per dashboard view at 200
calls** with no caching, because rails and the dashboard each re-fetched every call. Your job in
this exercise is to see that trade-off, not just read about it.

## Steps

1. Open **http://localhost:3000/admin/cache** and **http://localhost:3000/admin/usage** (or
   `curl -s http://localhost:3000/api/v1/admin/usage -H "Authorization: Bearer dev-admin-token"`).
   Note the current `arag.calls` count.
2. Load **http://localhost:3000/calls** in the browser (or `curl` it), then reload the usage
   endpoint. Note `arag.calls` again.
3. Reload **http://localhost:3000/calls** a second time, then check `arag.calls` once more. It
   should be flat or nearly flat — `catalogIds()` and every `summaryOf(id)` are cache hits inside
   the TTL window (`CALLS_CACHE_TTL_MS`, default 60 000 ms).
4. Now invalidate just the per-call summaries:
   ```bash
   curl -s -X POST http://localhost:3000/api/v1/admin/cache/invalidate \
     -H "Authorization: Bearer dev-admin-token" -H "Content-Type: application/json" \
     -d '{"prefix": "summary:"}'
   ```
   (Or click **Invalidate summaries** on `/admin/cache`.)
5. Reload `/calls` again and check `arag.calls` one more time. This time it should jump by roughly
   one ARAG request per call shown on the page — `catalogIds()` is still cached (its key is
   `catalog:`, a different namespace), but every `summary:{id}` was evicted, so `summaryOf()` has
   to call `rt.arag.getResource()` again for each one.
6. Look at `/admin/cache`'s **Namespaces** row before and after step 4 — it should show the
   `summary:` count drop to (near) zero, then climb back up as step 5 repopulates it.

## Questions to answer (write down or discuss)

1. Which two cache namespaces did you *not* need to touch to get calls to re-fetch (i.e. which
   ones stayed warm)? Why does invalidating `summary:` alone not also force `dashboard:all` to
   recompute (check `cacheKeys` in `services/cache.ts` and how `dashboard()` in
   `services/dashboard.ts` is keyed)?
2. `services/calls.ts`'s `invalidateCall()` runs on every upload and delete, immediately — it
   doesn't wait for the TTL. Why is that necessary, and what would break if uploads only relied on
   the TTL to become visible?
3. What does `CALLS_CACHE_TTL_MS` trade away? Name the concrete staleness scenario a customer
   would notice, and the concrete cost/latency problem a shorter TTL (or no cache) would reintroduce.

## Acceptance criteria

- You can show a `GET /api/v1/admin/usage` response (or a screenshot of `/admin/usage`) from
  before and after step 4, with `arag.calls` visibly higher after the invalidation and the
  following reload.
- You can answer all three questions above in your own words, citing the actual field names
  (`arag.calls`, `cacheKeys.summary`, `invalidateCall`) rather than paraphrasing generically.
