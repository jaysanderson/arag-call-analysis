# Developer Track — Knowledge Check

**Time:** 20 minutes. Eighteen questions, mixing recall (what the code does) and judgement (why
it is built that way). Answer, then check yourself. Questions 11–18 cover the surfaces added after
the first product pass; if you ran the whole lab you have executed every one of them.

---

**1. What puts this app in sample mode, and why is setting it on the command line enough even
though `.env` holds live credentials?**

> `ARAG_MOCK=1`. The platform's `loadDotEnv()` loads `.env` **without overwriting a variable that
> is already set**, so a value exported in the real environment always wins over the file. That is
> also why the lab's start line is `ARAG_MOCK=1 ADMIN_TOKEN=… DATA_DIR=… make dev` rather than
> relying on the Makefile's own check, which only falls back to the mock when `.env` has no
> `ARAG_API_KEY` at all.

---

**2. Name the single source of truth for the API contract, and four different consumers of it.**

> `lib/openapi.ts`. Consumers: served at `/api/v1/openapi.json`; rendered by Redoc
> (`/api/v1/docs`), Swagger UI (`/api/v1/swagger`) and the in-product explorer at `/api`, which
> fetches it **at runtime** so the list is provably what the deployment serves (D-CA-41); used by
> `operationSchemas()` inside `route()` to validate every request; and used by the contract tests
> (`lintSpec`, `checkResponse`, and the `API_ROUTES` parity checks in both directions). It
> currently declares 62 operations across 13 tags.

---

**3. A route handler throws `notFound("Call")`. Trace what happens before a byte reaches the
client, and name the response's `Content-Type`.**

> `route()` (`lib/api.ts`) catches it. `toHttpError()` sees it is already an `HttpError` and
> returns it unchanged. `problemResponse()` serialises `err.toProblem(instance, requestId)` with
> status `404` and `Content-Type: application/problem+json; charset=utf-8`. Security headers and
> any queued cookies are then applied by `applyHeaders()`.

---

**4. Why does `toHttpError()` map every `AragError` to a generic message?**

> So the Knowledge Box's URL, id or service-account token can never reach a browser in an error
> body. The real detail is logged server-side against the request id, so an operator can still
> correlate it.

---

**5. Name the four `auth` modes in `API_ROUTES` and give one route for each.**

> `none` — `GET /api/v1/calls`. `api` — `GET /api/v1/views` (open until the deployment has ever had
> a key). `write` — `DELETE /api/v1/calls/{id}`, `PUT /api/v1/labelsets/{id}` (operator token or a
> real API key; the demo session cookie never suffices — D-CA-13). `admin` — `PUT
> /api/v1/settings/{section}`, everything under `/api/v1/admin/*` (the operator token specifically;
> an API key is refused with `401 Admin token required` — D-CA-42).

---

**6. `GET /api/v1/calls` returns `facets` alongside the page. Over which set are the counts
computed, and why not over the fully filtered set?**

> Over the structurally-filtered set (search, date window, agent, queue, lifecycle) but **before**
> the label filter is applied (D-CA-24). Counting after it would collapse every other facet to zero
> the moment one label was selected, so the filter bar could never show you what else you could
> narrow to.

---

**7. What does `getOrLoadStale()` do that `getOrLoad()` does not, and what bug motivated it?**

> Within `graceMs` (default `ttlMs * 9`) of expiry it returns the **expired** value immediately and
> starts a refresh behind the caller; only a genuinely cold or beyond-grace key blocks. It was
> motivated by an eight-second stall on the calls list after a dashboard drill-through (D-CA-40):
> `dashboard:all` was written when its own loader resolved, so it was stamped later than the
> `summary:<id>` entries it was built from — the dashboard rendered instantly from its own fresh
> entry while re-warming nothing, and the next screen paid the whole 1+N fan-out cold.

---

**8. Why is there no `dashboard:` cache key any more, and why is its absence the fix?**

> `aggregate()` was made pure and O(N) so the dashboard is recomputed per render directly from the
> `summary:<id>` entries. Because it now reads those entries rather than a cache of its own, **every
> dashboard render re-warms exactly what the calls list will read next.** A separate dashboard key
> was what let the two screens' cache lifetimes diverge in the first place.

---

**9. `services/calls.ts`'s `createCall()` calls `invalidateCall()` before returning. What would a
caller observe if that line were removed — and why is that worse under stale-while-revalidate?**

> They could upload a call, get a `202` with its id, and still not see it in `GET /api/v1/calls`.
> Under `getOrLoad()` that lasts at most one TTL. Under `getOrLoadStale()` a reader can be served a
> value up to `ttlMs + graceMs` — ten TTLs, ten minutes at the default — old. Serving stale is only
> sound because every write path deletes outright; it converts a one-minute bug into a ten-minute
> one the moment a write path forgets.

---

**10. `TtlCache`'s `delete`/`invalidatePrefix`/`clear` also mark in-flight loads `dirty`. What race
does that close?**

> A load that started *before* a write and resolves *after* it would otherwise repopulate the key
> the write had just removed — a deleted call reappearing in the list for a whole TTL. A dirty
> load returns its value to its own caller and declines to store it.

---

**11. `lib/domain/taxonomy.ts` is no longer the taxonomy. What is it, and what is?**

> It is the **seed**. `seedTaxonomy()` (`services/taxonomy-store.ts`) copies `ALL_LABELSETS` and
> `AGENTS` into `DATA_DIR/taxonomy.json` the first time anything reads it, writes a `seeded`
> marker, and never runs again (D-CA-37). From then on the store is the authority, and the labeler
> agents' `operations` are derived from it on every read. A source edit therefore changes nothing, by
> itself, on a deployment whose store already exists.
>
> Crossing that seam is operator-initiated, never automatic, and there are two ways over it:
> `POST /api/v1/admin/reseed` adds every shipped labelset the store does not hold and edits none
> that it does (`reseedMissing()`), and `POST /api/v1/labelsets/{id}/reset` puts one shipped
> labelset back to its shipped definition and re-provisions it (`restoreLabelset()`). Neither runs on
> boot, because a re-seed on every boot would resurrect a labelset an operator deleted on purpose —
> which is also why a re-seed called explicitly *does* bring such a labelset back: a person asked.

---

**12. Editing a labelset and provisioning it changes no call's labels. Why, and what does?**

> Provisioning writes the **vocabulary** to the Knowledge Box — `putLabelset()` per labelset. It is
> not retroactive. Only re-running the labeler (`POST /api/v1/agents/resource-labeler/start`, or a
> full `POST /api/v1/admin/provision`) reclassifies existing calls, and you must then invalidate
> the read cache or you will watch the old counts for a TTL and think the agent failed.

---

**13. Why does `PUT /api/v1/labelsets/{id}` ignore an `id` in the request body?**

> The labelset id is also the Knowledge Box labelset id, stamped into every label already applied
> to every analysed call. Honouring a rename would orphan that data, so the id is immutable after
> creation and the path always wins (D-CA-37). `?knowledge_box=true` on delete is the related
> asymmetry: removing a labelset from the product's vocabulary is configuration; removing the
> labels already applied is data, so it is a separate, unticked, explicit choice.

---

**14. "Changes take effect with no restart." Name the function that makes that true, and the design
it was chosen over.**

> `applyToRuntime()` in `services/config.ts`, which **mutates the memoised runtime container on
> `globalThis` in place** — reassigning `rt.branding`, the scalars on `rt.env`, and where needed
> `rt.cache` (a new `TtlCache`, because `ttlMs` is `readonly`) and `rt.arag` (a new `AragClient`,
> followed by `rt.cache.clear()`, since every entry came from the old Knowledge Box). It was chosen
> over an `effectiveSettings()` object that every consumer must remember to consult — which is one
> forgotten call site away from a setting that saves, displays as saved, and does nothing
> (D-CA-34).

---

**15. `connection.apiKey` can be written but never read back, and appears in the audit trail as
`true`. Name the two distinct problems that avoids.**

> (a) A credential that can be read back is one more thing a mis-scoped read, a log line or a
> screenshot can disclose. (b) A settings form that renders what it read and posts back what it
> renders would wipe the service-account token the moment an operator saved an unrelated field,
> taking the deployment offline from an edit that had nothing to do with credentials. Hence: empty
> string means "leave it alone" (D-CA-35). Writing it to `DATA_DIR/settings.json` at all is a
> recorded exception to "secrets only from env" (D-CA-45); the file is chmod `0600` on every write.

---

**16. Revoking the last API key does not reopen the API. Why is that correct, and what does reopen
it?**

> `apiKeysEnforced()` asks *"has this deployment **ever** had a key"*, not *"does it have an active
> one"*. The earlier version asked the second question, which meant that revoking a compromised key
> — the exact incident-response action — turned the API **open**, silently, with no way back, since
> the `API_KEYS` seed is idempotent by digest and a restart resurrected the same revoked row
> (D-CA-46). Reopening requires deleting the rows: `DELETE /api/v1/api-keys/{id}?purge=true`.

---

**17. Key material is stored as a SHA-256 digest rather than under a password KDF, and
`verifyApiKey()` keeps comparing after it finds a match. Justify both.**

> A generated key is `randomBytes(24)` — 192 bits — so there is nothing to brute-force offline and
> a deliberately slow hash would only add latency to every authenticated request, against every
> active key. Not stopping at the first match means the response time varies with neither the key's
> **position** in the store nor with whether a match happened at all, so timing leaks neither which
> key matched nor how many exist. (The caveat: this reasoning depends on the entropy. Keys seeded
> from `API_KEYS` may be operator-chosen, which is why `previewOf()` shows eight characters of the
> *digest* for those, and eight of the *secret* only for keys the product generated.)

---

**18. A saved view is stored on the server; the column picker and row density are not. Give the
rule, and say where the filters themselves live.**

> The rule (D-CA-39): **the question is shared, the furniture is not.** A saved view names a work
> queue that a rota of supervisors must all see, so it lives in `DATA_DIR/views.json` and is
> readable by anyone who can read the API. Columns and density are one person's preference, so they
> live in that browser's `localStorage` (`ca.calls.columns`, `ca.calls.density`) and appear nowhere
> in the URL — a link therefore carries your question and the recipient's own furniture. The
> filters, search, sort, page, date window and table/browse mode all live in **the URL**, which is
> what makes them linkable, pasteable and back-button-able; a saved view is just a name for one,
> re-parsed through an allowlist on the way in because it is a URL the product will later follow.

---

## Stretch questions

No answers supplied. These have real disagreement in them.

**S1.** You changed one label's description and six calls were reclassified, four of them wrongly.
What would you need to add to this product before you would let a customer edit descriptions on a
deployment with 8,000 analysed calls?

**S2.** `lib/drilldown.ts` declares every dashboard figure together with the filter that reproduces
it, and `test/integration/dashboard-drilldown.test.ts` asserts each figure equals the count its own
link returns. Read both, then argue the other side: what does this design cost, what does it stop
anyone from doing, and is a declaration the right mechanism or would you have preferred the two
tiles that cannot be filtered (compliance, CSAT) to be linked some other way? Then find the half
that is not done: the calls **table** still drops the metric filters, so the link is right and the
list is not.

**S3.** Share tokens are now stored as SHA-256 digests, and the argument that used to justify
storing them in clear — a share grants no access the open read API does not — is *also* the argument
for `POST` on shares being `api` rather than `write`, the one deliberate exception to D-CA-13. So:
if that argument was not good enough to keep the tokens in clear, is it good enough to keep the
carve-out? Argue both sides, then say which you would put in front of a customer's security
reviewer, and whether your answer changes on a deployment that enforces `API_KEYS`.

**S4.** `call.delete`, `call.bulk-delete`, `share.create` and `share.revoke` are audited; creating a
saved view is deliberately not. Defend the exclusion, then attack it. (The defence in the code: a
view is a named query over data the reader can already see and it destroys nothing, and the trail is
capped at 5,000 rows. The attack worth taking seriously: a view is how a reader tells you what they
were looking for, and on a PHI deployment that may be exactly the evidence you want.) Then work out
what `call.bulk-delete`'s `callIds: done.slice(0, 50)` and `truncated` flag cost you when the
selection was five hundred, and whether you would have made the same trade.
