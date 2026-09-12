# Design Review Checklist — Call Analysis

Run this against a proposed or existing customer deployment. Each row names the file(s) an
architect can actually go read to verify the answer — this is not a generic checklist, it's this
product's checklist.

## API contract

| Check | Verify against | Pass criteria |
|---|---|---|
| Every route is documented and every documented route is implemented | `test/contract/openapi.test.ts`, `describe("spec ↔ implementation")` | `make check` is green; no drift between `API_ROUTES`, `lib/openapi.ts` paths, and the `app/api/v1` filesystem |
| Every operation documents its error responses | Same file, `"documents error responses on every operation"` | Every operation's `responses` includes `400` at minimum (via `...problemResponses`) |
| Responses actually match their schema | `checkResponse` cases in the same file | Add a case for any new endpoint before calling it done (see `enablement/developer-track/exercises/01-add-endpoint.md` for the pattern) |
| Errors are RFC 9457, never raw exceptions | `lib/api.ts`, `toHttpError()` | `application/problem+json`, no ARAG URL/token/KB id ever in a response body |

## Auth and authorisation

| Check | Verify against | Pass criteria |
|---|---|---|
| Admin routes require the admin token | `lib/openapi.ts` `API_ROUTES`, and `test/contract/openapi.test.ts`'s `"marks the admin routes as admin-authenticated"` | Every `/api/v1/admin/*` route except `login` has `auth: "admin"` |
| Admin token comparison is constant-time | `lib/api.ts`, `authenticate()`; `app/api/v1/admin/login/route.ts` | Uses `constantTimeEqual`, not `===` |
| Admin session is an HttpOnly cookie, never held in browser JS | `app/api/v1/admin/login/route.ts` | `ctx.setCookie("arag_admin", ..., { httpOnly: true (default) })` |
| Write routes (`POST`/`DELETE` on `/calls`) are behind API keys when configured | `lib/openapi.ts` `API_ROUTES`, `enforceAuth()` in `lib/api.ts` | `auth: "api"`; note `enforceAuth` treats an **empty** `API_KEYS` as "open API" — confirm this is the intended posture for the deployment, not an oversight |
| The demo session cookie can't be used to reach admin routes | `authenticate()` in `lib/api.ts` | Session auth (`via: "session"`) never sets `admin: true`; only the admin-token path does |

## Rate limiting and trust boundaries

| Check | Verify against | Pass criteria |
|---|---|---|
| `TRUST_PROXY` matches the actual deployment topology | `.env.example`, `lib/api.ts` `clientIp()` | `fly` only if actually behind Fly's edge (this repo's default and `fly.toml`'s posture); `xff` only behind a proxy the customer controls; `none` otherwise — ask which applies before accepting the default blindly |
| Rate limits are per-machine, and the customer knows it | `sizing-deployment.md` §"What changes for multi-machine" | If multi-machine, effective limit is `RATE_LIMIT_RPS × machine count` — disclosed, not assumed |
| Admin callers bypass the rate limiter | `lib/api.ts` `route()`: `if (!spec.noRateLimit && !auth.admin)` | Intentional — confirm this is acceptable for the deployment (an admin-token leak has no rate-limit backstop) |
| Body size is capped before it's read into memory | `lib/api.ts` `route()`, `Content-Length` pre-check + streamed read cap | `MAX_BODY_BYTES` set to a value the deployment's expected recording sizes and machine memory both support |

## Secret handling

| Check | Verify against | Pass criteria |
|---|---|---|
| Secrets are never committed | `.env.example` (documents every variable, holds no values), `.gitignore` for `.env` | `ARAG_API_KEY`, `ADMIN_TOKEN`, `API_KEYS` never appear in git history |
| Secrets are never logged or returned to a client | `services/admin.ts` `health()` (`kbId` truncated to 8 chars), `describeEnv()` used by `config()` | `GET /api/v1/admin/health` and `/admin/config` redact; spot-check a live response |
| Fly secrets are set out of band | `fly.toml` header comment | `fly secrets set ...`, never inlined in `fly.toml` or the Dockerfile |
| The Dockerfile build never requires live credentials | `Dockerfile` | `ENV ARAG_MOCK=1` during `next build` — confirm no build step reaches out to a real KB |

## Data residency

| Check | Verify against | Pass criteria |
|---|---|---|
| All call content lives in the KB, not on the app's volume | `.env.example` (`DATA_DIR` comment: "JSON stores (jobs)"), `services/jobs.ts` | Confirm no transcript/recording bytes are ever written to `DATA_DIR` — only job metadata |
| App region and KB region are co-located | `fly.toml` (`primary_region = "iad"`, comment ties it to `aws-us-east-2-1`) | Matches the customer's actual KB region, not this repo's default |
| No cross-region call for every request | Same | If the customer's KB is in a different region than assumed, flag added latency and revisit `primary_region` |

## Caching and freshness

| Check | Verify against | Pass criteria |
|---|---|---|
| The staleness window is disclosed to the customer | `DECISIONS.md` D-CA-04, `sizing-deployment.md` | Customer understands `CALLS_CACHE_TTL_MS` (default 60 s) as the bound on "how stale can a read be" for aggregates, not for a call's own detail right after upload (which invalidates immediately) |
| Cache size is adequate for the catalog | `services/cache.ts` `TtlCache` constructor (`max = 2_000` default) | For a catalog materially larger than ~2,000 hot entries, flag the fixed cap as a required follow-up (see `sizing-deployment.md`'s worked example) |
| Multi-machine cache incoherence is disclosed if relevant | `sizing-deployment.md` §"What changes for multi-machine" | Not silently assumed away on a multi-machine proposal |
| Admin has a manual escape hatch | `/admin/cache`, `POST /api/v1/admin/cache/invalidate` | Confirmed working (`test/contract/openapi.test.ts`'s admin routes case) |

## Observability

| Check | Verify against | Pass criteria |
|---|---|---|
| Every request gets a request id | `lib/api.ts` `route()` | `X-Request-Id` on every response; correlated into `rt.log` entries |
| Admin panel surfaces health, config, usage, logs, agents, cache | `app/admin/*` pages, corresponding `/api/v1/admin/*` routes | All present per the product's Definition of Done; verify each renders with real data against the deployment |
| Usage counters are wired to a real dashboard/alerting pipeline in production | `services/admin.ts` `usage()` | This product exposes counters via `/api/v1/admin/usage`; it does not itself ship metrics export — confirm the customer has (or doesn't need) a scrape/export step |
| Errors ≥ 500 are logged server-side with enough detail to debug | `lib/api.ts` `route()` catch block | `rt.log.error("http.error", { requestId, path, message })` — confirm log retention/shipping meets the customer's support SLA |

## Failure handling

| Check | Verify against | Pass criteria |
|---|---|---|
| ARAG outages degrade to a clear error, not a hang or a leak | `lib/api.ts` `toHttpError()` | `502`/`504` problem responses; no upstream detail leaked |
| REMi failures never block an answer | `services/ask.ts`, `D-CA-09` | Confirmed by design; verify `REMI_TIMEOUT_MS` (12 s) is acceptable for the deployment's chat SLA |
| Transcription lag has a bounded timeout and is observable | `services/jobs.ts` `JOB_INGEST` (`waitProcessed`, 10 min timeout) | A stuck ingest job surfaces as `failed`, not silently pending forever |
| Generated fields that fail validation degrade gracefully | `lib/parse.ts` `sanitizeMetrics()` | Dropped, not mis-rendered; dashboard's `withMetrics` count makes the gap visible |

## Cost controls

| Check | Verify against | Pass criteria |
|---|---|---|
| Question length is bounded | `.env.example` `CALLS_MAX_QUESTION_CHARS`, spec's `AskRequest.question.maxLength: 500` | Prevents an unbounded prompt from driving unbounded generation cost |
| Upload size is bounded | `.env.example` `MAX_BODY_BYTES` (100 MB default) | Matches the deployment's expected recording sizes, not left at a default that's either too tight or needlessly generous |
| Token usage is visible | `GET /api/v1/admin/usage` → `tokens.input`/`tokens.output` | Confirm someone is actually watching this, not just that it's technically exposed |
| ARAG call volume is bounded by the cache, not by luck | `sizing-deployment.md` §1 | Walk the "ARAG calls per view" table with the customer's real catalog size in mind |

## Known MVP limitations to call out explicitly

State these to the customer up front — they are documented trade-offs, not hidden defects:

1. **Cache and rate limiting are per-machine** (`D-CA-04`; `sizing-deployment.md`). A single-machine
   deployment (this repo's shipped `fly.toml`) has none of these issues; multi-machine requires the
   changes in `sizing-deployment.md` before it's transparent to operate.
2. **Jobs are stored on a machine-local volume** (`DATA_DIR`). Same caveat as above for
   multi-machine job visibility.
3. **`TtlCache`'s entry cap (2,000) is a hardcoded default**, not an environment variable. Flag it
   for a catalog expected to exceed a couple thousand actively-viewed calls.
4. **No offline/degraded read mode during an ARAG outage.** The product is fully dependent on KB
   availability for every read; there's no cached-last-known-good fallback beyond the TTL window
   already in flight.
5. **API keys are optional, not mandatory, by configuration** (`API_KEYS` unset ⇒ open write API).
   Confirm this matches the customer's intended trust boundary before go-live — an unset
   `API_KEYS` combined with a public-facing deployment means anyone can upload or delete a call.
6. **Seeding/demo tooling (`scripts/gen-media.ts`) is macOS-only** for audio rendering — irrelevant
   to a production deployment, but worth knowing if the customer wants to regenerate demo assets
   themselves on Linux CI.
