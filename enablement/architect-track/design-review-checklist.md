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
| Write routes always need a real credential | `lib/openapi.ts` `API_ROUTES`, `enforceAuth()` in `lib/api.ts` | `auth: "write"` — the operator token or a real API key; the demo session cookie never suffices (D-CA-13). In `NODE_ENV=production` with neither configured, writes are refused `403`, not allowed |
| Deployment-changing routes are operator-only | `API_ROUTES` `auth: "admin"`; contract test `"marks every mutation as write- or admin-authenticated"` | Settings, API keys and retention purge are `admin`; taxonomy and saved views are `write` (D-CA-42). Confirm the customer agrees an integration partner holding a key should be able to edit the taxonomy but not the settings |
| API-key enforcement stickiness is understood | `services/apikeys.ts` `apiKeysEnforced()` | Once this deployment has **ever** had a key, `api` routes need one, and revoking the last key does **not** reopen them — only `DELETE /api/v1/api-keys/{id}?purge=true` does (D-CA-46). Confirm this is in the customer's runbook, not discovered during an incident |
| Share links are `api`, not `write`, deliberately | `API_ROUTES`, contract test `"keeps share links at read-level auth and says why in the spec"` | The one carve-out from D-CA-13, pinned by a test. **Re-evaluate it whenever `API_KEYS` is enforced** — the justification ("grants no access the open read API does not") is a statement about a configuration, and stops being true the moment the read API is closed |
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
| `DATA_DIR/settings.json` is treated as a credential-bearing file | `services/config.ts` `restrictSettingsFile()`, D-CA-45 | If an operator ever rotates the Knowledge Box key **through the product**, the value is written to this file. It is `chmod 0600` on every write, but it is a recorded exception to "secrets only from env" — confirm it is covered by the customer's policy for backups, snapshots and disk encryption, or that they will only rotate via `ARAG_API_KEY` |
| API-key material is never recoverable | `services/apikeys.ts` `hashKey()`, `POST /api/v1/api-keys` | Only SHA-256 digests are stored; the plaintext is returned exactly once at creation. Confirm the customer's key-distribution process does not assume it can be re-read |
| Share tokens are **not** hashed at rest | `services/shares.ts` — the raw token is the document id in `shares.json` | Deliberate (the justification is that a share grants no more than the open read API). **Raise this as a finding, not a trade-off, on any deployment that enforces API keys**, where it grants access nothing else does |
| The Dockerfile build never requires live credentials | `Dockerfile` | `ENV ARAG_MOCK=1` during `next build` — confirm no build step reaches out to a real KB |

## Data residency

| Check | Verify against | Pass criteria |
|---|---|---|
| All call content lives in the KB, not on the app's volume | `.env.example`, `services/jobs.ts`, `sizing-deployment.md` §"What `DATA_DIR` actually holds" | Still true — no transcript or recording byte is written to `DATA_DIR`. But it now holds seven collections including settings (possibly a credential), API-key digests, the taxonomy, saved views, live **plaintext** share tokens and the audit trail. Confirm it has a backup story; this repo ships none |
| `DATA_DIR` loss has been thought through | same | Losing `apikeys.json` silently **reopens** the API (enforcement is derived from row presence); losing `taxonomy.json` silently reverts a partner's vocabulary to the shipped default on next boot. Neither raises an error |
| App region and KB region are co-located | `fly.toml` (`primary_region = "iad"`, comment ties it to `aws-us-east-2-1`) | Matches the customer's actual KB region, not this repo's default |
| No cross-region call for every request | Same | If the customer's KB is in a different region than assumed, flag added latency and revisit `primary_region` |

## Caching and freshness

| Check | Verify against | Pass criteria |
|---|---|---|
| The staleness window is disclosed to the customer — **with the right number** | `DECISIONS.md` D-CA-04 and D-CA-40, `services/cache.ts` `getOrLoadStale()`, `configuration-cache-and-sharing.md` §2 | The bound is **not** `CALLS_CACHE_TTL_MS`. With serve-stale it is `ttlMs + graceMs`, and `graceMs` defaults to `ttlMs × 9` — so **ten minutes at the default**, per machine. A review that quotes 60 s has quoted the wrong figure |
| No `dashboard:` cache key has reappeared | `services/cache.ts` `cacheKeys`, `GET /api/v1/admin/cache` | Its removal is the D-CA-40 fix. If one returns, the eight-second post-drill-through stall returns with it |
| Serve-stale's precondition still holds | `services/cache.ts` `getOrLoadStale()` comment; every write path in `services/calls.ts`, `labelsets.ts`, `config.ts` | Safe only because every mutation calls `delete`/`invalidatePrefix`/`clear` outright. A new write path that relies on the TTL instead turns a one-minute bug into a ten-minute one — check this whenever a mutating endpoint is added |
| Cache size is adequate for the catalog | `services/cache.ts` `TtlCache` constructor (`max = 2_000` default) | For a catalog materially larger than ~2,000 hot entries, flag the fixed cap as a required follow-up (see `sizing-deployment.md`'s worked example) |
| Multi-machine cache incoherence is disclosed if relevant | `sizing-deployment.md` §"What changes for multi-machine" | Not silently assumed away on a multi-machine proposal |
| Admin has a manual escape hatch | `/admin/usage` → **Cache** (`/admin/cache` redirects there), `POST /api/v1/admin/cache/invalidate` | Confirmed working (`test/contract/openapi.test.ts`'s admin routes case). Invalidation accepts a `prefix`, so a namespace can be cleared without dropping everything |

## Observability

| Check | Verify against | Pass criteria |
|---|---|---|
| Every request gets a request id | `lib/api.ts` `route()` | `X-Request-Id` on every response; correlated into `rt.log` entries |
| Admin panel surfaces health, config, usage, logs, agents, cache | `app/admin/*` pages, corresponding `/api/v1/admin/*` routes | All present per the product's Definition of Done; verify each renders with real data against the deployment |
| Usage counters are wired to a real dashboard/alerting pipeline in production | `services/admin.ts` `usage()` | This product exposes counters via `/api/v1/admin/usage`; it does not itself ship metrics export — confirm the customer has (or doesn't need) a scrape/export step |
| Errors ≥ 500 are logged server-side with enough detail to debug | `lib/api.ts` `route()` catch block | `rt.log.error("http.error", { requestId, path, message })` — confirm log retention/shipping meets the customer's support SLA |
| The audit trail covers what the customer thinks it covers | every `audit(` call site: `app/api/v1/{settings,api-keys,labelsets,agents,retention,jobs}`, `services/config.ts` | It records **configuration**: settings, logo, API keys, labelsets, agents, retention purges, job cancellations. It records **no data events at all** — deleting a call, bulk-deleting calls, creating or revoking a share link and creating a saved view write nothing, and the first three are reachable with an API key. For a PHI deployment, raise this first |
| The audit trail is sized as evidence, not an archive | `services/config.ts` `auditCollection()` (`cap: 5000`) | Oldest rows are dropped past 5,000. Confirm the customer's retention requirement for audit evidence is shorter than the volume of configuration change that fills it, or plan an export |

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
| The retention policy is understood as descriptive, not active | `services/retention.ts`, D-CA-38 | **There is no background sweeper.** Setting `days: 90, enabled: true` records a policy and previews it; nothing is deleted until a person or a scheduler calls `POST /api/v1/retention/purge`. If the customer believes they have automatic deletion, they do not — and if they need it, that is an external scheduler they must own |
| Purge behaviour is understood before it is used | `services/retention.ts` `runPurge()` | Irreversible; capped at **200 calls per run** (`remaining` in the response tells you to run again, so a capped run is never misreported as complete); revokes share links for purged calls in the same pass; `days: 0` means "no limit", never "delete everything" |
| ARAG call volume is bounded by the cache, not by luck | `sizing-deployment.md` §1 | Walk the "ARAG calls per view" table with the customer's real catalog size in mind |

## Known MVP limitations to call out explicitly

State these to the customer up front — they are documented trade-offs, not hidden defects.

1. **Multi-machine is blocked, not merely caveated.** Cache, rate limiting *and the entire
   `DATA_DIR` store* are per-machine. Since the store grew to seven collections, a second machine
   means settings, API keys, the taxonomy, saved views, share links and the audit trail all diverge
   — and none of it errors, it just behaves intermittently. The shipped single-machine `fly.toml`
   has none of these problems. See `sizing-deployment.md` §"What changes for multi-machine".
2. **`DATA_DIR` has no backup story**, and it now holds configuration, API-key digests, the
   taxonomy, live share tokens, the audit trail and — if the operator rotated it in-product — the
   Knowledge Box credential.
3. **`TtlCache`'s 2,000-entry cap is a constructor default**, not an environment variable. Past a
   catalogue of that size the hit rate collapses rather than degrading, because each render evicts
   entries the same render needs. A code change before go-live for any tenant over ~1,500 calls.
4. **The freshness bound is ten TTLs, not one.** Serve-stale (D-CA-40) means a read can be up to
   `ttlMs + graceMs` old — ten minutes at the default.
5. **No offline or degraded read mode during an ARAG outage.** The product is fully dependent on KB
   availability for every read.
6. **The audit trail covers configuration, not data.** Deleting a call, bulk-deleting calls and
   creating or revoking a share link are unaudited, and are reachable with an API key.
7. **Share tokens are stored in plaintext** (the token is the document id in `shares.json`).
   Acceptable on a deployment whose read API is open; a real finding on one that enforces API keys.
8. **API-key enforcement is sticky and the way back is non-obvious.** Revoking the last key does
   not reopen the API; only purging the rows does (D-CA-46). Deliberate, and it must be in the
   runbook.
9. **A taxonomy edit is a one-way door taken blind.** A label's `description` is the instruction
   the labeler reads, so editing it changes classification — but there is no way to test a wording
   change before it applies, no evaluation set, no diff of which calls changed, and **no way to
   restore a shipped labelset** (`restoreLabelset()` exists in the service layer and is
   unit-tested, but no route or button reaches it). Every settings section has a reset; the
   taxonomy does not.
10. **A source-taxonomy change cannot reach an existing deployment.** `seedTaxonomy()` runs once;
    there is no re-seed operation, so a partner who rewrites `lib/domain/taxonomy.ts` and redeploys
    changes nothing for existing users.
11. **Retention is a policy, not a sweeper.** Nothing is deleted until something calls
    `POST /api/v1/retention/purge`. If the customer needs automatic deletion, they own the
    scheduler.
12. **Dashboard drill-throughs disagree with the numbers they come from.** Every tile and chart is
    computed from `call_metrics` (the ask agent) while every drill-through filters on labels (the
    labeler agent), with nothing reconciling them. On the sample corpus *Cross-sell accepted* reads
    0% and links to ten calls. Reproducible in one command; see
    `enablement/developer-track/exercises/07-dashboard-drill-through.md` Task 9. **This is a live
    defect, not a trade-off** — list it as such.
13. **Job cancellation is cooperative and does not roll back.** A cancelled ingestion leaves
    whatever Knowledge Box resource it had already created.
14. **Seeding/demo tooling (`scripts/gen-media.ts`) is macOS-only** for audio rendering —
    irrelevant to a production deployment, but worth knowing if the customer wants to regenerate
    demo assets on Linux CI.

## How to use this list

Items 1–5 are sizing and operations; 6–8 are security posture; 9–11 are product-behaviour
expectations that will otherwise be discovered at the worst moment; 12–13 are defects.

**Do not present all fourteen.** Pick the three that matter for this customer and put them on the
first slide of the go-live review. For a contact-centre customer handling PHI those are usually 6,
7 and 9. For a partner white-labelling the product they are usually 9, 10 and 2. If two different
customers get the same three, the review has not engaged with either deployment.
