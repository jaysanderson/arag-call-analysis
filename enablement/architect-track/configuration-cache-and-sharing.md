# Module — Configuration, cache and sharing

**Time:** 45 minutes. **Audience:** solution architects and technical evaluators. **Format:**
presenter-led, with three short group exercises. Every claim is checkable against a running sample
deployment (`ARAG_MOCK=1`) in the time it takes to say it.

This is the module for the three designs that changed most between the first product pass and now,
and the three a customer's architect will interrogate hardest:

| § | Design | Decisions |
|---|---|---|
| 1 | **Settings as a store** — the environment is a default, the store is the authority | D-CA-34, D-CA-35, D-CA-42, D-CA-45 |
| 2 | **Stale-while-revalidate** — what the stall actually was, and why a longer TTL was the wrong fix | D-CA-40 |
| 3 | **Share links** — a bearer credential for one call, and what it is allowed to be worth | D-CA-27, D-CA-38 |

---

## 1. Settings as a store (15 min)

### The bar, and why it is hard

The owner's requirement was blunt: *nothing configurable is read-only in the UI, and a change takes
effect without a restart.* That is easy to say and easy to fake. The interesting question is what
it forces architecturally.

### The shape

```
BRAND_*, ARAG_*, CALLS_*   ──read once at boot──▶   rt.env, rt.branding, rt.arag
        (environment)                                       │
                                                            │  ◀── applyToRuntime()
DATA_DIR/settings.json     ──read at boot, and on         ──┘
        (the store)          every write────────────────────
```

`applyToRuntime()` (`services/config.ts`) runs at boot from `buildRuntime()`, and again at the end
of every `PUT`/`DELETE /api/v1/settings/{section}`. It does not construct a new runtime — it
**mutates the memoised container on `globalThis` in place**:

- `rt.branding` — replaced with a merged, re-validated object.
- `rt.env.maxQuestionChars` / `maxUploadBytes` / `rateLimitRps` / `rateLimitBurst` — assigned.
- `cacheTtlMs` moved → `rt.cache = new TtlCache(ttl)`. A whole new cache, because `TtlCache.ttlMs`
  is `readonly`: an entry's `expiresAt` is stamped when it is written, so there is no correct way
  to re-date existing entries under a new policy.
- A connection field moved, **in live mode** → a new `AragClient` assigned to `rt.arag`, then
  `rt.cache.clear()`, because every cached value came from the previous Knowledge Box. In **mock**
  mode the branch returns early: re-pointing the in-process sample KB would strand the sample data
  irrecoverably, and the Settings screen says so rather than pretending.

**The alternative, and why it was rejected.** The obvious design is an `effectiveSettings()` object
that every consumer consults. It is more explicit, it is easier to test in isolation — and it is one
forgotten call site away from a setting that saves, renders as saved, and silently does nothing.
Mutating one container means a call site cannot forget, because there is nothing to remember: it
reads `rt.env.maxQuestionChars` exactly as it always did.

**What reset costs.** Because `applyToRuntime` mutates in place, the boot-time values are gone the
moment the first override lands. So `rt.envDefaults` and `rt.envBranding` exist purely to make
"Reset to environment defaults" a real operation rather than a synonym for "restart the process".
That is the price of the design, and it is visible in the `Runtime` interface.

### The four sections

| Section | Keys | Applied to |
|---|---|---|
| `branding` | `productName`, `tagline`, `footerText`, `poweredBy`, `primaryColor`, `accentColor`, `logoUrl`, `docsUrl`, `supportUrl` | `rt.branding` |
| `connection` | `kbId`, `region`, `baseUrl`, `generativeModel`, `reranker`, `timeoutMs`, `apiKey` (write-only) | `rt.env.arag`, and a replacement `rt.arag` |
| `limits` | `maxQuestionChars`, `maxUploadBytes`, `rateLimitRps`, `rateLimitBurst`, `cacheTtlMs` | `rt.env`, and a replacement `rt.cache` |
| `retention` | `days`, `enabled` | read by `services/retention.ts` on demand |

There is **no declarative registry** of settings. Adding one means touching four places by hand —
the interface plus its `validate*()` in `config.ts`, `EnvDefaults` plus the reset list in
`runtime.ts`, `SettingsUpdateRequest` in `lib/openapi.ts`, and the read model plus its panel. The
five-step recipe is in `docs/developer/extension-points.md`. Whether that is acceptable
maintenance or a refactor waiting to happen is a fair thing for a review to raise.

### Secrets, and a recorded exception

Three things hold together and should be presented together:

1. **Write-only.** `connection.apiKey` is accepted on write and returned by no read model ever.
   Empty string means "leave it alone." (**D-CA-35**.) This avoids both a second disclosure surface
   *and* the round-trip footgun: a form that posts back what it rendered would wipe the
   service-account token the moment an operator saved an unrelated field.
2. **It is written to disk.** `DATA_DIR/settings.json` may hold the Knowledge Box credential — a
   deliberate, recorded exception to STANDARDS §4 ("secrets only from env, never files"), because a
   rotation that does not survive a restart is not a rotation, and a running process cannot write
   to its own environment. The file is `chmod 0600` on every settings write (**D-CA-45**).
   Operators who would rather it never touch disk simply do not rotate through the product;
   `ARAG_API_KEY` keeps working, and `connection.apiKeyOverridden` reports which is in force.
3. **Audited, reduced.** Every write records `settings.<section>` with the keys that changed;
   secrets are reduced to `true`.

### The authorisation split

`PUT /api/v1/settings/{section}` is `auth: "admin"`. An API key gets `401 Admin token required`.
The same key gets `201` from `POST /api/v1/views`.

That split is **D-CA-42**, and the line is worth stating in the customer's own terms: *a key
authorises using the deployment's data; it never authorises changing the deployment.* Settings, API
keys and retention purge are operator-only. Taxonomy and saved views are not, because editing a
labelset changes what the product classifies with — which is the product's job, not an
administrator's privilege. A contract test asserts the split.

> **Group exercise (5 min).** A customer wants their integration partner to be able to raise
> `rateLimitRps` when their nightly batch runs, without giving out the operator token. What do you
> tell them? *(Draw out: there is no scoped-permission model here — `admin` is all-or-nothing.
> Options are a second deployment, an operator-side scheduled call, or proposing per-section
> authorisation upstream. The honest answer is "not today", and naming that is worth more than
> improvising a workaround.)*

---

## 2. Stale-while-revalidate, and the stall it fixed (15 min)

### The bug, precisely

This is the best failure story in the codebase, and it is worth walking slowly, because the naive
fix is wrong in an instructive way.

The dashboard aggregate used to be cached under its own key, `dashboard:all`. That entry was
written **when its own loader resolved** — which is necessarily *later* than the `summary:<id>`
entries the loader read to build it. So the two lifetimes were offset:

```
t=0      summary:<id> × N written          (expire at t=60s)
t=0.8s   dashboard:all written             (expires at t=60.8s)
...
t=60.2s  someone opens the dashboard  →  dashboard:all is still fresh. Renders instantly.
                                         Re-warms nothing.
t=60.4s  they click a drill-through   →  /calls reads summary:<id> × N. All expired.
                                         Pays the entire 1+N fan-out, cold. ~8 seconds.
```

Two properties make this nasty. The stall lands on the screen *after* the one that caused it, so it
looks like a bug in the calls list. And the dashboard — the screen that had just read every summary
in the catalogue — was the one screen in a position to keep them warm, and was doing the opposite.

**Why a longer TTL is the wrong fix.** It widens the stale window for every reader and moves the
cliff; it does not remove it. Whatever the TTL, there is a moment when `dashboard:all` is fresh and
every `summary:<id>` is not, and somebody walks off it.

### The fix, in two halves

1. **`getOrLoadStale()`** for the two hottest read models, `catalogIds()` and `summaryOf()`. Inside
   the TTL: a hit. Expired but within `graceMs` (default `ttlMs * 9`): the stale value is returned
   **immediately** and a refresh starts behind the caller. Beyond the grace window, or never
   loaded: a normal blocking load. Only a genuinely cold key waits.
2. **`dashboard:all` deleted.** `aggregate()` was made pure and O(N), cheap enough to re-run per
   render straight from the `summary:<id>` entries — so every dashboard render *is* the thing that
   re-warms exactly what the calls list reads next. Removing a cache made the system faster.

Two implementation details worth showing on a slide:

- The background refresh calls the cache's internal `load()`, **not** `getOrLoad()`. `getOrLoad()`
  begins with `get()`, which *deletes* an expired entry — evicting the very value the next reader
  was about to be served. Getting that wrong produced a mechanism that served stale exactly once
  and then blocked, which reads as a race and is not one.
- The safety precondition, written into the code as a comment: serve-stale is sound **only for read
  models the product itself invalidates on write.** Every mutation here calls `delete`,
  `invalidatePrefix` or `clear` outright. Under `getOrLoad()` a missed invalidation self-corrects
  within one TTL; under `getOrLoadStale()` a reader can be handed a value ten TTLs old. That is why
  it is applied to two functions and not blanket-applied to the cache.

Secondary mitigations shipped with it, both worth noting because neither is a cache change:
`/calls` got its own `loading.tsx`, and the dashboard's ~35 drill-through links dropped Next's
automatic prefetch, which was saturating the browser's connection pool immediately before the click.

### What to check on a real deployment

```bash
curl -s "$B/api/v1/admin/cache" -H "Authorization: Bearer $T" | python3 -m json.tool
```

`stats.stale` is the counter to watch. A healthy warm deployment shows `hits ≫ misses` with `stale`
climbing slowly; `stale` climbing as fast as `hits` means the TTL is shorter than the traffic
pattern. `keys` should contain `catalog:` and `summary:<id>`, and **no `dashboard:` key** — if one
ever reappears, the stall is back.

> **Group exercise (5 min).** The customer runs three Fly machines. Walk through what
> stale-while-revalidate does to the multi-machine staleness window from `sizing-deployment.md`.
> *(Draw out: each machine has its own cache, so the window was already per-machine; SWR extends
> the worst case from `ttlMs` to `ttlMs + graceMs` on each of them independently. For a KPI
> dashboard that is fine and should be disclosed; for a read-your-own-write requirement across
> replicas it was never acceptable and SWR does not change that verdict, it just makes the number
> larger.)*

---

## 3. Share links (15 min)

### What one is

`POST /api/v1/calls/{id}/shares` with `{ ttlDays?, note? }` returns a `ShareLink`:

```json
{ "token": "aAhCfSr_0G4WiAGDCz8gr7wv9QOU2iPPZNuhiNOlBuk", "callId": "…", "callTitle": "…",
  "url": "/s/<token>", "createdISO": "…", "expiresISO": "…", "revoked": false, "expired": false }
```

- **Token:** `randomBytes(32).toString("base64url")` — 256 bits, never derived from the call id, so
  knowing a call gets you no closer to a link for it.
- **Scope:** exactly one call. `/s/<token>` renders the same `CallWorkspace` component the product
  uses, with `readOnly` — no Ask tab, no Share, no Export, no kebab, label chips do not link.
- **Expiry:** `ttlDays` clamped to 1–90, default 7.
- **Revocation:** sets `revokedISO`; the row is never deleted, so the register keeps a history.
- **Resolution:** unknown, revoked and expired tokens all return an identical plain `404`. The code
  comment says it outright: it never says which. There is no oracle for "was this ever valid".
- **Purge interaction:** `runPurge()` revokes every live share for a purged call in the same pass,
  so retention cannot leave a URL resolving to a deleted recording (**D-CA-38**).

### The two properties a security reviewer will challenge

**(a) The token is stored in plaintext, while API keys are hashed.**

`services/shares.ts` uses the token *as the document id*. A leaked `shares.json` is a set of working
links; a leaked `apikeys.json` is a set of useless digests. That asymmetry is deliberate, and the
argument for it is about what each credential is worth: an API key authorises writes against the
whole deployment, a share token authorises a read-only view of **one call** that the open read API
already serves to anyone. Whether that argument holds depends entirely on the deployment — and this
is the point to make to the customer, because on a deployment where `API_KEYS` **is** configured,
the read API is *not* open, and the share token is then granting access that nothing else grants.
**Recommendation for a review:** if the customer's deployment enforces API keys, raise plaintext
share-token storage as a real finding, not a documented trade-off.

**(b) `POST` on shares is `auth: "api"`, not `"write"` — the one deliberate exception to D-CA-13.**

The stated reasoning: a share writes *application* state (a pointer and an expiry), never touches
the Knowledge Box, and grants no access the open read API does not already grant. A contract test
pins the exception and requires the spec to explain it, which is the right way to hold a carve-out.
The counter-argument is the same one as (a): "grants no access the read API does not" is a
statement about a *configuration*, not about the code, and it stops being true the moment keys are
enforced. And `GET /api/v1/shares/{token}` is unauthenticated by necessity — the token **is** the
credential — so a share link is the one way data leaves this product without any deployment-level
credential at all.

### The gap to name

**Creating and revoking a share link is not audited.** Settings, API keys, labelsets, agents,
retention purges and job cancellations all write an `audit()` entry; `/api/v1/shares`,
`/api/v1/views` and `/api/v1/calls` write none. So the trail can tell an operator who changed the
rate limit, and cannot tell them who published a call transcript to an unauthenticated URL, or who
deleted a recording. For a contact-centre product handling PHI, that is the audit gap to raise
first. It is a small change — the `audit()` helper and `actorOf()` already exist and are called
fifteen lines away in neighbouring routes.

> **Group exercise (5 min).** The customer asks for share links that expire in 10 minutes and are
> single-use. What can this product do today, what cannot it do, and which of the two gaps would
> you build first? *(Draw out: `ttlDays` is integer days with a floor of 1, so ten minutes is not
> expressible; single-use has no representation at all — `resolveShare()` is a plain lookup with no
> use counter. Both are small additions to `ShareDoc`. The interesting part is which they actually
> need: a short TTL is usually a proxy for "I do not want this forwarded", which single-use serves
> better, and neither survives a screenshot — so the real answer may be a watermark and an audit
> entry rather than either.)*

---

## Take-aways

1. **Settings as a store** buys "no restart" at the price of a mutable runtime container and a
   hand-maintained registry. Ask what happens to the boot-time value — if there is no answer, reset
   is not a real feature.
2. **The stall was a cache-lifetime offset, not a cache-size or TTL problem.** The fix removed a
   cache. When a screen re-reads what another screen is about to need, the warming relationship
   between them is part of the design.
3. **Share links are the one credential in this product that is worth exactly as much as the
   deployment's read posture makes them worth.** Review them against the configuration, not against
   the code.

## Read next

- `DECISIONS.md` — D-CA-34, 35, 37, 38, 39, 40, 42, 45, 46, 47.
- `docs/developer/extension-points.md` — "The settings model", "Swap the cache", "Retention and
  purge", and the five-step "Adding a setting" recipe.
- `docs/architecture/security-model.md`, `docs/architecture/scaling.md`.
- `enablement/developer-track/exercises/` 03, 04, 05 and 06 — the hands-on versions of §1 and §2.
