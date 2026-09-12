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

**List analysed calls** — Full-text/semantic search across transcripts when `q` is set, otherwise the whole catalog, filtered by ARAG-assigned labels.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `q` | query | string |  | Search query across transcripts. |
| `label` | query | array of string |  | Facet filter as `labelset/label`; repeat for AND across facets. |
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

Auth: ApiKey or Bearer or 


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

Auth: ApiKey or Bearer or 


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

### CallPage

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array of [CallSummary](#callsummary) | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |
| `total` | integer | yes |  |
| `next_page` | boolean |  |  |

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

