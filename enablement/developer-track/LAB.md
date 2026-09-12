# Call Analysis — Developer Lab

**Time:** 60–90 minutes. **Prerequisites:** [bun](https://bun.sh), Node ≥ 22.18, a terminal, a
browser. **No ARAG credentials required** — everything runs against the in-process mock ARAG
server (`ARAG_MOCK=1`), which is what `make dev` falls back to when `.env` has no `ARAG_API_KEY`.

Work from a clone of this repo on branch `mvp`. Do not edit anything under `docs/` or
`enablement/` as part of the exercises — those are separate from the product code you're touching.

| Section | Time | Goal |
|---|---|---|
| 1. Run the app and the API | 10 min | Mock mode up, dashboard open, Swagger try-it-out, one curl |
| 2. Read the contract | 10 min | Understand `lib/openapi.ts` and the validation/error pipeline |
| 3. Exercise 1 — add a read endpoint | 20 min | `GET /api/v1/calls/{id}/moments` |
| 4. Exercise 2 — extend the taxonomy | 15 min | New label, provisioned, visible as a filter facet |
| 5. Exercise 3 — cache behaviour | 15 min | Observe, invalidate, measure |
| 6. Wrap-up and further reading | 5–10 min | Where to go next |

---

## 1. Run the app and the API (10 min)

```bash
make install     # bun install --frozen-lockfile
make dev         # starts Next.js on :3000
```

`make dev` checks `.env` for `ARAG_API_KEY`. Since a fresh clone has none, it prints a line
telling you it is starting against the mock ARAG and sets `ARAG_MOCK=1` and
`ADMIN_TOKEN=dev-admin-token` for you. On first request, the mock is seeded with real call
transcripts (`CALLS_MOCK_SEED`, default 12, plus one platform sample call) and the product's own
labeler and `ask` data-augmentation agents run against them synchronously — so everything you see
below is real, non-empty data, not placeholders.

Open, in order:

1. **http://localhost:3000** — the dashboard. KPIs and charts aggregated from every call's
   generated `call_metrics` field.
2. **http://localhost:3000/calls** — category rails, full-text search, and label filters.
3. **http://localhost:3000/api/v1/swagger** — Swagger UI over the live OpenAPI document, with
   "Try it out" enabled. Expand `GET /api/v1/calls` and execute it with no parameters.
4. **http://localhost:3000/api/v1/docs** — the same contract rendered by Redoc, if you prefer to
   read it as reference documentation.

Now hit the API from the terminal:

```bash
curl -s "http://localhost:3000/api/v1/calls?page_size=3" | head -c 800; echo
```

You should get back a JSON page: `{"items":[...],"page":1,"page_size":3,"total":...,"next_page":true}`.
Copy one `id` from the response and fetch its detail:

```bash
curl -s "http://localhost:3000/api/v1/calls/<id>" | head -c 400; echo
```

Finally, sign in to the admin panel at **http://localhost:3000/admin** with token
`dev-admin-token` (or whatever `ADMIN_TOKEN` you set) and look at **Health** — it should show
`ok: true` and `mock: true`.

**Checkpoint:** dashboard renders with non-zero totals, `/calls` shows cards, one `curl` against
`/api/v1/calls` returns JSON, admin health is green.

---

## 2. Read the contract (10 min)

Open `lib/openapi.ts`. This file is the single source of truth for the API: it is served at
`/api/v1/openapi.json`, rendered by Redoc and Swagger UI, used to validate every request, and used
by the contract tests. Read top to bottom:

- **Schemas** (`ResourceLabel`, `CallSummary`, `CallDetail`, `Dashboard`, …) — plain JSON Schema
  objects, referenced with the local `ref()` helper (`{ $ref: "#/components/schemas/Name" }`).
- **Paths** — one entry per route, e.g. `/api/v1/calls/{id}`. Each operation carries an
  `operationId`, `tags`, `parameters`/`requestBody`, and `responses`. Every operation spreads
  `...problemResponses` (`err = standardResponses`, imported from the platform) so 400/401/403/404
  problem responses are documented without repeating them.
- **`API_ROUTES`** at the bottom — the list the contract tests use to assert that every documented
  route has a handler file and every handler file is documented, in both directions
  (`test/contract/openapi.test.ts`, `describe("spec ↔ implementation")`).

Now open `lib/api.ts` and read `route()` (the function every `app/api/v1/**/route.ts` file wraps
its handlers in). It is the one place that:

1. Assigns/propagates a request id (`X-Request-Id`).
2. Authenticates the caller (`admin` token, `api` key, or `session` cookie — `enforceAuth` reads
   the `auth` you pass in `RouteSpec`; default is `"none"`, meaning open).
3. Applies the per-IP token-bucket rate limiter (skipped for admin callers and routes marked
   `noRateLimit`).
4. Looks up the operation's schemas with `operationSchemas(openapi, spec.path, spec.method)` and
   validates path params, query params and (for non-GET JSON bodies) the body against them with
   `validate()`, coercing types (e.g. query strings to numbers) as it goes.
5. Builds the `ApiContext` your handler receives (`ctx.params`, `ctx.query`, `ctx.body`, `ctx.rt`
   the shared runtime, `ctx.log`, cookie helpers).
6. Converts anything your handler throws into an RFC 9457 `application/problem+json` response
   (`toHttpError`) — including ARAG upstream failures, which are mapped to safe, generic messages
   so a KB URL or token never reaches a client.

This is why a route handler is almost always three or four lines: `route()` and the spec already
did the auth, validation and error handling.

**Try it:** request an unknown call id and see the shape of a validation-driven error:

```bash
curl -s -i "http://localhost:3000/api/v1/calls/does-not-exist" | head -20
```

You should see `404` with `Content-Type: application/problem+json` and a body with `type`,
`title`, `status`, `detail`, `instance` — the shape `checkResponse` verifies in the contract tests.

**Checkpoint:** you can point to the file and function that (a) validates a query parameter and
(b) turns a thrown error into a problem+json response.

---

## 3. Exercise 1 — add a read endpoint (20 min)

Open **[`exercises/01-add-endpoint.md`](exercises/01-add-endpoint.md)**. You will add
`GET /api/v1/calls/{id}/moments`, a new read endpoint returning the paragraph-level "moment" track
for one call (the same labeler output the transcript view highlights, without the full transcript
text). You'll touch, in order: the spec (`lib/openapi.ts`), a service function
(`services/calls.ts`), the route handler (a new `app/api/v1/calls/[id]/moments/route.ts`), and a
contract test (`test/contract/openapi.test.ts`).

Starter scaffolding (an empty route file and a spec fragment to fill in) is in
[`starter/exercise-1-moments/`](starter/exercise-1-moments/); [`starter/README.md`](starter/README.md)
explains how to use it. The worked solution, including every file's final contents, is in
[`solutions/01-add-endpoint.md`](solutions/01-add-endpoint.md) — try the exercise before you read it.

**Acceptance:** `make check` passes, and:

```bash
curl -s "http://localhost:3000/api/v1/calls/<id>/moments" | head -c 400; echo
```

returns `{"id":"...","paragraphs":[{"index":0,"moments":[...]},...]}`.

---

## 4. Exercise 2 — extend the taxonomy (15 min)

Open **[`exercises/02-extend-taxonomy.md`](exercises/02-extend-taxonomy.md)**. You will add a new
label to the `disposition_flags` labelset in `lib/domain/taxonomy.ts` (or add a whole new
labelset — the exercise gives you the choice), re-provision it against the running mock, and watch
it appear as a filter facet in the `/calls` explorer and in `GET /api/v1/labelsets`.

Provisioning applies the taxonomy to the Knowledge Box. You can trigger it two ways:

- **Admin panel:** http://localhost:3000/admin/agents → "Re-provision labelsets + agents".
- **API:** `curl -s -X POST http://localhost:3000/api/v1/admin/provision -H "Authorization: Bearer dev-admin-token" -H "Content-Type: application/json" -d '{"agents": false}'`
  (`agents: false` skips re-running the labeler/ask agents, which is faster while you're just
  adding a label definition — the labelset itself is still created/updated).

**Acceptance:** `GET /api/v1/labelsets` includes your new label, and it shows up as a filter chip
on `/calls`.

---

## 5. Exercise 3 — cache behaviour (15 min)

Open **[`exercises/03-cache.md`](exercises/03-cache.md)**. `services/cache.ts`'s `TtlCache` is
what keeps the dashboard and the calls list off an N+1-fetch-per-view pattern against ARAG. You
will:

1. Read the stats at **http://localhost:3000/admin/cache** and at
   `GET /api/v1/admin/usage` (note `arag.calls`).
2. Reload `/calls` twice and confirm the second load does not increase `arag.calls` (cache hit).
3. Invalidate the `summary:` namespace (button on `/admin/cache`, or
   `POST /api/v1/admin/cache/invalidate` with `{"prefix":"summary:"}`) and reload `/calls` again —
   watch `arag.calls` jump by roughly one request per call on the page.
4. Explain, in your own words, what `CALLS_CACHE_TTL_MS` trades away.

**Acceptance:** you can show a before/after `arag.calls` delta caused by an explicit invalidation,
and you can state the staleness window this cache accepts and why uploads/deletes bypass it
(`invalidateCall()` in `services/calls.ts`).

---

## 6. Wrap-up and further reading

You've now touched every layer this product has: the OpenAPI contract, the `route()` adapter, a
service function, the taxonomy that drives ARAG's data-augmentation agents, and the cache that
keeps read cost bounded. From here:

- `docs/developer/extension-points.md` — the supported ways to extend this product without
  forking the request pipeline.
- `docs/architecture/arag-integration.md` and `docs/ARAG_NOTES.md` — the ARAG mechanics this
  product relies on (labelers, `ask` agents, citations, one-running-task-per-type).
- `DECISIONS.md` — why the API is shaped the way it is (`D-CA-01` through `D-CA-11`), including
  why Next.js' router owns `/api/v1` instead of the platform's.
- `enablement/architect-track/WORKSHOP.md` — the reference-architecture view of the same system,
  sizing guidance and a design-review checklist, if you're evaluating this for a real deployment.
- `test/` — read `test/unit/services.test.ts` and `test/integration/handlers.test.ts` for fast,
  in-process test patterns; `test/contract/openapi.test.ts` for the spec/implementation parity
  checks; `test/e2e/*.spec.ts` for the Playwright walkthroughs `make e2e` runs.

If you have time left, try wiring your Exercise 1 endpoint into the call-detail page's transcript
view as a small UI enhancement — it's optional and not covered by the knowledge check.

Finish with **[`knowledge-check.md`](knowledge-check.md)** (10–15 questions, answers included).
