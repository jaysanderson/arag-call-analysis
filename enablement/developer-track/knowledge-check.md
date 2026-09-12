# Developer Track — Knowledge Check

Answer, then check yourself. Questions mix recall (what the code does) and judgement (why it's
built that way).

---

**1. What single environment variable switches this app from a live ARAG Knowledge Box to the
in-process mock, and what does `make dev` do if it's absent from `.env`?**

> `ARAG_MOCK=1`. `make dev` checks whether `.env` has a non-empty `ARAG_API_KEY`; if not, it starts
> Next.js with `ARAG_MOCK=1` and `ADMIN_TOKEN=dev-admin-token` set automatically, so the app runs
> against the in-process mock ARAG server with no credentials needed.

---

**2. Name the file that is the single source of truth for the API contract, and list three
different consumers of it.**

> `lib/openapi.ts`. Consumers: served at `/api/v1/openapi.json`; rendered by Redoc at
> `/api/v1/docs` and Swagger UI at `/api/v1/swagger`; used by `operationSchemas()` inside
> `lib/api.ts`'s `route()` to validate every request; used by the contract tests
> (`lintSpec`, `checkResponse`, and the `API_ROUTES` coverage checks).

---

**3. A route handler throws `notFound("Call")`. Trace what happens to that exception before a
byte reaches the client, and name the response's `Content-Type`.**

> `route()` (`lib/api.ts`) catches it in its `try/catch`. `toHttpError()` sees it's already an
> `HttpError` and returns it unchanged. `problemResponse()` serializes `err.toProblem(instance,
> requestId)` as the body with status `404` and `Content-Type: application/problem+json;
> charset=utf-8`. Security headers and any queued cookies are then applied by `applyHeaders()`.

---

**4. Why does `toHttpError()` map every `AragError` to a generic message instead of forwarding
the ARAG error text to the client?**

> To make sure the Knowledge Box's URL, KB id, or service-account token never leaks to a browser
> in an error body. `AragError` is deliberately translated to safe, generic problem messages
> (e.g. "The Knowledge Box request failed.") while the real detail is logged server-side with the
> request id, so an operator can still correlate it.

---

**5. `GET /api/v1/calls` accepts a repeatable `label` query parameter. What format is each value,
and how are multiple `label` values combined?**

> Each value is `labelset/label` (e.g. `call_reason/Claims`). Repeated `label` parameters are
> ANDed across facets — `filterByLabels()` in `services/calls.ts` keeps a call only if it matches
> every requested `(labelset, label)` pair, not just one.

---

**6. What does `rt.cache.getOrLoad()` do differently from a plain `if (cached) return cached; else
compute` pattern, and why does that matter under load?**

> It de-duplicates concurrent loads for the same key via an in-flight `Map` of promises: if two
> requests ask for the same uncached key at the same moment, the second one gets the *same
> in-flight promise* instead of triggering a second upstream fetch. Without that, a burst of
> concurrent renders for a cold key (e.g. a dashboard opened by several tabs at once right after
> boot) would each independently call ARAG.

---

**7. Name two cache keys that invalidating `summary:*` does NOT clear, and explain why that's
correct rather than a bug.**

> `catalog:*` (catalog ids) and `dashboard:all` (the dashboard aggregate) — also `find:*` and
> `labelsets:all`. It's correct because `summary:` invalidation targets exactly the case "a
> specific call's cached summary might be stale," not "everything derived from calls is stale."
> Clearing every namespace on every invalidation would defeat the purpose of namespacing the cache
> at all.

---

**8. `services/calls.ts`'s `createCall()` calls `invalidateCall(rt, uuid)` before returning. What
would a caller observe if that line were removed?**

> Immediately after a successful upload (`202` with the new call's id), a `GET /api/v1/calls`
> request could still return the pre-upload catalog for up to `CALLS_CACHE_TTL_MS` — the new call
> would appear to not exist yet, even though the upload itself succeeded and returned an id.

---

**9. `POST /api/v1/calls` returns `202`, not `200` or `201`. Why, and what does the response body
contain?**

> `202 Accepted` because creating the ARAG resource is fast (synchronous, so the caller gets an id
> and a `Location` header immediately) but transcription/retrievability is slow and tracked
> separately as a background job. The body is `{ job, call }` — `job` is the `Job` view for
> tracking progress via `GET /api/v1/jobs/{id}` or its SSE stream, `call` is `{ id, title }`.

---

**10. What HTTP header does `GET /api/v1/calls/{id}/media` respect to let a media player scrub
through a recording, and what status code does a partial response use?**

> `Range`. `mediaStream()` (`services/calls.ts`) forwards it to `rt.arag.downloadFileField()`;
> a satisfied range request returns `206 Partial Content`.

---

**11. Why is the `field` query parameter on `GET /api/v1/calls/{id}/media` restricted to an enum
(`media`, `transcript`) in the OpenAPI spec instead of accepting any string?**

> Because it selects which file field on the ARAG resource gets proxied and streamed to the
> browser; an unconstrained field name was the exact vulnerability the pre-audit version had (the
> media route trusted a caller-supplied field name). Constraining it to an enum in the schema means
> `route()`'s validation step rejects anything else with a `400` before the handler ever runs —
> `MEDIA_FIELD_ALLOWLIST` in `services/calls.ts` enforces the same allowlist again at the service
> layer as defense in depth.

---

**12. What does `TRUST_PROXY=fly` change about how the rate limiter identifies a caller, and why
is `xff` (trusting `X-Forwarded-For` blindly) unsafe outside that context?**

> With `TRUST_PROXY=fly`, `clientIp()` reads the `Fly-Client-IP` header, which is set by Fly's own
> edge and cannot be spoofed by a client behind it. `X-Forwarded-For` is client-settable unless a
> proxy you control strips and re-sets it — trusting it blindly would let a single caller rotate
> the header per request and get a fresh rate-limit bucket every time, defeating the limiter
> entirely.

---

**13. A generated `call_metrics.line_of_business` value doesn't match any of the taxonomy's known
enum values. What happens to it, and where is that decision made?**

> It's dropped (set to `undefined`), not rendered — `sanitizeMetrics()` in `lib/parse.ts` checks
> every metrics field with a known enum (`VALID_METRIC_VALUES`) and strips any value not in the
> allowed set, rather than letting a model's refusal sentence or malformed output reach a chart as
> if it were a real category.

---

**14. Why does the demo mock (`lib/mock.ts`) run the product's own labeler and `ask` agents
against the seeded transcripts at boot, instead of shipping pre-baked label/analysis data in the
seed itself?**

> So the mock exercises the real taxonomy (`lib/domain/taxonomy.ts`) end to end, proving the agent
> definitions actually work — not just the UI's ability to render fake data. If the taxonomy has a
> bug (e.g. a malformed `ask` prompt), running it against the mock at boot would surface that the
> same way it would against a live Knowledge Box.

---

**15. `make check` runs three things. Name them, and say which one a change to
`lib/domain/taxonomy.ts` alone (no other file) is most likely to fail, if anything.**

> Lint (`biome check .`), typecheck (`tsc --noEmit`), and tests-with-coverage
> (`vitest run --coverage`). A taxonomy-only change is unlikely to fail any of them by itself
> (there's no test asserting exact taxonomy contents), but it's worth knowing `test/unit/
> services.test.ts` imports `AGENTS` from the taxonomy and would fail to *import* the module (and
> so fail the whole suite) if the edit introduced a TypeScript error — which typecheck would also
> have already caught.
