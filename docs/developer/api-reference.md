# API reference — Call Analysis API v0.1.0

Contact-centre call intelligence on Progress Agentic RAG. Upload a recording, let ARAG transcribe and augment it, then browse, filter, analyse and ask grounded questions about every call.

Errors are RFC 9457 problem documents (`application/problem+json`). Public routes are rate limited per IP; `/api/v1/admin/*` requires the admin token.

Generated from `openapi.json` — do not edit by hand. Interactive docs: `/api/v1/docs` (Redoc) and `/api/v1/swagger` (try it out).

## Authentication

- **ApiKey** — apiKey header X-API-Key: Required only when API_KEYS is configured.
- **Bearer** — http bearer : API key or admin token as a bearer token.
- **AdminToken** — http bearer : ADMIN_TOKEN; required for /admin routes.

## Calls

### `GET /api/v1/calls`

**List analysed calls** — Full-text/semantic search across transcripts when `q` is set, otherwise the whole catalog, filtered by ARAG-assigned labels and by the structured attributes of the call. The response carries the facet tallies, agents and queues the filter bar renders, so a table view needs one request rather than four.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `q` | query | string |  | Search query across transcripts. |
| `label` | query | array of string |  | Facet filter as `labelset/label`; repeat for AND across facets. |
| `agent` | query | string |  | Exact agent name. |
| `queue` | query | string |  | Exact queue name. |
| `media_type` | query | string |  |  |
| `from` | query | string |  | Inclusive lower bound on the call time (ISO-8601). |
| `to` | query | string |  | Inclusive upper bound on the call time (ISO-8601). |
| `min_duration` | query | integer |  |  |
| `max_duration` | query | integer |  |  |
| `complaint` | query | boolean |  | Only calls with/without a complaint. |
| `fcr` | query | boolean |  | Only calls resolved first time (or not). |
| `escalated` | query | boolean |  |  |
| `lifecycle` | query | string |  | Only calls in this pipeline state. |
| `sort` | query | string |  | Table column to sort by. |
| `order` | query | string |  |  |
| `page` | query | integer |  |  |
| `page_size` | query | integer |  |  |

Responses:

- `200` A page of calls — `application/json` [CallPage](#callpage)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `POST /api/v1/calls`

**Upload a call** — Accepts `multipart/form-data` with either a `recording` file (audio/video — ARAG transcribes it) or a `transcript` text field, plus call metadata. Returns a job that completes when the call is retrievable.

Request body (`multipart/form-data`): object

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes |  |
| `transcript` | string |  |  |
| `recording` | string |  |  |
| `agent_name` | string |  |  |
| `member_id` | string |  |  |
| `queue` | string |  |  |
| `created` | string |  | ISO-8601 call time. |
| `duration_sec` | number |  |  |

Responses:

- `202` Accepted; processing continues as a job — `application/json` [CallCreateAccepted](#callcreateaccepted)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `413` Recording too large — `application/problem+json` [Problem](#problem)
- `415` Unsupported media type — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `GET /api/v1/calls/export`

**Export the filtered call list** — Renders the same set `GET /api/v1/calls` would return — same filters, same sort — as a CSV or JSON download. Pass `ids` to export an explicit table selection instead of a filter. Spreadsheet formula characters are escaped in CSV output.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `q` | query | string |  | Search query across transcripts. |
| `label` | query | array of string |  | Facet filter as `labelset/label`; repeat for AND across facets. |
| `agent` | query | string |  | Exact agent name. |
| `queue` | query | string |  | Exact queue name. |
| `media_type` | query | string |  |  |
| `from` | query | string |  | Inclusive lower bound on the call time (ISO-8601). |
| `to` | query | string |  | Inclusive upper bound on the call time (ISO-8601). |
| `min_duration` | query | integer |  |  |
| `max_duration` | query | integer |  |  |
| `complaint` | query | boolean |  | Only calls with/without a complaint. |
| `fcr` | query | boolean |  | Only calls resolved first time (or not). |
| `escalated` | query | boolean |  |  |
| `lifecycle` | query | string |  | Only calls in this pipeline state. |
| `sort` | query | string |  | Table column to sort by. |
| `order` | query | string |  |  |
| `format` | query | string |  |  |
| `ids` | query | array of string |  | Explicit call ids (a table selection). Repeat the parameter. |
| `limit` | query | integer |  |  |

Responses:

- `200` The export, as an attachment — `text/csv` string
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `POST /api/v1/calls/bulk`

**Apply an action to several calls at once** — The table's bulk actions. Partial success is the normal case and is reported per id rather than failing the whole batch.

Request body (`application/json`): [BulkActionRequest](#bulkactionrequest)


Responses:

- `200` Per-id outcome — `application/json` [BulkActionResult](#bulkactionresult)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `GET /api/v1/calls/{id}`

**Get one call with transcript, moments and analysis**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `200` The call — `application/json` [CallDetail](#calldetail)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `DELETE /api/v1/calls/{id}`

**Delete a call and its Knowledge Box resource**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `204` Deleted
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `GET /api/v1/calls/{id}/media`

**Stream the call recording** — Proxies the ARAG file field so the service-account token never reaches the browser. `Range` is forwarded, so the player can scrub (206 Partial Content).

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |
| `field` | query | string |  | File field to stream. Allowlisted. |

Responses:

- `200` The media stream — `application/octet-stream` string
- `206` Partial content (Range request) — `application/octet-stream` string
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `POST /api/v1/calls/{id}/ask`

**Ask a grounded question about one call** — Streams ARAG's NDJSON answer (`retrieval`, `answer`, `citations`, `metadata`, `status`) and appends one extra `quality` item carrying the REMi answer-quality read. Answers are restricted to this call's own transcript.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Request body (`application/json`): [AskRequest](#askrequest)


Responses:

- `200` NDJSON answer stream — `application/x-ndjson` string
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `POST /api/v1/calls/{id}/reanalyze`

**Re-run the analysis for one call** — Drops every cached derivative of the call, waits for the Knowledge Box to report the resource processed, and re-reads it so labels and generated fields written since are picked up. ARAG's data-augmentation agents are Knowledge-Box-wide tasks, so this refreshes one call's analysis rather than re-invoking a model for it; the job result says whether an analysis is actually present afterwards. To re-run the agents themselves, use `POST /api/v1/admin/provision`.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `202` Refresh job accepted — `application/json` [Job](#job)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `GET /api/v1/calls/{id}/export`

**Export one call's record** — `json` is the whole record (transcript, moments, analysis, metrics). `txt` is the transcript with `[mm:ss] Speaker:` prefixes. `vtt` is WebVTT cues built from the paragraph timings, so the transcript drops straight into a media player.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |
| `format` | query | string |  |  |

Responses:

- `200` The call, as an attachment — `application/json` string
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public

## Shares

### `GET /api/v1/calls/{id}/shares`

**Every share link ever created for a call** — Includes revoked and expired links, so the history of who was given a pointer survives.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `200` Share links — `application/json` [ShareList](#sharelist)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `POST /api/v1/calls/{id}/shares`

**Create a revocable, expiring link to one call** — Share links are application state, not a Knowledge Box mutation, and they grant no access the read API does not already give — so they need only the same credentials a read does. Revoking one is the control that matters, and it is available to every caller who can create one.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Request body (`application/json`): [ShareCreateRequest](#sharecreaterequest)


Responses:

- `201` The link — `application/json` [ShareLink](#sharelink)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `GET /api/v1/shares/{token}`

**Resolve a share token to the call it points at** — 404 for an unknown, revoked or expired token — the three are indistinguishable to the caller by design.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `token` | path | string | yes |  |

Responses:

- `200` The link — `application/json` [ShareLink](#sharelink)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `DELETE /api/v1/shares/{token}`

**Revoke a share link**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `token` | path | string | yes |  |

Responses:

- `200` The revoked link — `application/json` [ShareLink](#sharelink)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public

## Settings

### `GET /api/v1/settings`

**Non-sensitive deployment settings for the in-product Settings area** — Branding, connection mode, limits, which features this deployment allows, and how many API keys are configured. Contains no secrets and no key material; the operator view with the full effective environment is `GET /api/v1/admin/config`.

Responses:

- `200` Settings — `application/json` [SettingsView](#settingsview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public

## Analytics

### `GET /api/v1/dashboard`

**Aggregated analytics across every analysed call**

Responses:

- `200` Dashboard aggregation — `application/json` [Dashboard](#dashboard)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `GET /api/v1/taxonomy`

**Labelsets, agent definitions and provisioning state in one read** — The Agents & Taxonomy screen asks one question — is my taxonomy live? — and answering it needs the shipped definitions, the labelsets the Knowledge Box really holds, and the agent task state compared against each other. That comparison is made here rather than in the browser.

Responses:

- `200` Taxonomy — `application/json` [TaxonomyView](#taxonomyview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `GET /api/v1/labelsets`

**List the Knowledge Box labelsets used as filter facets**

Responses:

- `200` Labelsets — `application/json` object
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public

## Branding

### `GET /api/v1/branding`

**White-label identity for this deployment** — Product name, wordmark or logo, colours, the powered-by toggle and the footer/docs/support links. Read by the demo UI, the admin console and any partner front-end.

Responses:

- `200` Branding — `application/json` [Branding](#branding)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public

## Onboarding

### `GET /api/v1/onboarding`

**First-run state: what still has to happen before this deployment is useful**

Responses:

- `200` Onboarding state — `application/json` [OnboardingState](#onboardingstate)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `POST /api/v1/samples`

**Load the sample dataset** — Provisions the taxonomy, then uploads the shipped synthetic scenarios. Repeatable: calls whose slug is already present are skipped rather than duplicated. Runs as a job so the first-run screen can show real progress.

Request body (`application/json`): [SeedSamplesRequest](#seedsamplesrequest)


Responses:

- `202` Seeding job accepted — `application/json` [Job](#job)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `409` A seeding job is already running — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken

## Jobs

### `GET /api/v1/jobs`

**List background jobs**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `kind` | query | string |  |  |
| `status` | query | string |  |  |
| `limit` | query | integer |  |  |

Responses:

- `200` Jobs — `application/json` [JobPage](#jobpage)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `GET /api/v1/jobs/{id}`

**Get one job**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `200` The job — `application/json` [Job](#job)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `GET /api/v1/jobs/{id}/events`

**Stream job progress (SSE)**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `200` Server-sent events — `text/event-stream` string
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public

## Auth

### `POST /api/v1/session`

**Issue a same-origin demo session cookie** — Lets the demo UI call API-key-protected routes without exposing a key to the browser. No-op (still 200) when `API_KEYS` is unset.

Responses:

- `200` Session issued — `application/json` [SessionResponse](#sessionresponse)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public

## Admin

### `POST /api/v1/admin/login`

**Exchange the admin token for an HttpOnly cookie**

Request body (`application/json`): [AdminLoginRequest](#adminloginrequest)


Responses:

- `200` Signed in — `application/json` [AdminLoginResponse](#adminloginresponse)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `GET /api/v1/admin/health`

**Knowledge Box connection test and service health**

Responses:

- `200` Health — `application/json` [HealthView](#healthview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `GET /api/v1/admin/config`

**Effective configuration (secrets redacted)**

Responses:

- `200` Configuration — `application/json` [ConfigView](#configview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `GET /api/v1/admin/usage`

**Request, ARAG, token, job and cache counters**

Responses:

- `200` Usage — `application/json` [UsageView](#usageview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `GET /api/v1/admin/logs`

**Recent structured log records**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `level` | query | string |  |  |
| `contains` | query | string |  |  |
| `limit` | query | integer |  |  |

Responses:

- `200` Log records — `application/json` [LogPage](#logpage)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `GET /api/v1/admin/agents`

**Data-augmentation agent status from the Knowledge Box**

Responses:

- `200` Agents — `application/json` [AgentsView](#agentsview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `POST /api/v1/admin/provision`

**Provision labelsets and (re)start the agents** — Idempotent. Runs as a job because ARAG allows only one running task per operation type, so the agents must be started sequentially.

Request body (`application/json`): [ProvisionRequest](#provisionrequest)


Responses:

- `202` Provisioning job accepted — `application/json` [Job](#job)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `GET /api/v1/admin/cache`

**Cache statistics and keys**

Responses:

- `200` Cache — `application/json` [CacheView](#cacheview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `POST /api/v1/admin/cache/invalidate`

**Invalidate cached catalog ids and call summaries**

Request body (`application/json`): [CacheInvalidateRequest](#cacheinvalidaterequest)


Responses:

- `200` Invalidated — `application/json` [CacheInvalidateResponse](#cacheinvalidateresponse)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken

## Schemas

### Problem

RFC 9457 problem details

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes |  |
| `title` | string | yes |  |
| `status` | integer | yes |  |
| `detail` | string |  |  |
| `instance` | string |  |  |
| `requestId` | string |  |  |
| `errors` | array of object |  |  |

### Health

| Field | Type | Required | Description |
|---|---|---|---|
| `ok` | boolean | yes |  |
| `version` | string |  |  |
| `arag` | object |  |  |
| `uptimeSec` | number |  |  |

### Job

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes |  |
| `kind` | string | yes |  |
| `status` | string (`queued`, `running`, `succeeded`, `failed`, `cancelled`) | yes |  |
| `progress` | number | yes |  |
| `stage` | string |  |  |
| `message` | string |  |  |
| `input` | object |  |  |
| `result` | object |  |  |
| `error` | object |  |  |
| `events` | array of [JobEvent](#jobevent) |  |  |
| `createdAt` | string | yes |  |
| `updatedAt` | string | yes |  |
| `finishedAt` | string |  |  |
| `durationsMs` | object |  |  |

### JobEvent

| Field | Type | Required | Description |
|---|---|---|---|
| `ts` | string | yes |  |
| `stage` | string | yes |  |
| `status` | string (`start`, `progress`, `ok`, `error`, `skip`) | yes |  |
| `message` | string |  |  |
| `ms` | number |  |  |
| `data` | object |  |  |

### LogRecord

| Field | Type | Required | Description |
|---|---|---|---|
| `ts` | string | yes |  |
| `level` | string | yes |  |
| `msg` | string | yes |  |

### Branding

White-label identity for this deployment, configured with the BRAND_* environment variables. Public and free of secrets, so a partner front-end can theme itself from the same source the bundled UI uses.

| Field | Type | Required | Description |
|---|---|---|---|
| `productName` | string | yes |  |
| `tagline` | string |  |  |
| `logoUrl` | string |  | Absolute URL, or a path served from DATA_DIR/branding/ (e.g. /branding/logo.svg). |
| `primaryColor` | string |  |  |
| `accentColor` | string |  |  |
| `poweredBy` | boolean | yes | False hides the Progress Agentic RAG band and the footer credit. |
| `footerText` | string |  |  |
| `docsUrl` | string |  |  |
| `supportUrl` | string |  |  |

### ResourceLabel

| Field | Type | Required | Description |
|---|---|---|---|
| `labelset` | string | yes |  |
| `label` | string | yes |  |

### CallMetrics

Flat metrics written by the `call-insights` data-augmentation agent. Values that fail the taxonomy enum check are dropped rather than rendered.

| Field | Type | Required | Description |
|---|---|---|---|
| `call_reason` | string |  |  |
| `outcome` | string |  |  |
| `sentiment` | string (`Positive`, `Neutral`, `Negative`, `Mixed`) |  |  |
| `line_of_business` | string |  |  |
| `complaint` | boolean |  |  |
| `complaint_category` | string |  |  |
| `cross_sell_offered` | boolean |  |  |
| `cross_sell_accepted` | boolean |  |  |
| `csat_estimate` | number |  |  |
| `compliance_score` | number |  |  |
| `first_call_resolution` | boolean |  |  |
| `escalated` | boolean |  |  |
| `product_mentioned` | string |  |  |

### CallAnalysis

Narrative analysis written by the `call-insights` agent.

| Field | Type | Required | Description |
|---|---|---|---|
| `executive_summary` | string |  |  |
| `member_intent` | string |  |  |
| `key_topics` | array of string |  |  |
| `agent_scorecard` | object |  |  |
| `complaint` | object |  |  |
| `cross_sell` | object |  |  |
| `action_items` | array of string |  |  |
| `risk_flags` | array of string |  |  |
| `notable_quotes` | array of object |  |  |

### CallSummary

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | ARAG resource id. |
| `slug` | string |  |  |
| `title` | string | yes |  |
| `icon` | string |  | Content type of the call recording or transcript. |
| `mediaType` | string (`audio`, `video`, `transcript`) | yes |  |
| `createdISO` | string |  |  |
| `durationSec` | number |  |  |
| `agentName` | string |  |  |
| `memberId` | string |  |  |
| `queue` | string |  |  |
| `status` | string |  | ARAG processing status (PENDING while transcribing). |
| `lifecycle` | string (`queued`, `transcribing`, `labelling`, `partial`, `analysed`, `failed`) |  | Derived pipeline state: where this call has got to, in one word. ARAG reports a processing status, a label set and generated fields independently; this collapses the three into the state a reviewer acts on. |
| `labels` | array of object | yes |  |
| `metrics` | object |  | Flat metrics written by the `call-insights` data-augmentation agent. Values that fail the taxonomy enum check are dropped rather than rendered. |
| `momentTrack` | array of string |  | Dominant moment label per transcript paragraph (empty string = none). |

### CallParagraph

| Field | Type | Required | Description |
|---|---|---|---|
| `index` | integer | yes |  |
| `text` | string | yes |  |
| `charStart` | integer | yes | Offset into the field's extracted text; citations use the same range. |
| `charEnd` | integer | yes |  |
| `startSeconds` | number |  |  |
| `endSeconds` | number |  |  |
| `kind` | string |  |  |
| `moments` | array of string |  |  |
| `speaker` | string (`Agent`, `Member`) |  |  |

### CallDetail

_object_

### Datum

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |
| `value` | number | yes |  |

### Rollup

Per-agent or per-queue roll-up. Rates are computed over the calls in the group that carry metrics (`analysed`), never over the group size, so a partly-analysed group is not misreported.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |
| `calls` | integer | yes |  |
| `analysed` | integer | yes |  |
| `fcrRate` | number |  |  |
| `complaintRate` | number |  |  |
| `escalationRate` | number |  |  |
| `avgCsat` | number |  |  |
| `avgCompliance` | number |  |  |

### Dashboard

| Field | Type | Required | Description |
|---|---|---|---|
| `total` | integer | yes |  |
| `withMetrics` | integer | yes |  |
| `fcrRate` | number |  |  |
| `complaintRate` | number |  |  |
| `crossSellOfferRate` | number |  |  |
| `crossSellAcceptRate` | number |  |  |
| `escalationRate` | number |  |  |
| `avgCompliance` | number |  |  |
| `avgCsat` | number |  |  |
| `byReason` | array of object | yes |  |
| `bySentiment` | array of object | yes |  |
| `byOutcome` | array of object | yes |  |
| `byLob` | array of object |  |  |
| `complaintsByCategory` | array of object |  |  |
| `crossSell` | object |  |  |
| `byAgent` | array of [Rollup](#rollup) |  |  |
| `byQueue` | array of [Rollup](#rollup) |  |  |
| `recent` | array of [CallSummary](#callsummary) | yes |  |

### LabelsetView

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes |  |
| `title` | string | yes |  |
| `color` | string |  |  |
| `multiple` | boolean |  |  |
| `kind` | array of string |  |  |
| `labels` | array of string | yes |  |

### AgentStatus

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | string | yes |  |
| `type` | string (`labeler`, `ask`) | yes |  |
| `description` | string |  |  |
| `state` | string (`running`, `completed`, `failed`, `configured`, `absent`) | yes |  |
| `taskId` | string |  |  |
| `operations` | integer |  |  |

### CacheStats

| Field | Type | Required | Description |
|---|---|---|---|
| `entries` | integer | yes |  |
| `hits` | integer | yes |  |
| `misses` | integer | yes |  |
| `evictions` | integer |  |  |
| `invalidations` | integer |  |  |
| `ttlMs` | integer | yes |  |
| `byNamespace` | object |  |  |

### FacetCount

| Field | Type | Required | Description |
|---|---|---|---|
| `labelset` | string | yes |  |
| `label` | string | yes |  |
| `count` | integer | yes |  |

### CallPage

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array of [CallSummary](#callsummary) | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |
| `total` | integer | yes |  |
| `next_page` | boolean |  |  |
| `facets` | array of [FacetCount](#facetcount) | yes |  |
| `agents` | array of string |  |  |
| `queues` | array of string |  |  |

### BulkActionRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | string (`delete`, `reanalyze`) | yes | `delete` removes the calls and their Knowledge Box resources; `reanalyze` queues a refresh job per call. |
| `ids` | array of string | yes | Call ids, as selected in the table. |

### BulkActionResult

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes |  |
| `requested` | integer | yes |  |
| `succeeded` | integer | yes |  |
| `failed` | array of object | yes |  |
| `jobs` | array of [Job](#job) |  | One job per call, for actions that run asynchronously. |

### ShareLink

| Field | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes | Opaque 256-bit token; the only secret in the link. |
| `callId` | string | yes |  |
| `callTitle` | string |  |  |
| `url` | string | yes | Path to the read-only call view, e.g. `/s/<token>`. |
| `createdISO` | string | yes |  |
| `expiresISO` | string | yes |  |
| `revoked` | boolean | yes |  |
| `expired` | boolean | yes |  |
| `note` | string |  |  |

### ShareCreateRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `ttlDays` | integer |  |  |
| `note` | string |  | Why the link was created; shown in the list. |

### ShareList

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array of [ShareLink](#sharelink) | yes |  |

### LabelsetDetail

_object_

### TaxonomyView

| Field | Type | Required | Description |
|---|---|---|---|
| `labelsets` | array of [LabelsetDetail](#labelsetdetail) | yes |  |
| `agents` | array of [AgentStatus](#agentstatus) | yes |  |
| `provisioning` | object | yes |  |

### OnboardingState

Computed live on every read rather than stored, so a Knowledge Box that is emptied, or one provisioned outside the product, reports the truth instead of a stale checklist.

| Field | Type | Required | Description |
|---|---|---|---|
| `complete` | boolean | yes |  |
| `mode` | string (`mock`, `live`) | yes |  |
| `callCount` | integer | yes |  |
| `analysedCount` | integer |  |  |
| `steps` | array of object | yes |  |
| `sample` | object | yes |  |

### SeedSamplesRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `count` | integer |  |  |
| `provision` | boolean |  | Provision the taxonomy first. |

### SettingsView

Non-sensitive deployment settings for the in-product Settings area. Contains no secrets: the Knowledge Box id is truncated and no key material is ever included.

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes |  |
| `platformVersion` | string |  |  |
| `branding` | [Branding](#branding) | yes |  |
| `connection` | object | yes |  |
| `limits` | object | yes |  |
| `features` | object | yes | What this deployment allows: uploads, deletes, admin panel, API-key auth. |
| `apiKeys` | object |  |  |
| `taxonomy` | object |  |  |

### CallCreateAccepted

| Field | Type | Required | Description |
|---|---|---|---|
| `job` | [Job](#job) | yes |  |
| `call` | object | yes |  |

### AskRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | yes | Natural-language question. Answered only from this call's own transcript. |

### SessionResponse

| Field | Type | Required | Description |
|---|---|---|---|
| `ok` | boolean | yes |  |
| `expiresIn` | integer | yes |  |

### AdminLoginRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes |  |

### AdminLoginResponse

| Field | Type | Required | Description |
|---|---|---|---|
| `ok` | boolean | yes |  |

### HealthView

| Field | Type | Required | Description |
|---|---|---|---|
| `ok` | boolean | yes |  |
| `version` | string | yes |  |
| `platformVersion` | string |  |  |
| `uptimeSec` | number |  |  |
| `mock` | boolean |  |  |
| `arag` | object | yes |  |
| `jobs` | object |  |  |
| `cache` | object |  |  |

### ConfigView

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes |  |
| `platformVersion` | string |  |  |
| `env` | object | yes |  |
| `taxonomy` | object |  |  |
| `cache` | object |  |  |
| `limits` | object |  |  |
| `branding` | [Branding](#branding) |  |  |

### UsageView

| Field | Type | Required | Description |
|---|---|---|---|
| `uptimeSec` | number |  |  |
| `requests` | integer | yes |  |
| `errors` | integer |  |  |
| `asks` | integer |  |  |
| `uploads` | integer |  |  |
| `deletes` | integer |  |  |
| `byRoute` | object |  |  |
| `arag` | object | yes |  |
| `tokens` | object |  |  |
| `jobs` | object |  |  |
| `cache` | [CacheStats](#cachestats) | yes |  |

### LogPage

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array of [LogRecord](#logrecord) | yes |  |

### AgentsView

| Field | Type | Required | Description |
|---|---|---|---|
| `agents` | array of [AgentStatus](#agentstatus) | yes |  |
| `running` | integer |  |  |
| `raw` | object |  |  |

### ProvisionRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `agents` | boolean |  |  |
| `resetTasks` | boolean |  |  |

### CacheView

| Field | Type | Required | Description |
|---|---|---|---|
| `stats` | [CacheStats](#cachestats) | yes |  |
| `keys` | array of string |  |  |

### CacheInvalidateRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `prefix` | string |  | Invalidate only keys with this prefix (e.g. `summary:`). |

### CacheInvalidateResponse

| Field | Type | Required | Description |
|---|---|---|---|
| `invalidated` | integer | yes |  |

### JobPage

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array of [Job](#job) | yes |  |

