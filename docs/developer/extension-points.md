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

## The settings model: environment defaults, store authority

Every value this product reads from configuration is editable at runtime. The rule, implemented in
`services/config.ts`, is that **environment variables are defaults and the settings store is the
authority**: a value edited in Settings is persisted to `DATA_DIR/settings.json` and is in force
for the very next request, with no restart. `DELETE /api/v1/settings/{section}` restores the
values the deployment booted with.

### The four sections

| Section | Editable keys | Applied to |
|---|---|---|
| `branding` | `productName`, `tagline`, `footerText`, `poweredBy`, `primaryColor`, `accentColor`, `logoUrl`, `docsUrl`, `supportUrl` | `rt.branding` |
| `connection` | `kbId`, `region`, `baseUrl`, `generativeModel`, `reranker`, `timeoutMs`, `apiKey` (write-only) | `rt.env.arag`, and a wholesale replacement of `rt.arag` |
| `limits` | `maxQuestionChars`, `maxUploadBytes`, `rateLimitRps`, `rateLimitBurst`, `cacheTtlMs` | `rt.env`, and a replacement of `rt.cache` when the TTL moves |
| `retention` | `days`, `enabled` | Read by `services/retention.ts` on demand |

### How "no restart" is true

`lib/runtime.ts` memoises one `Runtime` container on `globalThis`, and every read path in the
product reaches configuration through it. `applyToRuntime()` therefore **mutates that container in
place** rather than rebuilding it: it assigns `rt.env.*` scalars, replaces `rt.branding` with a
merged object, and — for a connection change in live mode — constructs a new `AragClient` and
assigns it to `rt.arag`. Every call site reads `rt.arag` at call time, so the swap is atomic from
its point of view, and the cache is cleared because every entry in it was produced by the previous
Knowledge Box.

The alternative — an `effectiveSettings()` object every consumer has to remember to consult — is
one forgotten call site away from a setting that saves and silently does nothing (DECISIONS
D-CA-34). `rt.envBranding` and `rt.envDefaults` are snapshots taken at boot so that a reset is a
real operation rather than a redeploy.

`applyToRuntime()` is also called once during `buildRuntime()`, after the store exists and before
anything else can read the runtime, so the first request after a restart sees the same
configuration the last one did.

### Adding a setting

1. Add the key to `StoredLimits` / `StoredConnection` / `Branding` and to the matching
   `validate*()` function in `services/config.ts`. Validation is not optional: colours and URLs go
   through `safeColor`/`safeLogoUrl`, the same grammar the boot-time reader uses, so a settings
   form is not a way past them.
2. Apply it in `applyToRuntime()`, and add it to `EnvDefaults` in `lib/runtime.ts` plus the
   restore list in `resetSettings()` so a reset can undo it.
3. Add it to `SettingsUpdateRequest` in `lib/openapi.ts` (the schema is
   `additionalProperties: false`, so an unlisted key is rejected with a 400 rather than silently
   ignored) and to the `SettingsView` read model in `services/settings.ts` if it should be
   visible.
4. Add the control to the matching panel under `components/settings/`.
5. Add a test that pins edit → read-back → effect, not just the write.

### Secrets

`connection.apiKey` is **write-only**: accepted by the write, never returned by any read model,
and reduced to `true` in the audit entry. An empty string means "leave the stored credential
alone" — a form that posted back what it rendered would otherwise clear the service-account token
the first time an operator saved an unrelated field, and take the deployment offline with no route
back through the product (DECISIONS D-CA-35).

## Change the taxonomy

The taxonomy is a **store**, not a source file. `lib/domain/taxonomy.ts` seeds
`DATA_DIR/taxonomy.json` the first time anything reads it; every read after that comes from the
store, and labelsets are created, edited and deleted in the product
(`services/taxonomy-store.ts`).

So there are two ways to change it, and the first is usually the right one.

### In the product

`/taxonomy` (Agents & Taxonomy), or the API:

| Operation | What it does |
|---|---|
| `POST /api/v1/labelsets` | Create a labelset, and write it to the Knowledge Box in the same request |
| `GET /api/v1/labelsets/{id}` | One definition |
| `PUT /api/v1/labelsets/{id}` | Replace the definition and re-provision it |
| `DELETE /api/v1/labelsets/{id}` | Remove it from the product's vocabulary |
| `POST /api/v1/labelsets/{id}/provision` | Write one labelset to the Knowledge Box |

A definition is `{ id, title, color, multiple, kind, labels[] }`; every label needs a
`description`, because the description is the instruction the labeler agent actually reads. `id`
must match `^[a-z][a-z0-9_]{1,48}$`, a labelset may hold at most 60 labels, and `color` must be
hex.

Two rules are worth knowing before you write a client against this:

- **The id is immutable.** On `PUT`, the path id always wins over a body id. Renaming it would
  orphan every label already applied in the Knowledge Box under the old one — those labels are
  data, and a rename would silently strand them.
- **`?knowledge_box=true` on delete is a second, explicit choice.** The default
  (`?knowledge_box=false`) removes the labelset from the product's vocabulary only: the Knowledge
  Box keeps it, and every analysed call keeps the labels already applied with it. Passing
  `knowledge_box=true` additionally deletes it upstream, which *destroys those labels*. That is a
  data deletion, not a configuration change, which is why it is never the default (DECISIONS
  D-CA-37).

### In the source seed

Editing `RESOURCE_LABELSETS` / `PARAGRAPH_LABELSET` in `lib/domain/taxonomy.ts` changes what a
*fresh* deployment is seeded with, and what `restoreLabelset()` restores a shipped labelset to. It
does not change a deployment whose store is already seeded. Use it when you are re-targeting the
product at another domain (see [Build your own](build-your-own.md)), not to change one live
deployment.

If you change the *set of allowed values* for a metrics field (e.g. `call_reason`), update the
matching `Set` in `VALID_METRIC_VALUES` (`lib/parse.ts`) and the `enum` in the `METRICS_PROMPT`
string in `taxonomy.ts` — these two are not derived from one another and must be kept in sync by
hand, or a real generated value will be silently dropped by `sanitizeMetrics`.

### Provisioning

`POST /api/v1/admin/provision` (or `node scripts/provision.ts` against a running server, or
"Re-provision" on `/taxonomy` and `/admin/taxonomy`) applies the whole store: it `PUT`s every
labelset currently in the store (`putLabelset`, which replaces by id) and — unless `agents:false`
— deletes every existing task and restarts the enabled agents sequentially, because ARAG allows
only one *running* task per operation type at a time (`services/jobs.ts`, `JOB_PROVISION`).
Provisioning is idempotent.

Existing calls keep their old labels and analysis until re-provisioned agents run over them again;
provisioning does not automatically re-analyse already-processed resources.

The taxonomy is also what the mock ARAG demo mode seeds against at boot (`lib/mock.ts`), so a
change to the seed is visible in `make dev` immediately, with no live Knowledge Box required.

## Edit an agent

`GET /api/v1/agents` returns the three data-augmentation agents with their configuration *and*
their live Knowledge Box task state in one object. `PUT /api/v1/agents/{key}` accepts
`{ enabled, description, model, prompts }`; `POST /api/v1/agents/{key}/start` starts one;
`DELETE /api/v1/agents/{key}` stops its task.

- **`enabled`** decides whether provisioning starts the agent at all. A disabled agent's `on`
  parameter is forced to `0`.
- **`prompts`** replaces the instruction for one of the agent's outputs, keyed by the resource
  field it writes — for `call-insights` that is `call_analysis` and `call_metrics`. A destination
  that is not an output of that agent is rejected, as is a prompt shorter than 20 characters or
  longer than 8,000.
- **A labeler agent's `operations` are derived, not stored.** `agentConfigs()` rebuilds them from
  the *current* labelsets on every read — resource-level labelsets for `resource-labeler`,
  paragraph-level ones for `paragraph-labeler`. This is what stops a labelset edit and the agent
  that applies it from drifting apart; there is no second place to update.
- **An edit takes effect on the next provision.** The Knowledge Box holds the running task, and
  ARAG allows exactly one running task per operation type, so `POST /api/v1/agents/{key}/start`
  against an agent that already has a running task fails rather than silently queueing a second.
  Rewriting an agent under a task that is mid-run is how you get half a corpus labelled two
  different ways.

## Swap the cache

`services/cache.ts`'s `TtlCache` is a small in-process TTL map with hit/miss stats and
single-flight `getOrLoad` (concurrent callers for the same key share one load). It is constructed
once in `lib/runtime.ts` (`new TtlCache(env.cacheTtlMs)`), threaded through `Runtime.cache`, and
replaced when the `cacheTtlMs` setting changes (an entry's expiry is decided when it is written,
so `ttlMs` is readonly by design).

The two hottest read models — `catalogIds()` and `summaryOf()` — go through `getOrLoadStale()`
rather than `getOrLoad()`: an expired entry is returned immediately and a single refresh runs
behind it, for up to nine further TTLs. That is only safe because every mutation in this product
invalidates its keys outright (`delete`, `invalidatePrefix`, `clear`) rather than letting them age
out, so staleness is bounded by the TTL and never by a write nobody noticed.

To swap it for a shared backend (Redis, etc.) at 10x+ scale (see
[Scaling](../architecture/scaling.md)): implement the same five methods the services call —
`getOrLoad(key, load, ttlMs?)`, `getOrLoadStale(key, load, { ttlMs, graceMs })`, `delete(key)`,
`invalidatePrefix(prefix)`, `clear()` — plus `stats()` and `keys()` for the admin cache view, and
swap the construction in `buildRuntime()` (`lib/runtime.ts`) and in `applyToRuntime()`
(`services/config.ts`). Every cache key already goes through `cacheKeys` in `services/cache.ts`
(`catalog:<query>`, `summary:<id>`, `detail:<id>`, `labelsets:all`, `find:<query>`), so nothing
above the cache layer needs to change. Note that there is deliberately no dashboard key: the
aggregate is recomputed per render from the summary entries it is built from, which is what stops
it rendering instantly while re-warming nothing (DECISIONS D-CA-40).

## Swap the store

`Store` (vendored from the platform, `vendor/arag-platform/src/store/`) persists one JSON file per
collection under `DATA_DIR`. `JobManager` (also vendored) is built on top of it in `lib/runtime.ts`
(`new JobManager(store, log, { concurrency: 2 })`).

The store is no longer only job history. It now holds this deployment's *configuration* as well:

| Collection | File | Cap | Written by |
|---|---|---|---|
| `jobs` | `jobs.json` | 500 (platform default) | `JobManager` |
| `settings` | `settings.json` | — (one document, id `current`) | `services/config.ts` |
| `apikeys` | `apikeys.json` | 500 | `services/apikeys.ts` |
| `taxonomy` | `taxonomy.json` | 200 | `services/taxonomy-store.ts` |
| `views` | `views.json` | 100 | `services/views.ts` |
| `shares` | `shares.json` | 2,000 | `services/shares.ts` |
| `audit` | `audit.json` | 5,000 | `services/config.ts` |

Call data itself (recordings, transcripts, labels, generated analysis) is still entirely
ARAG-native with no local copy. What changed is that losing `DATA_DIR` now loses the deployment's
settings, keys, taxonomy edits, saved views, share links and audit trail as well as its job
history — see [Deployment topologies](../architecture/deployment-topologies.md).

To move this state to a real database, change the platform
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
   by matching `parameters.name`, so the new agent shows up on `/taxonomy` and `/admin/taxonomy`
   automatically once it is in the `AGENTS` array — no page changes needed.
6. `seedTaxonomy()` (`services/taxonomy-store.ts`) writes an `agent:<key>` override row for every
   entry in `AGENTS` the first time the store is read, so a new agent is enabled by default and
   immediately editable through `PUT /api/v1/agents/{key}`.

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

## Saved views, columns and density

Three pieces of calls-list state, deliberately stored in two different places.

**Saved views are server state.** `GET/POST /api/v1/views` and `PUT/DELETE /api/v1/views/{id}`
(`services/views.ts`) store a name for a query string in `DATA_DIR/views.json`, shared by everyone
who can open the deployment. A view is a named definition of a queue, and a rota of supervisors
reviewing the same work should be looking at the same definition of it — one person's
`localStorage` cannot deliver that. At most 100 views; names are unique, case-insensitively.

The stored query is re-parsed through an allowlist on every write (`normaliseQuery()`): only `q`,
`label`, `agent`, `queue`, `media_type`, `lifecycle`, `from`, `to`, `sort`, `order`, `page_size`
and `mode` survive, in that fixed order, so two people who built the same filter stack in a
different order save the same view — and a saved view, which is a URL the product will follow,
cannot become a place to park anything else.

**Columns and density are per-browser preferences.** `components/calls/columns.ts` keeps them in
`localStorage` under `ca.calls.columns` and `ca.calls.density`, and they are never put in the URL.
They are furniture, not part of the question the screen is asking: a link a supervisor sends a
colleague should arrive carrying the filter, not the sender's taste in row heights. Anything
unrecognised in a stored preference is dropped rather than trusted, the Call column is mandatory
so a table of rows you cannot open is impossible, and the stored set only ever chooses a subset of
`CALL_COLUMNS` — it never reorders it, so two people comparing the same view see the same shape.

Adding a column is a matter of adding an entry to `CALL_COLUMNS` (with a `sortKey` only if
`services/calls.ts` can actually sort on it) and rendering the cell in
`components/calls/CallsWorkspace.tsx`; `DEFAULT_COLUMNS` decides what a reviewer sees before they
have expressed a preference.

## Retention and purge

`services/retention.ts` implements two operations over one code path:

- `GET /api/v1/retention/preview` (`?days=` to preview a policy other than the saved one) returns
  the candidates, the cutoff, the totals and what the policy retains. It is available whether or
  not the policy is enabled, so the consequence of a policy can be seen before it is saved.
- `POST /api/v1/retention/purge` (admin) deletes them. `dryRun: true` returns the same shape
  without deleting; `days` overrides the saved policy for one run; `ids` narrows the run to
  specific calls within the candidate set.

Three properties are load-bearing:

- **There is no background sweeper.** `enabled` records the intent and nothing more. Deletion
  happens only when a person presses the button or something calls the endpoint. A timer removing
  a partner's call recordings unattended on a Sunday night is the failure mode this avoids
  (DECISIONS D-CA-38).
- **`days: 0` means "no retention limit", not "delete everything".** The destructive reading of a
  default-valued field is never the right one, so a policy of 0 returns no candidates at all.
- **A purge is irreversible and capped.** It deletes the Knowledge Box resource, its recording and
  everything derived from it, and revokes every live share link pointing at a purged call in the
  same pass so no URL is left resolving to nothing. One run deletes at most 200 calls; run it
  again for more.

The preview and the purge share `purgePreview()`, so the confirm dialog and the real run cannot
disagree about what is in scope.

## The in-product API explorer

`/api` (`app/api/page.tsx`, `components/api/`) is generated from
`GET /api/v1/openapi.json` — fetched in the browser from the running deployment rather than
rendered from an import, so what the screen lists is provably what this deployment serves. An
operation added to `lib/openapi.ts` appears in the explorer with no further code change, which is
what makes "every API capability is exercisable in the UI" checkable rather than asserted
(DECISIONS D-CA-41).

`components/api/spec.ts` holds all of the logic and none of the React: indexing operations by tag,
resolving `$ref`s, describing a schema as a field tree, generating a request example, and building
the request and its curl. `test/unit/api-explorer.test.ts` walks every operation in the real
document through that indexing and form generation, so the coverage guarantee is a test rather
than a promise.

Two rules constrain `components/api/TryIt.tsx`: a pasted key lives in React state and nowhere else
— never `localStorage`, never the URL, and never the generated curl, which emits a placeholder —
and every destructive operation takes a second click, because the form calls the deployment's real
API against its real Knowledge Box.
