# Architect Track — Knowledge Check

Mixes recall (what the architecture is) and judgement (what you'd tell a customer). Answers
included.

---

**1. What single constraint on ARAG's data-augmentation tasks forces this product's provisioning
step to be a background job instead of a synchronous request?**

> ARAG allows only one **running** task per operation type at a time — starting a second `labeler`
> or `ask` task while one is running returns `422`. `services/jobs.ts`'s `JOB_PROVISION` starts the
> taxonomy's labelsets and agents sequentially, waiting between them, which takes long enough (and
> needs retry/observability) to warrant a job rather than a blocking request.

---

**2. Name the one code path every read — server-rendered page and versioned API alike — goes
through to reach ARAG, and why that matters for correctness.**

> `services/*.ts` (e.g. `services/calls.ts`'s `getCall`, `listCalls`). Both server components and
> `app/api/v1/**/route.ts` handlers call the same service functions — there is no second
> implementation of "how to turn an ARAG resource into a `CallSummary`." This guarantees the demo
> UI and the public API can never show different data for the same call (`DECISIONS.md` D-CA-01).

---

**3. A dashboard view at 200 calls, uncached, was measured at ~600 ARAG requests. Explain the
arithmetic and name the fix.**

> One `listResourceIds` call, then one `getResource` per call (200) for the base dashboard — but
> `CategoryRails` issued additional `/api/calls`-shaped fetches per rail, each repeating the same
> N+1 pattern, multiplying the base cost. The fix is `services/cache.ts`'s `TtlCache`: catalog ids
> and per-call summaries are cached with a TTL and single-flight loading, so a browsing session
> within one TTL window costs roughly one ARAG request per distinct call touched, not per view.

---

**4. What does `TtlCache.getOrLoad()`'s in-flight de-duplication protect against, specifically?**

> A thundering-herd of identical upstream requests when multiple concurrent callers ask for the
> same uncached key at the same moment (e.g. several tabs opening the dashboard right after a cold
> boot or a cache clear) — they share one in-flight promise instead of each triggering its own
> `rt.arag.getResource()` call.

---

**5. Why is `services/calls.ts`'s `createCall()`/`deleteCall()` invalidation immediate rather than
left to the TTL to expire naturally?**

> Because write-path correctness (a caller sees their own upload/delete reflected right away)
> cannot depend on when a cache entry happens to expire. Only *freshness relative to changes made
> outside this process* (e.g. an agent finishing augmentation asynchronously) is allowed to lag by
> up to the TTL — a self-inflicted change through this product's own API must be immediately
> visible.

---

**6. On a multi-machine Fly deployment with the code as it stands today, what three things stop
being consistent across machines, and what does each look like in practice?**

> (1) The `TtlCache` — different machines can serve different data within the same TTL window.
> (2) The `JobManager`/`Store` on `DATA_DIR` — job state is machine-local unless the volume or
> store is shared, so `GET /api/v1/jobs/{id}` can 404 on a machine that didn't handle the original
> request. (3) The rate limiter's token buckets (`lib/api.ts`'s `buckets()` on `globalThis`) — the
> effective per-IP rate limit becomes `RATE_LIMIT_RPS × machine count`, not the configured value.

---

**7. Why is `DATA_DIR` sized at only 1 GB in `fly.toml` regardless of call catalog size?**

> Because it stores only the `Store`'s JSON job records (ingestion/provisioning job metadata) —
> never transcripts, recordings, or generated analysis, which live entirely in the ARAG Knowledge
> Box. Catalog size drives KB storage and request volume, not this app's local volume.

---

**8. A customer wants their KB in `eu-west` but expects to deploy this app's Fly machine in `iad`.
What would you flag, and why?**

> Added latency on every ARAG call, since `primary_region` and the KB region are meant to be
> co-located (`fly.toml`'s own header comment states this reasoning for its `iad`/`aws-us-east-2-1`
> pairing). Recommend moving `primary_region` to match the KB's actual region, or discuss whether a
> genuine data-residency requirement makes the mismatch unavoidable — in which case the latency
> cost should be disclosed and measured, not assumed away.

---

**9. What happens to a generated `call_metrics` field whose value doesn't match its taxonomy enum,
and why is that the right behaviour instead of an error?**

> `lib/parse.ts`'s `sanitizeMetrics()` drops it (sets it to `undefined`) rather than rendering it.
> A generative model can return a refusal sentence or malformed text where a fixed enum value was
> requested — the live 3 Sep 2026 audit found exactly this leaking into a dashboard chart as if it
> were a real category. Dropping it (visible via the dashboard's `withMetrics` count) is safer than
> either erroring the whole request or rendering garbage as data.

---

**10. Name the one thing REMi (`/predict/remi`) scoring is explicitly not allowed to do to the
"ask this call" chat experience, and how the code enforces it.**

> It is not allowed to delay or block the answer. `services/ask.ts` streams the ARAG answer to the
> client immediately and only *afterward* fires the REMi call, capped at `REMI_TIMEOUT_MS` (12 s)
> and best-effort — a REMi failure or timeout degrades silently to no quality badge rather than
> holding up or failing the answer (`DECISIONS.md` D-CA-09).

---

**11. What is the actual per-ask cost surface, and where would you look to build a real cost model
for a customer instead of estimating from transcript length?**

> `GET /api/v1/admin/usage`'s `tokens.input`/`tokens.output` counters, populated live by
> `services/ask.ts` from the actual ARAG response — these are real token counts, not an estimate.
> Transcript length alone under- or over-estimates cost depending on retrieval `top_k` and REMi's
> own (invisible client-side) token usage, so the usage endpoint's live counters are the right
> input to a cost model, not a heuristic.

---

**12. A customer asks whether `API_KEYS` being unset is a security gap. What's the accurate
answer?**

> It's a configuration decision that must be made explicitly for the deployment, not a gap in the
> code: `enforceAuth()` in `lib/api.ts` treats an empty `API_KEYS` list as "open API" for
> write routes on `/calls` (deliberately, so the demo works with zero configuration). For any
> deployment where uploads/deletes should not be publicly callable, `API_KEYS` must be set — this
> is item 5 in `design-review-checklist.md`'s "known MVP limitations," precisely because it's easy
> to leave unset by accident on a public-facing deployment.

---

**13. Why does `POST /api/v1/calls/{id}/ask` check `getCall()` for a 404 *before* starting the
NDJSON stream, instead of just letting the stream itself fail?**

> Because a `200` response that has already started streaming NDJSON is far harder for a client to
> interpret as an error than a clean `404` returned before any bytes are sent — mixing a partial
> stream with an error condition inside it is a worse contract than failing fast up front.

---

**14. What's the concrete, measurable trade-off a shorter `CALLS_CACHE_TTL_MS` would make, versus
the current 60-second default?**

> Fresher aggregates (a call's metrics becoming visible sooner after its augmentation agents
> finish) at the direct cost of more ARAG requests per unit time — the exact defect (`~600
> requests per dashboard view`) the cache exists to prevent would partially reassert itself as the
> TTL shrinks toward zero. The 60 s default is a deliberate middle point, not an arbitrary one.

---

**15. Which of this product's admin panel views would you demo first to prove "this deployment is
healthy and observable," and what would you specifically check on each?**

> `/admin/health` (KB connection test — `ok: true`, `mock: false` for production, reasonable
> `ms`), `/admin/usage` (non-zero `requests`, sane `arag.errors` relative to `arag.calls`,
> `cache.hits`/`cache.misses` ratio showing the cache is actually working), and `/admin/agents`
> (all three named agents in `configured`/`completed`/`running` state, none stuck or `absent` when
> they shouldn't be). Together these three answer "is it up," "is it being used and is the cache
> earning its keep," and "did provisioning actually succeed" — the three questions a go-live check
> needs answered.
