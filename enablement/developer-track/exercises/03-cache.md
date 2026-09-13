# Exercise 3 — Cache behaviour: TTL, single-flight, and stale-while-revalidate

**Time:** 20 minutes. **Difficulty:** core. **Needs:** the operator token (`dev-admin-token`).

## Why this exercise exists

`services/cache.ts`'s `TtlCache` sits in front of every ARAG read this product makes. It exists
because of a measured defect — `DECISIONS.md` **D-CA-04** records **~600 ARAG requests for a single
dashboard view at 200 calls** before it existed — and it was *changed* because of a second one.

**D-CA-40** is the one to understand, because it is the more interesting bug. The dashboard
aggregate used to be cached under its own key, `dashboard:all`, written when its own loader
resolved — and therefore stamped *later* than the `summary:<id>` entries it was built from. So the
dashboard rendered instantly off its own fresh entry while re-warming nothing, and the calls list,
opened one click later through a drill-through, hit every `summary:<id>` expired at once and paid
the whole 1+N fan-out cold. That was an eight-second stall on the second screen of the showcase.

The fix has two halves, and you will see both:

1. `getOrLoadStale()` — an expired entry is **returned immediately** and refreshed behind the
   caller, for up to nine further TTLs.
2. `dashboard:all` is **gone**. `aggregate()` was made pure and O(N) and is recomputed per render
   from the `summary:<id>` entries, so every dashboard render *is* the thing that re-warms exactly
   what the calls list will read next.

Raising the TTL would have widened the stale window without removing the cliff. That is the lesson.

## The namespaces

```ts
export const cacheKeys = {
  catalogIds: (query?: string) => `catalog:${query ?? ""}`,
  summary: (id: string) => `summary:${id}`,
  detail: (id: string) => `detail:${id}`,
  labelsets: () => "labelsets:all",
  find: (query: string) => `find:${query}`,
};
```

Five namespaces, and **no `dashboard:` key** — its absence is the fix, so check for it rather than
taking this document's word.

## Steps

```bash
B=http://localhost:3000
T=dev-admin-token
stats() { curl -s "$B/api/v1/admin/cache" -H "Authorization: Bearer $T" \
  | python3 -c 'import json,sys;s=json.load(sys.stdin)["stats"];print("  entries=%d hits=%d misses=%d stale=%d ttlMs=%d"%(s["entries"],s["hits"],s["misses"],s["stale"],s["ttlMs"]))'; }
arag()  { curl -s "$B/api/v1/admin/usage" -H "Authorization: Bearer $T" \
  | python3 -c 'import json,sys;print("  arag.calls =", json.load(sys.stdin)["arag"]["calls"])'; }
```

**1. Look at the namespaces that exist.**

```bash
curl -s "$B/api/v1/admin/cache" -H "Authorization: Bearer $T" | python3 -m json.tool | head -30
```

`byNamespace` and `keys` show `catalog:` and one `summary:<id>` per call. Load the dashboard
(`curl -s "$B/api/v1/dashboard" -o /dev/null`) and look again: still no `dashboard:` key, and the
`summary:` entries are now warm. The dashboard warmed the calls list's cache. That is D-CA-40
working.

**2. Shorten the TTL so the window is observable inside a lab.** This is Exercise 5's mechanism put
to work:

```bash
curl -s -o /dev/null -X PUT "$B/api/v1/settings/limits" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"cacheTtlMs":2000}'
stats
```

`entries=0`. A TTL change **replaces the cache wholesale** — `TtlCache.ttlMs` is `readonly`,
because an entry's expiry is fixed when it is written, so a new policy cannot be applied to old
entries.

**3. Cold read.**

```bash
curl -s -o /dev/null -w "  cold  %{time_total}s\n" "$B/api/v1/calls?page_size=50"; stats; arag
```

`misses` jumps by `1 + N` (the catalogue, plus one summary per call) and `arag.calls` moves by the
same amount.

**4. Warm read, inside the TTL.** Immediately:

```bash
curl -s -o /dev/null -w "  warm  %{time_total}s\n" "$B/api/v1/calls?page_size=50"; stats; arag
```

`hits` jumps by `1 + N`. **`arag.calls` does not move at all.**

**5. Stale read, outside the TTL but inside the grace window.** Wait three seconds and repeat:

```bash
sleep 3
curl -s -o /dev/null -w "  stale %{time_total}s\n" "$B/api/v1/calls?page_size=50"; stats; arag
```

This is the one that matters. `stale` jumps by `1 + N` — and `arag.calls` climbs by `1 + N` too,
**after** the response was already served. The reader did not wait for the refresh; it got the
expired value and the refresh happened behind it. Under `getOrLoad()` alone, that reader would have
blocked on the whole fan-out.

**6. Restore the TTL.**

```bash
curl -s -o /dev/null -X DELETE "$B/api/v1/settings/limits" -H "Authorization: Bearer $T"
```

**7. Targeted invalidation.** Step 6 also emptied the cache (same reason as step 2), so warm it
again first. Namespaces are prefixes, and invalidation is scoped to one:

```bash
curl -s -o /dev/null "$B/api/v1/calls?page_size=50"; arag      # warm again
curl -s -X POST "$B/api/v1/admin/cache/invalidate" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"prefix":"summary:"}'
stats
curl -s -o /dev/null "$B/api/v1/calls?page_size=50"; arag      # and re-read
```

The invalidation reports `{"invalidated": N}` and `stats` drops to `entries=1` — `catalog:`
survives, every `summary:` is gone. The re-read then moves `arag.calls` by `N`, **not** `1 + N`,
because the catalogue was never in the namespace you cleared.

**8. The operator's view.** <http://localhost:3000/admin/usage> → **Cache** shows hit rate, the
namespace breakdown and an **Invalidate everything** button. (`/admin/cache` still resolves — it
redirects here, part of the D-CA-21 restructure.)

## Acceptance criteria

- You can show three consecutive identical requests producing a **miss**, a **hit** and a
  **stale** serve, with `arag.calls` moving on the first and third and flat on the second.
- You can show that `GET /api/v1/admin/cache` never contains a `dashboard:` key, and explain why
  its absence is the fix rather than an oversight.
- You can show `invalidatePrefix("summary:")` leaving `catalog:` warm.

## Questions to answer

1. `getOrLoadStale()` deliberately calls the cache's internal loader rather than re-entering
   `getOrLoad()` for its background refresh. The comment says re-entering would "evict the very
   entry the next reader needs." Walk through why, and describe the symptom that bug produced
   (an entry served stale exactly once, then blocking).
2. `getOrLoad()` de-duplicates concurrent loads for the same key through an in-flight promise map.
   Name the concrete scenario that protects against, and say what it costs.
3. The code comments state that stale-while-revalidate is only safe **because every write path
   invalidates explicitly** rather than letting entries age out. What would go wrong if one write
   path forgot, and why is that failure worse under `getOrLoadStale()` than under `getOrLoad()`?
4. `invalidate`/`clear` also mark any *in-flight* load as `dirty`, so a load that started before a
   write and resolves after it throws its result away. What race does that close?
5. `TtlCache` caps at 2,000 entries, and that cap is a constructor default rather than an
   environment variable. At what catalogue size does that stop being an implementation detail and
   start being a sizing conversation? (See `enablement/architect-track/sizing-deployment.md`.)
