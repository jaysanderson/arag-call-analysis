# Architect Track — Knowledge Check

**Time:** 20 minutes. Eighteen questions, mixing recall (what the architecture is) with judgement
(what you would tell a customer). Answers included. Questions 6, 7, 12 and 14–18 changed or were
added after the product pass; 14, 16 and 17 cover
[`configuration-cache-and-sharing.md`](configuration-cache-and-sharing.md) directly.

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

**4. What does `TtlCache.getOrLoad()`'s in-flight de-duplication protect against, and what does it
cost?**

> It protects against a thundering herd of identical upstream requests when concurrent callers ask
> for the same uncached key at the same moment (several tabs opening the dashboard after a cold
> boot or a cache clear) — they share one in-flight promise instead of each triggering its own
> `rt.arag.getResource()`. It costs the second caller the first caller's latency, timeout and
> failure: one slow upstream read makes every concurrent reader of that key slow, not just the one
> that asked first.

---

**5. Why is `services/calls.ts`'s `createCall()`/`deleteCall()` invalidation immediate rather than
left to the TTL to expire naturally?**

> Because write-path correctness (a caller sees their own upload/delete reflected right away)
> cannot depend on when a cache entry happens to expire. Only *freshness relative to changes made
> outside this process* (e.g. an agent finishing augmentation asynchronously) is allowed to lag by
> up to the TTL — a self-inflicted change through this product's own API must be immediately
> visible.

---

**6. On a multi-machine Fly deployment as the code stands today, what stops being consistent, and
what does each divergence look like in practice?**

> More than it used to, because `DATA_DIR` grew from job records to seven collections.
> (1) The `TtlCache` — different machines serve different data within the same window.
> (2) The rate limiter's token buckets (`lib/api.ts`'s `buckets()` on `globalThis`) — the effective
> per-IP limit becomes `RATE_LIMIT_RPS × machine count`.
> (3) **The whole store**, one volume per machine: `jobs` (a job 404s on the machine that did not
> run it, including its SSE stream), `settings` (an operator changes a setting and it applies to
> one machine — different branding, different limits, possibly a different Knowledge Box),
> `apikeys` (a key issued on A does not authenticate on B, and B may still be *open* while A is
> closed), `taxonomy` (the two machines label with different vocabularies), `views` (visible to
> half the users), `shares` (a link resolves on one machine and 404s on the other), `audit` (split
> in two, neither half complete).
> The thing to say out loud: **none of this errors.** It presents as intermittent — "the setting
> didn't save", "the key works sometimes" — which is the worst way for it to surface. This is now a
> blocker on horizontal scaling, not a caveat.

---

**7. `DATA_DIR` is 1 GB regardless of catalogue size. Is that still right, and what is actually in
it?**

> The **sizing** is still right: seven small JSON collections with hard caps (`jobs` 500,
> `settings` one document, `apikeys` 500, `taxonomy` 200, `views` 100, `shares` 2,000, `audit`
> 5,000), and **no call content** — every transcript, recording and generated analysis lives in the
> Knowledge Box. Catalogue size drives KB storage, not this volume.
>
> What changed is the **importance**, not the size. It now holds the deployment's configuration
> (possibly including the Knowledge Box credential, D-CA-45), every API-key digest, the taxonomy,
> live share tokens **in plaintext**, and the audit trail. Two loss modes are silent and worth
> naming: losing `apikeys.json` **reopens** the API, because enforcement is derived from row
> presence rather than a flag; losing `taxonomy.json` reverts a partner's whole vocabulary to the
> shipped health-insurance default on the next boot. This repo ships no backup story for it.

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

**12. A customer asks whether having no API keys configured is a security gap. What is the
accurate answer now?**

> It is a configuration decision, not a code gap — but the mechanism has changed and the old answer
> is wrong. Keys are no longer an environment variable: `API_KEYS` is only a **one-time seed** into
> a real store (D-CA-36), and keys are minted, named, attributed and revoked in the product.
>
> With no key ever issued, `api`-mode routes (saved views, share links) are **open**, which is what
> makes the sample deployment browsable. `write` routes are not: they always need the operator
> token or a real key, and in `NODE_ENV=production` with neither configured they are refused `403`
> rather than defaulting open (D-CA-13). So the old "anyone can upload or delete" exposure is
> closed by default.
>
> The thing to actually flag is the opposite direction: **enforcement is sticky** (D-CA-46). Once
> the deployment has ever had a key, `api` routes need one for ever, and revoking the last key does
> not reopen them — only purging the rows does. On a public demo that is a footgun; in an incident
> it is the property that stops "revoke the compromised key" from opening the API to the world. It
> belongs in the runbook either way.

---

**13. Why does `POST /api/v1/calls/{id}/ask` check `getCall()` for a 404 *before* starting the
NDJSON stream, instead of just letting the stream itself fail?**

> Because a `200` response that has already started streaming NDJSON is far harder for a client to
> interpret as an error than a clean `404` returned before any bytes are sent — mixing a partial
> stream with an error condition inside it is a worse contract than failing fast up front.

---

**14. A customer asks for the deployment's freshness guarantee. What number do you give them, and
why is `CALLS_CACHE_TTL_MS` the wrong answer?**

> **`CALLS_CACHE_TTL_MS + graceMs`, where `graceMs` defaults to `ttlMs × 9` — ten minutes at the
> 60-second default, per machine.** Since D-CA-40, `catalogIds()` and `summaryOf()` are served
> stale-while-revalidate: past the TTL but within the grace window the expired value is returned
> *immediately* and a refresh runs behind the reader. So the reader never blocks — but the value
> they were handed can be ten TTLs old. A review that quotes 60 s has quoted the wrong figure.
>
> The trade is worth stating alongside it: what was bought is that a warm deployment never blocks a
> reader on the 1+N fan-out again, which is what the eight-second stall was. What was sold is nine
> extra TTLs of worst-case staleness on a product whose aggregates are a KPI dashboard, where that
> is almost always acceptable — and is exactly the thing to check, rather than assume, if the
> customer has a read-your-own-write requirement.

---

**15. Which operator views would you demo first to prove "this deployment is healthy and
observable," and what would you check on each?**

> The operator console lives in the same shell as the product (D-CA-21), reached from **Admin** in
> the left rail. Four tabs, in this order:
>
> - **Connection** — the live Knowledge Box test: `ok: true`, `mock: false` for production, a
>   sensible round-trip in ms, and the generative model the deployment is actually using. Its
>   **Configuration** panel must show secrets redacted. *(The old `/admin/health` and
>   `/admin/config` paths redirect here.)*
> - **Usage** — non-zero `requests`, `arag.errors` sane relative to `arag.calls`, and the **Cache**
>   panel showing `hits ≫ misses`. Watch `stale` too: climbing as fast as `hits` means the TTL is
>   shorter than the traffic pattern. There should be no `dashboard:` key (§4).
> - **Taxonomy & Agents** — all three agents `completed`/`configured`/`running`, none stuck or
>   `absent`, and the labelsets reporting `provisioned: true`. This answers "did provisioning
>   actually succeed", which nothing else does.
> - **Audit** — the change history. And this is where to be honest rather than impressive: it
>   records **configuration** only. It will show who changed a limit or issued a key; it will not
>   show who deleted a call or published a share link.
>
> Together: "is it up", "is it being used and is the cache earning its keep", "did provisioning
> succeed", "who changed what". The fourth is the one a customer's compliance reviewer asks about,
> and the one with a gap to disclose.

---

**16. "Environment variables are defaults; the settings store is the authority." What makes "no
restart" true, and what does that design cost?**

> `applyToRuntime()` (`services/config.ts`), called at boot and again after every settings write.
> It does not rebuild the runtime — it **mutates the memoised container on `globalThis` in place**:
> reassigning `rt.branding`, the scalars on `rt.env`, and where needed `rt.cache` (a whole new
> `TtlCache`, because `ttlMs` is `readonly`) and `rt.arag` (a new `AragClient` followed by
> `rt.cache.clear()`, since every entry came from the old Knowledge Box).
>
> It was chosen over an `effectiveSettings()` object every consumer must consult, which is one
> forgotten call site away from a setting that saves, renders as saved, and silently does nothing.
>
> Two costs. **The boot-time values are destroyed by the first override**, so `rt.envDefaults` and
> `rt.envBranding` exist purely to make "reset to environment defaults" a real operation rather
> than a synonym for "restart the process" — visible in the `Runtime` interface. And **there is no
> declarative registry**: adding one setting means editing four places by hand (the interface plus
> its validator, `EnvDefaults` plus the reset list, the OpenAPI request schema, and the read model
> plus its panel). Whether that is acceptable maintenance is fair to raise in review.

---

**17. A customer's security reviewer asks about share links. Walk the controls, then give them the
one thing that would change your answer.**

> **Controls:** a 256-bit `randomBytes(32)` token, never derived from the call id; scoped to
> exactly one call, rendered in the same workspace component with `readOnly` (no Ask, no Share, no
> Export, no write affordance); a 1–90 day expiry, default 7; revocable, and the row is kept so the
> register shows history; unknown, revoked and expired tokens all return an **identical** plain
> `404`, so there is no oracle for "was this ever valid"; and a retention purge revokes every live
> link for a purged call in the same pass, so no URL survives its recording (D-CA-38).
>
> **Two things to volunteer rather than wait to be asked.** The token is stored **in plaintext** —
> it is the document id in `shares.json` — unlike API keys, which are SHA-256 digests. And creation
> and revocation are **not audited**.
>
> **What would change the answer:** whether the deployment enforces API keys. The justification for
> both the plaintext storage and the `auth: "api"` carve-out (D-CA-27, the one deliberate exception
> to D-CA-13) is that a share grants no access the open read API already grants to anyone. That is a
> statement about a *configuration*, not about the code — and it stops being true the moment keys
> are enforced, at which point a share link becomes the one way data leaves this product with no
> deployment credential at all, stored in the clear, with no record of who published it. On an open
> demo: a documented trade-off. On a key-enforced PHI deployment: a finding.

---

**18. A partner white-labels this product for utility-company calls, rewrites
`lib/domain/taxonomy.ts`, and redeploys to a cluster that has run for six months. What do their
users see?**

> **The old health-insurance taxonomy, unchanged.** `seedTaxonomy()` copied the shipped definitions
> into `DATA_DIR/taxonomy.json` on that cluster's first boot and wrote a `seeded` marker; it returns
> at that guard on every later read, and there is no re-seed operation (D-CA-37). Calls keep being
> classified as *Claims* and *Prior Authorization*. In sample mode it is worse than nothing: the
> mock Knowledge Box **is** re-seeded from source at boot, so labelsets appear
> `provisioned: true, defined: false` — present upstream, unknown to the product, excluded from the
> labeler's derived operations.
>
> The seed-once behaviour is correct — it is what stops a redeploy silently reverting a partner's
> own customisations. The gap is that there is no supported migration path beside it: no re-seed,
> and no way to restore a shipped labelset (`restoreLabelset()` exists in the service layer,
> unit-tested, reachable from no route and no button), while every settings section has
> `DELETE /api/v1/settings/{section}`. The partner's options are a deliberate migration through
> `POST`/`DELETE /api/v1/labelsets`, or resetting the store and losing every operator
> customisation with it. That belongs in their release notes, and the missing reset belongs in
> yours to the product owner.
