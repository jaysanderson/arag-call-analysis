# Extension points

## Add an endpoint

The rule (`CONTRIBUTING.md`, enforced by `test/contract/openapi.test.ts`): **spec first, then
handler, then service, then tests.**

1. **Spec.** Add the path/operation to `lib/openapi.ts` — schema(s) in the `schemas` map, the
   operation under `paths`, and an entry in the `API_ROUTES` array (method, path, `auth`, and the
   handler file path). `API_ROUTES` is this product's stand-in for the platform's
   `missingFromSpec(app, doc)` (D-CA-02): Next's file-based routing means there is no single `App`
   instance to introspect, so the contract test walks `app/api/v1` on disk and cross-checks it
   against both the spec and this list.
2. **Handler.** Create `app/api/v1/<path>/route.ts` and export `GET`/`POST`/`DELETE` wrapped in
   `route({ path, method, auth }, handler)` from `lib/api.ts`. That one wrapper gives you request
   ids, authentication, per-IP rate limiting, OpenAPI-driven validation of path/query/body,
   RFC 9457 problem responses, security headers and access logging — a handler only needs to call
   a service and return a value or a `Response`. See any file under `app/api/v1/calls/` for the
   pattern.
3. **Service.** Put the actual logic in `services/`, not in the route file. Handlers stay thin
   (`(ctx) => someService(ctx.rt, ...)`); server components (`app/page.tsx`,
   `app/calls/[id]/page.tsx`) call the *same* service functions through `getRuntime()`, so the demo
   UI and the public API can never drift apart (this is the "one service layer" rule in
   `CONTRIBUTING.md`).
4. **Tests.** A unit test for the new service logic, a case in `test/integration/handlers.test.ts`
   exercising the route in-process, and a `checkResponse` assertion in
   `test/contract/openapi.test.ts` so a shape regression fails the build.
5. Run `make docs` to regenerate `docs/developer/api-reference.md` — never hand-edit it.

## Change the taxonomy

Labelsets and the two data-augmentation agents (resource labeler, paragraph labeler, and the
`call-insights` `ask` agent that writes `call_analysis`/`call_metrics`) are all defined in one
place: `lib/domain/taxonomy.ts`.

To add or change a label:

1. Edit `RESOURCE_LABELSETS` or `PARAGRAPH_LABELSET` in `lib/domain/taxonomy.ts` — add a label,
   change a description (labelers use the description and `examples` to decide what to apply), or
   add a whole new labelset.
2. If you change the *set of allowed values* for a metrics field (e.g. `call_reason`), update the
   matching `Set` in `VALID_METRIC_VALUES` (`lib/parse.ts`) and the `enum` in the `METRICS_PROMPT`
   string in `taxonomy.ts` — these two are not derived from one another and must be kept in sync
   by hand, or a real generated value will be silently dropped by `sanitizeMetrics`.
3. Call `POST /api/v1/admin/provision` (or `node scripts/provision.ts` against a running server, or
   the "Re-provision" button on `/admin/agents`). Provisioning is idempotent: it
   `PUT`s every labelset (`putLabelset`, which replaces by id) and — unless `agents:false` — deletes
   every existing task and restarts the three agents sequentially, because ARAG allows only one
   *running* task per operation type at a time (`services/jobs.ts`, `JOB_PROVISION`).
4. Existing calls keep their old labels/analysis until re-provisioned agents run over them again;
   provisioning does not automatically re-analyze already-processed resources.

The taxonomy is also what the mock ARAG demo mode seeds against at boot (`lib/mock.ts`), so a
taxonomy change is visible in `make dev` immediately, with no live Knowledge Box required.

## Swap the cache

`services/cache.ts`'s `TtlCache` is a small in-process TTL map with hit/miss stats and
single-flight `getOrLoad` (concurrent callers for the same key share one load). It is constructed
once in `lib/runtime.ts` (`new TtlCache(env.cacheTtlMs)`) and threaded through `Runtime.cache`.

To swap it for a shared backend (Redis, etc.) at 10x+ scale (see
[Scaling](../architecture/scaling.md)): implement the same four methods the services call —
`getOrLoad(key, load, ttlMs?)`, `delete(key)`, `invalidatePrefix(prefix)`, `clear()` — plus
`stats()` and `keys()` for the admin cache page, and swap the construction in
`buildRuntime()` (`lib/runtime.ts`). Every cache key already goes through `cacheKeys` in
`services/cache.ts` (`catalog:`, `summary:<id>`, `detail:<id>`, `labelsets:all`, `dashboard:all`,
`find:<query>`), so nothing above the cache layer needs to change.

## Swap the store

`Store` (vendored from the platform, `vendor/arag-platform/src/store/`) persists job records as
JSON files under `DATA_DIR`. `JobManager` (also vendored) is built on top of it in
`lib/runtime.ts` (`new JobManager(store, log, { concurrency: 2 })`) and is the only stateful thing
this product writes to disk — everything else (calls, labels, transcripts, generated analysis) is
ARAG-native and holds no local copy. To move job state to a real database, change the platform
(`vendor/arag-platform` is never edited in place — see `CONTRIBUTING.md`), bump
`PLATFORM_VERSION`, and re-sync with `make sync-platform TARGET=../call-analysis` from the
platform repo. A product-local workaround would swap the `Store` construction in
`buildRuntime()`, same as the cache above.

## Add a new data-augmentation agent

Agents ("tasks" in ARAG's vocabulary) are plain data: `AgentDef` objects in
`lib/domain/taxonomy.ts`'s `AGENTS` array, each `{ key, type: "labeler" | "ask", description,
parameters }`. To add one:

1. Add an entry to `RAW_AGENTS` with a unique `key`, the ARAG task `type`, and `parameters`
   (`name`, `on` — 1 for whole-resource/field, 0 for paragraphs — and `operations[]`; see
   `docs/ARAG_NOTES.md` for the operation shapes ARAG accepts: `label`, `ask`, `qa`, `graph`,
   `extract`, `prompt_guard`, `llama_guard`, `memory`).
2. The `llm` block (`AGENT_LLM = { model: ARAG_GENERATIVE_MODEL || "chatgpt-azure-4o", provider:
   "openai" }`) is injected automatically for every agent in `AGENTS` — a task started without one
   fails silently, so do not construct `AGENTS` by hand.
3. If the new agent is an `ask` writing structured output, remember `json:true` needs a KV schema
   this platform's `/models/kv_schema` endpoint does not support here (returns 404/500) — write
   the JSON shape into the prompt text instead (`json:false`) and parse it server-side with
   `readJsonField` (`lib/parse.ts`), exactly as `call_analysis`/`call_metrics` do.
4. **Only one running task per operation type.** If the new agent's `type` collides with an
   existing one (e.g. a second `ask` task), the two cannot run concurrently — ARAG returns `422`.
   Either fold the new operation into the existing `call-insights` task's `operations[]` array, or
   accept that provisioning runs it sequentially after the others (`services/jobs.ts` already waits
   for `waitTasksIdle()` between agents).
5. `services/agents.ts`'s `classifyAgents` maps `tasks.{configs,running,done}` onto each `AgentDef`
   by matching `parameters.name`, so the new agent shows up on `/admin/agents` automatically once
   it is in the `AGENTS` array — no admin-page changes needed.

## How the mock is seeded

`lib/mock.ts`'s `startDemoMock()` runs once per process (memoised on `globalThis`, so Next's dev
reloads don't spawn duplicates):

1. Starts the platform's `startMockArag()` in-process HTTP server with a seed list built by
   `demoSeed(limit)` — the platform's canonical `SAMPLE_CALL_TRANSCRIPT` plus up to
   `CALLS_MOCK_SEED` (default 12) of the 24 scenarios in `lib/domain/scenarios.ts`.
2. Pre-creates every labelset from `lib/domain/taxonomy.ts`'s `ALL_LABELSETS` with `putLabelset`,
   so mock facets carry real titles/colors (a labeler would otherwise auto-create a labelset with
   only its bare identifier as the title).
3. Starts every agent in `AGENTS` against the mock KB. The mock server applies each task
   synchronously at start (no polling needed), so by the time the first request is served the
   seeded calls already carry labels, moments, `call_analysis` and `call_metrics` — a demo that
   shows empty charts on first load is not a demo (D-CA-08).

To add more/different demo content: edit `lib/domain/scenarios.ts` (24 health-insurance call
scripts, each a list of `{speaker, text}` turns) or raise `CALLS_MOCK_SEED`. The mock never touches
`say`/`ffmpeg` — every mock call is a text transcript synthesized directly into the mock server's
paragraph structure with timestamps, so it runs on Linux/CI with no audio tooling at all.

## How `lib/api.ts` works (adding middleware)

`route(spec, handler)` in `lib/api.ts` is the single choke point every `/api/v1` request passes
through. Reading top to bottom, it: resolves the shared `Runtime` (`getRuntime()`), authenticates
the caller (`authenticate` — admin token/cookie, API key, or session cookie), enforces the route's
`auth` mode, applies the per-IP/per-key token-bucket rate limiter (unless `noRateLimit`), looks up
the operation's schemas from the OpenAPI document and validates+coerces path params, query params
and JSON body against them, builds the `ApiContext` handed to the handler, and finally wraps
whatever the handler returns into a `Response` with security headers, `X-Request-Id` and any
queued `Set-Cookie`s — catching everything into an RFC 9457 problem response on the way out.

To add cross-cutting behavior for every route (e.g. a new header, a new counter), it goes in this
one function rather than in each handler. To add a route-local behavior, add a field to
`RouteSpec` (mirroring `body`, `noRateLimit`, `bodyLimit`) and branch on it inside `route()` — that
keeps every handler's own code limited to "call a service, return the result."
