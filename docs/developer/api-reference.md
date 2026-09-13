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
| `cross_sell_offered` | query | boolean |  | Only calls where an additional product was offered (or not). |
| `cross_sell_accepted` | query | boolean |  | Only calls where an offer was accepted (or not). |
| `call_reason` | query | string |  | Exact `call_metrics.call_reason`. This filters on the *generated metric*, not on the labeler's label of the same name — which is what makes a dashboard figure and its drill-through the same predicate. |
| `outcome` | query | string |  | Exact `call_metrics.outcome`. |
| `sentiment` | query | string |  | Exact `call_metrics.sentiment`. |
| `line_of_business` | query | string |  | Exact `call_metrics.line_of_business`. |
| `complaint_category` | query | string |  | Exact `call_metrics.complaint_category`. |
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
| `cross_sell_offered` | query | boolean |  | Only calls where an additional product was offered (or not). |
| `cross_sell_accepted` | query | boolean |  | Only calls where an offer was accepted (or not). |
| `call_reason` | query | string |  | Exact `call_metrics.call_reason`. This filters on the *generated metric*, not on the labeler's label of the same name — which is what makes a dashboard figure and its drill-through the same predicate. |
| `outcome` | query | string |  | Exact `call_metrics.outcome`. |
| `sentiment` | query | string |  | Exact `call_metrics.sentiment`. |
| `line_of_business` | query | string |  | Exact `call_metrics.line_of_business`. |
| `complaint_category` | query | string |  | Exact `call_metrics.complaint_category`. |
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

Auth: ApiKey


### `POST /api/v1/calls/{id}/shares`

**Create a revocable, expiring link to one call** — Share links are application state, not a Knowledge Box mutation, and they grant no access the read API does not already give — so they need only the same credentials a read does. Revoking one is the control that matters, and it is available to every caller who can create one.

Returns the token and its URL **once**: the store keeps only a SHA-256 digest, exactly as it does for an API key, so a lost link is revoked and reissued rather than looked up.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Request body (`application/json`): [ShareCreateRequest](#sharecreaterequest)


Responses:

- `201` The link, with its token — `application/json` [ShareCreated](#sharecreated)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey


### `GET /api/v1/shares/{token}`

**Resolve a share token to the call it points at** — 404 for an unknown, revoked or expired token — the three are indistinguishable to the caller by design. Only a plaintext token resolves: the digest the register lists is deliberately not a working credential.

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

Auth: ApiKey


### `GET /api/v1/shares`

**Every share link this deployment has issued** — The whole register, across every call, so links can be reviewed and revoked from one place rather than only from the call they point at. The rows carry the tokens, so this needs whatever a read needs on the deployment — it is the per-call list widened, not the public token resolver.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `call_id` | query | string |  |  |
| `state` | query | string |  |  |

Responses:

- `200` Share links — `application/json` [ShareList](#sharelist)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey

## Settings

### `GET /api/v1/settings`

**Non-sensitive deployment settings for the in-product Settings area** — Branding, connection, limits, retention, which features this deployment allows, and how many API keys exist. Contains no secrets and no key material; the operator view with the full effective environment is `GET /api/v1/admin/config`.

Responses:

- `200` Settings — `application/json` [SettingsView](#settingsview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `PUT /api/v1/settings/{section}`

**Edit one section of the deployment settings** — Environment variables are *defaults*; this write is the authority. The patch is validated, persisted to the product's JSON store and applied to the running process, so the change is in force for the very next request without a restart. Colours and URLs go through the same grammar the boot-time reader uses, so a settings form is not a way past them. `connection.apiKey` is write-only: it is never returned by any read model, and an empty value leaves the stored credential alone.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `section` | path | string | yes |  |

Request body (`application/json`): [SettingsUpdateRequest](#settingsupdaterequest)


Responses:

- `200` The settings after the edit — `application/json` [SettingsView](#settingsview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `DELETE /api/v1/settings/{section}`

**Restore one section to its environment defaults**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `section` | path | string | yes |  |

Responses:

- `200` The settings after the reset — `application/json` [SettingsView](#settingsview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `POST /api/v1/settings/logo`

**Upload the partner logo** — Stores an SVG, PNG, JPEG or WebP under `DATA_DIR/branding/` and points `branding.logoUrl` at it, so a white-label deployment needs no image baked into the container and no volume edited by hand. The file is served by `GET /branding/{path}` with `Content-Security-Policy: sandbox`, because an SVG is a document.

Request body (`multipart/form-data`): object

| Field | Type | Required | Description |
|---|---|---|---|
| `logo` | string | yes |  |

Responses:

- `200` The settings after the upload — `application/json` [SettingsView](#settingsview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `DELETE /api/v1/settings/logo`

**Remove the uploaded partner logo**

Responses:

- `200` The settings after the removal — `application/json` [SettingsView](#settingsview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken

## API keys

### `GET /api/v1/api-keys`

**Every API key this deployment has issued** — Names, previews, creation and last-used times, and whether each key is revoked. The key material is stored as a SHA-256 digest and is never returned — a leaked store grants nothing.

Responses:

- `200` API keys — `application/json` [ApiKeyList](#apikeylist)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `POST /api/v1/api-keys`

**Issue a new API key** — Returns the key material **once**. It cannot be recovered afterwards; a key that is lost is revoked and reissued.

Request body (`application/json`): [ApiKeyCreateRequest](#apikeycreaterequest)


Responses:

- `201` The new key, with its secret — `application/json` [ApiKeyCreated](#apikeycreated)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `PUT /api/v1/api-keys/{id}`

**Rename an API key**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Request body (`application/json`): [ApiKeyUpdateRequest](#apikeyupdaterequest)


Responses:

- `200` The renamed key — `application/json` [ApiKey](#apikey)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `DELETE /api/v1/api-keys/{id}`

**Revoke an API key** — Revokes rather than deletes: the record of a key that once had access, and when it was last used, is exactly what an incident review needs. `purge=true` removes the row as well — which destroys that record, and is also the only way to reopen an API that keys have closed, because enforcement is sticky once a deployment has ever had a key.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |
| `purge` | query | boolean |  | Also delete the record, reopening the API if this was the last key. |

Responses:

- `200` The revoked key — `application/json` [ApiKey](#apikey)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken

## Views

### `GET /api/v1/views`

**Saved views on the calls list**

Responses:

- `200` Saved views — `application/json` [SavedViewList](#savedviewlist)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey


### `POST /api/v1/views`

**Save the current calls-list filters as a named view** — A view is a name for a query string. It is stored on the server rather than in one browser, because a rota of supervisors reviewing the same queue should be looking at the same definition of it. The query is re-parsed through an allowlist on save. Like a share link this writes application state only and grants no access the read API does not already give, so it sits at read-level auth rather than behind the write credential.

Request body (`application/json`): [SavedViewRequest](#savedviewrequest)


Responses:

- `201` The saved view — `application/json` [SavedView](#savedview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey


### `PUT /api/v1/views/{id}`

**Rename a saved view or update its filters**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Request body (`application/json`): [SavedViewRequest](#savedviewrequest)


Responses:

- `200` The updated view — `application/json` [SavedView](#savedview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey


### `DELETE /api/v1/views/{id}`

**Delete a saved view**

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

Auth: ApiKey

## Retention

### `GET /api/v1/retention/preview`

**Which calls the retention policy would remove** — Always available, whether or not the policy is enabled, so an operator can see the consequence of a policy before saving it. `days=0` means no retention limit and returns no candidates — the destructive reading of a default-valued field is never the right one.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `days` | query | integer |  | Preview a policy other than the saved one. |

Responses:

- `200` What the policy would remove — `application/json` [PurgePreview](#purgepreview)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `POST /api/v1/retention/purge`

**Delete the calls the retention policy covers** — Irreversible: the Knowledge Box resource, its recording and every label and analysis derived from it are removed. Share links pointing at a purged call are revoked in the same pass, so no live URL is left resolving to nothing. `dryRun` returns the same shape without deleting. One run is capped at 200 calls; `remaining` reports what the policy still covers afterwards.

Request body (`application/json`): [PurgeRequest](#purgerequest)


Responses:

- `200` What was removed — `application/json` [PurgeResult](#purgeresult)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken

## Analytics

### `GET /api/v1/dashboard`

**Aggregated analytics across a date window** — Named windows are resolved on the server and snapped to whole UTC days, so a link reproduces the dashboard the sender saw and two people opening it four minutes apart share one cache entry. `from`/`to` override `range`.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `range` | query | string |  |  |
| `from` | query | string |  | Inclusive ISO-8601 lower bound. |
| `to` | query | string |  | Inclusive ISO-8601 upper bound. |

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

## Taxonomy

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


### `POST /api/v1/labelsets`

**Define a new labelset** — The shipped health-insurance taxonomy is a default, not a constraint: a partner classifying utility calls needs different reasons and different outcomes, and forking the repo to get them is the difference between a product and a sample. Creating a labelset also writes it to the Knowledge Box, so the labeler agent can apply it on the next run.

Request body (`application/json`): [LabelsetDefinition](#labelsetdefinition)


Responses:

- `201` The labelset, and whether it reached the Knowledge Box — `application/json` [LabelsetWriteResult](#labelsetwriteresult)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `GET /api/v1/labelsets/{id}`

**One labelset definition**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `200` The labelset — `application/json` [LabelsetDefinition](#labelsetdefinition)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `PUT /api/v1/labelsets/{id}`

**Replace a labelset definition** — The path id always wins over a body id: renaming it would orphan every label already applied in the Knowledge Box under the old one. Saving also re-provisions the labelset, so the definition and the Knowledge Box cannot drift apart.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Request body (`application/json`): [LabelsetDefinition](#labelsetdefinition)


Responses:

- `200` The saved labelset — `application/json` [LabelsetWriteResult](#labelsetwriteresult)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `DELETE /api/v1/labelsets/{id}`

**Remove a labelset from the taxonomy** — Removes it from the product's vocabulary. Whether the Knowledge Box also drops it is an explicit second choice (`?knowledge_box=true`), because the labels already applied to analysed calls are data, not configuration.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |
| `knowledge_box` | query | boolean |  | Also delete the labelset — and the labels applied with it — from the Knowledge Box. |

Responses:

- `204` Deleted
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `POST /api/v1/labelsets/{id}/provision`

**Write one labelset to the Knowledge Box**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `200` Provisioned — `application/json` [LabelsetWriteResult](#labelsetwriteresult)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `POST /api/v1/labelsets/{id}/reset`

**Restore a labelset to the definition the product ships** — The taxonomy equivalent of `DELETE /api/v1/settings/{section}`: an edit is reversible without the operator having to know what the original was, which is the difference between a configuration surface people will experiment with and one they will not touch. Re-provisions in the same request. Only shipped labelsets can be reset — a partner's own vocabulary has nothing to be reset to, and returns 404.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `200` The restored labelset — `application/json` [LabelsetWriteResult](#labelsetwriteresult)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `GET /api/v1/agents`

**The data-augmentation agents, their configuration and their live state** — The labeler agents' operations are derived from the current labelsets rather than stored separately, which is what keeps a labelset edit and the agent that applies it from drifting apart.

Responses:

- `200` Agents — `application/json` [AgentList](#agentlist)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: public


### `PUT /api/v1/agents/{key}`

**Enable, disable or re-instruct an agent** — `enabled` decides whether provisioning starts the agent at all; `prompts` replaces the instruction for one of the agent's outputs, keyed by the resource field it writes. A change takes effect on the next provision — the Knowledge Box holds the running task, and rewriting an agent under a task that is mid-run is how you get half a corpus labelled two different ways.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `key` | path | string | yes |  |

Request body (`application/json`): [AgentUpdateRequest](#agentupdaterequest)


Responses:

- `200` The agent after the edit — `application/json` [AgentConfig](#agentconfig)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `DELETE /api/v1/agents/{key}`

**Stop an agent's Knowledge Box task**

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `key` | path | string | yes |  |

Responses:

- `200` The agent after stopping — `application/json` [AgentConfig](#agentconfig)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


### `POST /api/v1/agents/{key}/start`

**Start one agent against the Knowledge Box** — ARAG allows exactly one running task per operation type, so starting an agent that already has one fails rather than silently queueing a second.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `key` | path | string | yes |  |

Responses:

- `200` The agent after starting — `application/json` [AgentConfig](#agentconfig)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
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
| `ref` | query | string |  | The object the job is about — a call id for an ingestion. |
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


### `DELETE /api/v1/jobs/{id}`

**Cancel a queued or running job** — Signals the job's abort controller and marks it cancelled. Work already committed upstream is not rolled back — a cancelled ingestion leaves the Knowledge Box resource it had already created, which the call list then shows as incomplete rather than pretending it never existed. A job that has already finished returns 409.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string | yes |  |

Responses:

- `200` The cancelled job — `application/json` [Job](#job)
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `409` The job had already finished — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: ApiKey or AdminToken


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


### `POST /api/v1/admin/reseed`

**Add shipped labelsets this deployment does not hold** — The taxonomy store seeds itself once, so a labelset added to the product in a later release cannot reach a deployment that has already been seeded — and seeding on every boot would resurrect anything an operator deliberately deleted. This is the deliberate way to cross that line: it only ever *adds*, so an edited definition survives untouched, but a labelset that was deleted is by definition missing and does come back. The response names every id it added and every id it left alone, so an operator can undo exactly what arrived.

Responses:

- `200` What the re-seed did — `application/json` object
- `400` Validation failed — `application/problem+json` [Problem](#problem)
- `401` Authentication required — `application/problem+json` [Problem](#problem)
- `403` Forbidden — `application/problem+json` [Problem](#problem)
- `404` Not found — `application/problem+json` [Problem](#problem)
- `429` Rate limited — `application/problem+json` [Problem](#problem)
- `502` Upstream (ARAG) error — `application/problem+json` [Problem](#problem)

Auth: AdminToken


### `GET /api/v1/admin/audit`

**Who changed what, and when** — Every settings edit, key issue or revocation, taxonomy change and purge, with the actor and the values that changed. Secrets are reduced to `true`: an audit trail that quotes the credential is a second place to leak it.

Parameters:

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `action` | query | string |  |  |
| `limit` | query | integer |  |  |

Responses:

- `200` Audit records — `application/json` [AuditPage](#auditpage)
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

A share link as the register knows it. It carries no token and no URL: the token is stored as a SHA-256 digest, exactly as an API key is, so a leaked `shares.json` grants nothing. The address exists once, in the response to creating the link.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | The stored digest. Safe to list, and what a revoke is addressed to — not a credential. |
| `callId` | string | yes |  |
| `callTitle` | string |  |  |
| `createdISO` | string | yes |  |
| `expiresISO` | string | yes |  |
| `revoked` | boolean | yes |  |
| `expired` | boolean | yes |  |
| `note` | string |  |  |

### ShareCreated

_object_

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
| `retention` | object |  |  |
| `overridden` | array of string |  | Sections the settings store is currently overriding the environment for. |
| `features` | object | yes | What this deployment allows: uploads, deletes, admin panel, API-key auth. |
| `apiKeys` | object |  |  |
| `taxonomy` | object |  |  |

### SettingsUpdateRequest

A patch for one settings section. Only the keys present are changed; the rest of the section keeps its current value. Unknown keys are rejected so a typo in a partner's automation fails loudly instead of silently doing nothing.

| Field | Type | Required | Description |
|---|---|---|---|
| `productName` | string |  |  |
| `tagline` | string |  |  |
| `footerText` | string |  |  |
| `poweredBy` | boolean |  |  |
| `primaryColor` | string |  |  |
| `accentColor` | string |  |  |
| `logoUrl` | string |  |  |
| `docsUrl` | string |  |  |
| `supportUrl` | string |  |  |
| `kbId` | string |  |  |
| `region` | string |  |  |
| `baseUrl` | string |  |  |
| `generativeModel` | string |  |  |
| `reranker` | string (`predict`, `noop`, ``) |  |  |
| `timeoutMs` | integer |  |  |
| `apiKey` | string |  | Write-only. An empty string leaves the stored credential untouched. |
| `maxQuestionChars` | integer |  |  |
| `maxUploadBytes` | integer |  |  |
| `rateLimitRps` | integer |  |  |
| `rateLimitBurst` | integer |  |  |
| `cacheTtlMs` | integer |  |  |
| `days` | integer |  |  |
| `enabled` | boolean |  |  |

### ApiKey

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes |  |
| `name` | string | yes |  |
| `preview` | string | yes | `ca_live_` plus the first 8 characters. The key itself is stored hashed and is never returned after creation. |
| `createdISO` | string | yes |  |
| `lastUsedISO` | string |  | Recorded at most once a minute per key. |
| `revoked` | boolean | yes |  |
| `fromEnv` | boolean | yes | Imported from the `API_KEYS` seed. |
| `purged` | boolean |  | Present on a purge: the record was deleted too. |
| `createdBy` | string |  |  |

### ApiKeyList

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array of [ApiKey](#apikey) | yes |  |

### ApiKeyCreateRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |

### ApiKeyCreated

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | [ApiKey](#apikey) | yes |  |
| `secret` | string | yes | The key material, returned exactly once. It cannot be recovered afterwards. |

### ApiKeyUpdateRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |

### LabelsetDefinition

A labelset as the product defines it: the vocabulary the labeler agent is told to apply.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Stable identifier; also the Knowledge Box labelset id. Never changes after creation. |
| `title` | string | yes |  |
| `color` | string |  |  |
| `multiple` | boolean |  | May several labels from this set apply to one call? |
| `kind` | string (`RESOURCES`, `PARAGRAPHS`) |  |  |
| `labels` | array of object | yes |  |

### LabelsetWriteResult

| Field | Type | Required | Description |
|---|---|---|---|
| `labelset` | [LabelsetDefinition](#labelsetdefinition) | yes |  |
| `provisioned` | boolean | yes | The Knowledge Box was updated in the same request. |
| `provisionError` | string |  | Set when the definition was saved but the Knowledge Box write failed. |

### AgentConfig

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | string | yes |  |
| `type` | string (`labeler`, `ask`) | yes |  |
| `description` | string | yes |  |
| `enabled` | boolean | yes |  |
| `model` | string |  |  |
| `state` | string (`running`, `completed`, `failed`, `configured`, `absent`) |  |  |
| `taskId` | string |  |  |
| `operations` | integer |  |  |
| `prompts` | object |  | Editable instructions, keyed by the resource field the operation writes. |
| `labelsets` | array of string |  | Labelsets this agent applies (labeler agents only). Derived from the taxonomy. |

### AgentList

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array of [AgentConfig](#agentconfig) | yes |  |

### AgentUpdateRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `enabled` | boolean |  |  |
| `description` | string |  |  |
| `model` | string |  |  |
| `prompts` | object |  |  |

### SavedView

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes |  |
| `name` | string | yes |  |
| `query` | string | yes | Normalised calls-list query string, without the leading `?`. |
| `href` | string | yes |  |
| `description` | string |  |  |
| `createdISO` | string | yes |  |
| `createdBy` | string |  |  |

### SavedViewList

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array of [SavedView](#savedview) | yes |  |

### SavedViewRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes |  |
| `query` | string | yes |  |
| `description` | string |  |  |

### PurgePreview

| Field | Type | Required | Description |
|---|---|---|---|
| `days` | integer | yes |  |
| `enabled` | boolean | yes |  |
| `cutoffISO` | string | yes |  |
| `total` | integer | yes | How many calls the policy covers — the number a purge would remove. |
| `retained` | integer | yes | How many calls the policy keeps. |
| `candidates` | array of object | yes |  |

### PurgeRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `days` | integer |  | Override the saved policy for this run. |
| `dryRun` | boolean |  | Report what would be deleted without deleting it. |
| `ids` | array of string |  |  |

### PurgeResult

| Field | Type | Required | Description |
|---|---|---|---|
| `days` | integer | yes |  |
| `cutoffISO` | string | yes |  |
| `deleted` | array of string | yes |  |
| `failed` | array of object | yes |  |
| `sharesRevoked` | integer |  |  |
| `dryRun` | boolean | yes |  |
| `scoped` | integer |  | Calls this run was asked to delete: the policy's candidates, narrowed by `ids` if given. |
| `remaining` | integer |  | Of those, how many are still outstanding — the per-run cap of 200, plus anything that failed. Non-zero means run again. |

### AuditPage

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array of object | yes |  |

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

