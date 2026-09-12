# Call Analysis — Product Experience Specification

Status: authoritative design spec for the D-28 product-experience pass.
Audience: the engineering lead implementing it, verbatim.
Scope: the signed-in product (`/`), the operator product (`/admin`), and the `/api/v1` surface both consume.
Conventions: British spelling. No emoji anywhere in the product or in this document. All colours are `--arag-*` tokens from `vendor/arag-platform/ui/arag-ui.css` unless stated.

---

## 0. The decisions this spec makes

These are settled. Do not re-open them during implementation; record any deviation in `DECISIONS.md`.

| # | Decision |
|---|---|
| D-A | The default product identity is the **official Progress Agentic RAG wordmark** (`public/brand/arag-logo.svg` on light, `public/brand/arag-logo-alt.svg` on dark). The hand-drawn five-bar waveform wordmark in `components/AppChrome.tsx` is deleted. |
| D-B | Progress green `#5ce500` is a **dark-surface and fill-only** colour. It never appears as text, as a hairline, or as an indicator on a light surface. Full rules in §6.3. |
| D-C | The primary interactive palette is the UI kit's ink/brand blues (`--arag-brand-600` `#2b2bb2` for action, `--arag-ink-950` `#00123c` for the brand band and headings). |
| D-D | `BRAND_*` overrides everything. When `BRAND_POWERED_BY=0`, the Progress band, the wordmark and every use of `#5ce500` disappear together — a white-label install shows zero Progress green. |
| D-E | The app shell is a **persistent left sidebar** (248px expanded / 64px rail), collapsing to a top bar + drawer below 1024px. The current sticky two-band top nav becomes the band + page header only. |
| D-F | `/calls` has two modes behind a segmented control: **Table** (default, a real data table) and **Browse** (the existing category rails). Mode is persisted per user in `localStorage` under `ca.calls.mode`. |
| D-G | The call detail page becomes a **workspace** with its own three-pane layout and a right-hand inspector, not a page of stacked cards. |
| D-H | `/admin` is restructured as an operator product in the same shell, with its own sidebar section: Overview, Connection, Taxonomy & Agents, Jobs, Logs, Usage, Branding, Security. |
| D-I | Every new UI need is met by the UI kit first. Additions are authored in `public/ui-ext.css` in **kit style** (`.arag-*` class names, kit tokens only, no Tailwind) so the Head can lift the file into `arag-platform/ui/arag-ui.css` unchanged. `app/globals.css` imports it immediately after the kit. |
| D-J | Trust surfaces (confidence, citation, grounding, decline) are first-class components with their own tokens and states, specified in §6.6 and §7. |

---

## 1. Personas and jobs to be done

Taken from `marketing/site/call-analysis.json` → `personas`. Each JTBD names the screen it lands on and the first action available there.

### 1.1 Ops lead — Dana, contact-centre operations leader
Owns queue-level performance. Reviews a 1–2% manual sample today and guesses at the rest.

| Job | Trigger | Lands on | First action |
|---|---|---|---|
| "Tell me whether this week is worse than last" | Monday morning | `/` Dashboard | Change the date range in the header; the KPI strip and every chart re-aggregate. |
| "Show me the calls behind that number" | A KPI or bar looks wrong | `/calls?label=…&from=…&to=…` (Table mode) | The filter bar arrives pre-populated with the drill-through; remove one facet to widen. |
| "Which agent or queue is driving the complaint rate" | Weekly review | `/` Dashboard → **By agent** / **By queue** breakdown | Sort the breakdown table by complaint rate; click a row to filter `/calls`. |
| "Give me the list for my ops meeting" | Friday | `/calls` Table mode | Select rows → **Export** → CSV. |

### 1.2 QA lead — Priya, QA / compliance manager
Needs proof a disclosure was read, and a trail from a finding to the exact second.

| Job | Trigger | Lands on | First action |
|---|---|---|---|
| "Find every call flagged as a compliance risk" | Monthly spot check | `/calls` Table mode, facet `disposition_flags/Compliance Risk` | Sort by date, select the sample, export. |
| "Prove the disclosure was given on this call" | A specific dispute | `/calls/{id}` workspace | Click the **Compliance Disclosure** marker on the moments track; the player scrubs and the transcript line highlights. |
| "Answer a question about this call with evidence" | An escalation lands | `/calls/{id}` → Ask panel | Ask; click the citation chip; the recording moves to that second. |
| "Send the evidence to someone without an account" | Dispute handling | `/calls/{id}` → **Share** | Create a read-only share link with an expiry; copy. |
| "Re-run the analysis after we changed the taxonomy" | Taxonomy change | `/calls/{id}` → kebab → **Re-run analysis**, or bulk from the table | Watch the job progress inline; the call returns to `labelling` then `analysed`. |

### 1.3 Insights analyst — Tom, CX / insights analyst
Needs consistent, comparable call-driver data, filterable by segment, with no spreadsheet coding.

| Job | Trigger | Lands on | First action |
|---|---|---|---|
| "Segment the whole queue by reason and line of business" | Quarterly analysis | `/` Dashboard | Apply a line-of-business filter in the header; every chart and the KPI strip respect it. |
| "Find every call where a competitor was mentioned" | Ad-hoc question | `/calls` Table mode | Type in the search box; search is semantic and full-text over transcripts. |
| "Get the data out into my own tooling" | Always | `/calls` → **Export** → JSON, or `/api/v1/docs` | Export honours the current filter set, not just the visible page. |
| "Check the categories match how we actually talk" | Onboarding a new queue | `/taxonomy` → Labelsets | Edit a labelset; **Re-provision** to apply it to future calls. |

### 1.4 Partner architect — Sam, platform engineer / partner architect
Needs a documented API, real auth and rate-limit behaviour, and a way to evaluate before provisioning a live Knowledge Box.

| Job | Trigger | Lands on | First action |
|---|---|---|---|
| "Evaluate the whole product with no credentials" | Day one | `/welcome` first-run | **Try with sample calls** — seeds 24 calls and provisions the taxonomy against the mock or the connected box. |
| "See the API behind every screen" | While evaluating | `/settings/about` → **API reference**, `/api/v1/docs` | Every screen names the endpoint that feeds it in the page footer meta line. |
| "Confirm the connection and the agents are healthy" | Before go-live | `/admin/connection` | Run the connection test; read the provisioning state of all three agents. |
| "Brand it for our customer" | Pre-sales | `/settings/branding` | Live preview of the shell with `BRAND_*` values applied, plus the exact env block to copy. |
| "Issue a key for our integration" | Integration | `/admin/security` → API keys | Create a key; the secret is shown once. |

---

## 2. Information architecture

### 2.1 Route tree

Legend — **Auth**: `public` (no credentials), `api` (open unless `API_KEYS` set, then key or demo session), `write` (admin token or API key), `admin` (admin token). **New** marks a route that does not exist today.

```
/                               Dashboard                       auth: api    NEW (rebuilt)
/welcome                        First-run onboarding            auth: api    NEW
/calls                          Calls list (Table | Browse)     auth: api    (rebuilt)
/calls/[id]                     Call workspace                  auth: api    (rebuilt)
/upload                         Upload / ingest                 auth: write  NEW
/upload/history                 Ingest history                  auth: write  NEW
/taxonomy                       Agents & Taxonomy (tabbed)      auth: api    NEW
  /taxonomy?tab=labelsets         Labelsets (default)
  /taxonomy?tab=agents            Agent definitions + state
  /taxonomy?tab=provisioning      Provisioning runs
/settings                       redirect -> /settings/connection auth: api   NEW
/settings/connection            Knowledge Box connection        auth: api    NEW
/settings/branding              Branding preview                auth: api    NEW
/settings/usage                 Usage                           auth: api    NEW
/settings/api-keys              API keys (placeholder)          auth: admin  NEW
/settings/about                 Version, docs, licences         auth: public NEW
/share/[token]                  Read-only shared call           auth: public NEW

/admin                          Operator overview               auth: admin  (rebuilt)
/admin/connection               Health + effective config       auth: admin  NEW (merges /admin/health + /admin/config)
/admin/taxonomy                 Labelsets + agents + provision  auth: admin  (was /admin/agents)
/admin/jobs                     Jobs table + detail drawer      auth: admin  (rebuilt)
/admin/logs                     Log stream                      auth: admin  (rebuilt)
/admin/usage                    Usage + cache                   auth: admin  (merges /admin/usage + /admin/cache)
/admin/branding                 Branding config + preview       auth: admin  NEW
/admin/security                 Auth modes, API keys, rate limits auth: admin NEW
/admin/login                    Token exchange                  auth: public (kept)

/admin/health    -> 308 /admin/connection
/admin/config    -> 308 /admin/connection?tab=config
/admin/agents    -> 308 /admin/taxonomy
/admin/cache     -> 308 /admin/usage?tab=cache

/api/v1/docs                    Redoc                           auth: public (kept)
/api/v1/swagger                 Swagger UI                      auth: public (kept)
/healthz, /readyz                                               auth: public (kept)
```

### 2.2 Route → endpoint map

| Route | Endpoints it consumes | Status |
|---|---|---|
| `/` | `GET /api/v1/dashboard` (extended with filter params), `GET /api/v1/onboarding` | dashboard exists, params NEW |
| `/welcome` | `GET /api/v1/onboarding`, `POST /api/v1/samples`, `GET /api/v1/jobs/{id}/events`, `POST /api/v1/admin/provision` | onboarding + samples NEW |
| `/calls` Table | `GET /api/v1/calls` (sort/filter/facets extended), `GET /api/v1/labelsets` | calls exists, params NEW |
| `/calls` Browse | `GET /api/v1/dashboard`, `GET /api/v1/calls?label=…&page_size=10` | exists |
| `/calls` bulk bar | `POST /api/v1/calls/bulk`, `POST /api/v1/calls/export` | NEW |
| `/calls/[id]` | `GET /api/v1/calls/{id}`, `GET /api/v1/calls/{id}/media`, `POST /api/v1/calls/{id}/ask` | exists |
| `/calls/[id]` actions | `POST /api/v1/calls/{id}/reanalyse`, `POST /api/v1/calls/{id}/share`, `DELETE /api/v1/calls/{id}/share`, `GET /api/v1/calls/{id}/export`, `DELETE /api/v1/calls/{id}` | delete exists, rest NEW |
| `/upload` | `POST /api/v1/calls`, `GET /api/v1/jobs/{id}/events` | exists |
| `/upload/history` | `GET /api/v1/jobs?kind=ingest-call` (sort/paging extended) | exists, params NEW |
| `/taxonomy` | `GET /api/v1/taxonomy`, `PUT /api/v1/labelsets/{id}`, `DELETE /api/v1/labelsets/{id}`, `POST /api/v1/admin/provision` | taxonomy + labelset writes NEW |
| `/settings/connection` | `GET /api/v1/settings` | NEW |
| `/settings/branding` | `GET /api/v1/branding`, `PATCH /api/v1/settings` | branding exists, patch NEW |
| `/settings/usage` | `GET /api/v1/usage` | NEW (non-admin subset) |
| `/settings/api-keys` | `GET/POST /api/v1/admin/api-keys`, `DELETE /api/v1/admin/api-keys/{id}` | NEW |
| `/settings/about` | `GET /api/v1/settings`, `GET /api/v1/branding` | settings NEW |
| `/share/[token]` | `GET /api/v1/shares/{token}`, `GET /api/v1/shares/{token}/media` | NEW |
| `/admin` | `GET /api/v1/admin/health`, `GET /api/v1/admin/usage`, `GET /api/v1/jobs?limit=5` | exists |
| `/admin/connection` | `GET /api/v1/admin/health`, `GET /api/v1/admin/config` | exists |
| `/admin/taxonomy` | `GET /api/v1/admin/agents`, `GET /api/v1/taxonomy`, `POST /api/v1/admin/provision`, `PUT/DELETE /api/v1/labelsets/{id}` | partly NEW |
| `/admin/jobs` | `GET /api/v1/jobs`, `GET /api/v1/jobs/{id}`, `GET /api/v1/jobs/{id}/events`, `POST /api/v1/jobs/{id}/cancel` | cancel NEW |
| `/admin/logs` | `GET /api/v1/admin/logs` | exists |
| `/admin/usage` | `GET /api/v1/admin/usage`, `GET /api/v1/admin/cache`, `POST /api/v1/admin/cache/invalidate` | exists |
| `/admin/branding` | `GET /api/v1/branding`, `GET /api/v1/admin/config` | exists |
| `/admin/security` | `GET /api/v1/admin/config`, `GET/POST/DELETE /api/v1/admin/api-keys` | keys NEW |

### 2.3 Endpoints that do not exist yet — the exact new API surface

Author these in `lib/openapi.ts` before touching any UI. Every one gets a `RouteDef` entry in `API_ROUTES`.

#### 2.3.1 Extended: `GET /api/v1/calls` (`listCalls`)

Existing params `q`, `label[]`, `page`, `page_size` are kept. Add:

| Param | In | Schema | Meaning |
|---|---|---|---|
| `sort` | query | `string`, enum `["created","duration","title","agent","queue","csat","compliance","sentiment","status"]`, default `created` | Sort key. |
| `order` | query | `string`, enum `["asc","desc"]`, default `desc` | Sort direction. |
| `from` | query | `string`, format `date-time` | Call time lower bound, inclusive. |
| `to` | query | `string`, format `date-time` | Call time upper bound, inclusive. |
| `duration_min` | query | `integer`, min 0, max 86400 | Seconds, inclusive. |
| `duration_max` | query | `integer`, min 0, max 86400 | Seconds, inclusive. |
| `sentiment` | query | `array<string>`, enum `["Positive","Neutral","Negative","Mixed"]`, maxItems 4 | OR within the facet. |
| `agent` | query | `array<string>`, maxLength 120, maxItems 20 | Agent name, OR within the facet. |
| `queue` | query | `array<string>`, maxLength 120, maxItems 20 | Queue, OR within the facet. |
| `media_type` | query | `array<string>`, enum `["audio","video","transcript"]` | OR within the facet. |
| `lifecycle` | query | `array<string>`, enum `["queued","transcribing","labelling","analysed","partial","failed"]` | OR within the facet. |
| `facets` | query | `boolean`, default `false` | When true, the response carries per-facet counts computed **after** `q` and date/duration filters but **before** the facet's own selection (standard facet semantics). |

Response: `CallPage` gains two optional properties.

```jsonc
// components/schemas/CallPage  (extends pageSchema("CallSummary"))
{
  "items": [ /* CallSummary */ ],
  "page": 1, "page_size": 50, "total": 24, "next_page": false,
  "facets": {                      // present only when facets=true
    "call_reason":       [ { "name": "Claims", "value": 6 } ],
    "call_outcome":      [ /* Datum */ ],
    "sentiment":         [ /* Datum */ ],
    "line_of_business":  [ /* Datum */ ],
    "disposition_flags": [ /* Datum */ ],
    "agent":             [ /* Datum */ ],
    "queue":             [ /* Datum */ ],
    "media_type":        [ /* Datum */ ],
    "lifecycle":         [ /* Datum */ ]
  },
  "applied": {                     // echo of the effective query, for the UI's filter chips
    "q": null, "label": [], "sort": "created", "order": "desc",
    "from": null, "to": null, "duration_min": null, "duration_max": null,
    "sentiment": [], "agent": [], "queue": [], "media_type": [], "lifecycle": []
  }
}
```

`CallSummary` gains one required property:

```jsonc
"lifecycle": {
  "type": "string",
  "enum": ["queued","transcribing","labelling","analysed","partial","failed"],
  "description": "Derived call lifecycle state. See services/calls.ts deriveLifecycle()."
}
```

Derivation (implement as `deriveLifecycle(summary, job?)` in `services/calls.ts`):

```
job?.status === "queued"                                   -> "queued"
job?.status === "failed" || arag status === "ERROR"        -> "failed"
arag status === "PENDING"                                  -> "transcribing"
labels.length === 0                                        -> "labelling"
metrics missing or has no call_reason                      -> "labelling"
metrics present but analysis missing or metrics incomplete -> "partial"
otherwise                                                  -> "analysed"
```

#### 2.3.2 Extended: `GET /api/v1/dashboard` (`getDashboard`)

Add the same scoping params so a filtered dashboard is a real thing: `q`, `label[]`, `from`, `to`, `agent[]`, `queue[]`, `sentiment[]`, `media_type[]`. Response `Dashboard` gains:

```jsonc
"byAgent":  { "type": "array", "items": { "$ref": "#/components/schemas/AgentRollup" } },
"byQueue":  { "type": "array", "items": { "$ref": "#/components/schemas/AgentRollup" } },
"byDay":    { "type": "array", "items": { "$ref": "#/components/schemas/Datum" } },  // name = ISO date
"applied":  { "type": "object", "additionalProperties": true }
```

```jsonc
// components/schemas/AgentRollup
{
  "type": "object",
  "required": ["name", "calls"],
  "properties": {
    "name": { "type": "string" },
    "calls": { "type": "integer" },
    "fcrRate": { "type": "number" },
    "complaintRate": { "type": "number" },
    "escalationRate": { "type": "number" },
    "avgCsat": { "type": "number" },
    "avgCompliance": { "type": "number" }
  }
}
```

#### 2.3.3 New endpoints

Each block below is the complete definition: operationId, method, path, auth, params/body, responses.

**1. Bulk actions**

```
operationId: bulkCallAction
POST /api/v1/calls/bulk            auth: write      tags: [Calls]
summary: Apply an action to many calls at once
```
```jsonc
// requestBody  BulkCallActionRequest   (application/json)
{
  "type": "object",
  "required": ["action"],
  "additionalProperties": false,
  "properties": {
    "action": { "type": "string", "enum": ["delete", "reanalyse", "addLabel", "removeLabel"] },
    "ids":    { "type": "array", "items": { "type": "string", "maxLength": 64 }, "maxItems": 200 },
    "filter": { "$ref": "#/components/schemas/CallFilter" },   // alternative to ids: "select all matching"
    "label":  { "type": "string", "maxLength": 120,
                "description": "Required for addLabel/removeLabel. Format `labelset/label`." }
  }
}
// Exactly one of ids or filter must be present (enforced in the handler; documented in the description).
```
```jsonc
// 202 response  BulkCallActionAccepted
{
  "type": "object",
  "required": ["job", "matched"],
  "properties": {
    "job": { "$ref": "#/components/schemas/Job" },   // kind "bulk-calls"
    "matched": { "type": "integer", "description": "Number of calls the action will be applied to." }
  }
}
```
Errors: `400` (neither/both of ids and filter; missing label), `404` (no id matched), plus `standardResponses`.

`CallFilter` is a reusable object mirroring the list query, used by bulk and export:

```jsonc
// components/schemas/CallFilter
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "q": { "type": "string", "maxLength": 200 },
    "label": { "type": "array", "items": { "type": "string", "maxLength": 120 }, "maxItems": 20 },
    "from": { "type": "string", "format": "date-time" },
    "to": { "type": "string", "format": "date-time" },
    "duration_min": { "type": "integer", "minimum": 0, "maximum": 86400 },
    "duration_max": { "type": "integer", "minimum": 0, "maximum": 86400 },
    "sentiment": { "type": "array", "items": { "type": "string" }, "maxItems": 4 },
    "agent": { "type": "array", "items": { "type": "string", "maxLength": 120 }, "maxItems": 20 },
    "queue": { "type": "array", "items": { "type": "string", "maxLength": 120 }, "maxItems": 20 },
    "media_type": { "type": "array", "items": { "type": "string" }, "maxItems": 3 },
    "lifecycle": { "type": "array", "items": { "type": "string" }, "maxItems": 6 }
  }
}
```

**2. Export a filtered set**

```
operationId: exportCalls
POST /api/v1/calls/export          auth: api        tags: [Calls]
summary: Export the calls matching a filter as CSV or JSON
```
```jsonc
// requestBody  ExportCallsRequest
{
  "type": "object",
  "required": ["format"],
  "additionalProperties": false,
  "properties": {
    "format": { "type": "string", "enum": ["csv", "json"] },
    "ids":    { "type": "array", "items": { "type": "string", "maxLength": 64 }, "maxItems": 1000 },
    "filter": { "$ref": "#/components/schemas/CallFilter" },
    "fields": { "type": "array", "maxItems": 40,
                "items": { "type": "string" },
                "description": "Column allowlist. Default: id,title,createdISO,durationSec,agentName,queue,mediaType,lifecycle,call_reason,outcome,sentiment,line_of_business,complaint,cross_sell_offered,cross_sell_accepted,csat_estimate,compliance_score,first_call_resolution,escalated,executive_summary" },
    "includeTranscript": { "type": "boolean", "default": false }
  }
}
```
Responses:
- `200` `text/csv` or `application/json` — a streamed body, `Content-Disposition: attachment; filename="calls-<ISO date>.csv"`. Hard cap 1000 rows; `includeTranscript:true` lowers the cap to 200.
- `413` problem when the filter matches more than the cap, with `detail` naming the match count and telling the caller to narrow the filter.
- plus `standardResponses`.

```
operationId: exportCall
GET /api/v1/calls/{id}/export      auth: api        tags: [Calls]
summary: Export one call
parameters: id (path), format (query, enum ["json","txt","vtt"], default "json")
responses: 200 application/json | text/plain | text/vtt, Content-Disposition attachment; 404; standardResponses
```
`txt` is the plain transcript with `[mm:ss] Speaker:` prefixes. `vtt` is WebVTT cues built from `paragraphs[].startSeconds/endSeconds`, so the transcript drops straight into a media player.

**3. Re-run analysis**

```
operationId: reanalyseCall
POST /api/v1/calls/{id}/reanalyse  auth: write      tags: [Calls]
summary: Re-run labelling and analysis for one call
parameters: id (path, string, maxLength 64)
```
```jsonc
// requestBody  ReanalyseRequest  (optional)
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "labels":   { "type": "boolean", "default": true, "description": "Re-run both labeler agents." },
    "analysis": { "type": "boolean", "default": true, "description": "Re-run the call-insights ask agent." }
  }
}
// 202 -> { "$ref": "#/components/schemas/Job" }   kind "reanalyse-call", ref = call id
```
Errors: `404` unknown call, `409` when a reanalyse job for the same call is already running (problem `detail` names the running job id), plus `standardResponses`.

**4. Share links**

```
operationId: createCallShare
POST /api/v1/calls/{id}/share      auth: write      tags: [Sharing]
```
```jsonc
// requestBody  CreateShareRequest (optional)
{
  "type": "object", "additionalProperties": false,
  "properties": {
    "expiresInHours": { "type": "integer", "minimum": 1, "maximum": 720, "default": 168 },
    "includeMedia":   { "type": "boolean", "default": true },
    "includeAnalysis":{ "type": "boolean", "default": true }
  }
}
// 201 -> ShareLink
{
  "type": "object",
  "required": ["token", "url", "callId", "createdAt", "expiresAt"],
  "properties": {
    "token":     { "type": "string", "description": "Opaque, 32 bytes base64url. Not derivable from the call id." },
    "url":       { "type": "string", "description": "Absolute URL to /share/{token}." },
    "callId":    { "type": "string" },
    "createdAt": { "type": "string", "format": "date-time" },
    "expiresAt": { "type": "string", "format": "date-time" },
    "includeMedia":    { "type": "boolean" },
    "includeAnalysis": { "type": "boolean" },
    "revokedAt": { "type": "string", "format": "date-time", "nullable": true }
  }
}
```
```
operationId: listCallShares
GET /api/v1/calls/{id}/share       auth: write      -> { "items": [ShareLink] }

operationId: revokeCallShare
DELETE /api/v1/calls/{id}/share    auth: write
parameters: id (path), token (query, required, maxLength 64)
responses: 204; 404; standardResponses

operationId: getSharedCall
GET /api/v1/shares/{token}         auth: none       tags: [Sharing]
responses: 200 -> CallDetail with fields stripped per the share's flags (analysis omitted when
           includeAnalysis=false; a `share` block is added carrying expiresAt and includeMedia);
           404 when unknown, revoked or expired — never distinguish the three;
           410 is NOT used (it leaks that the token was once valid).

operationId: getSharedCallMedia
GET /api/v1/shares/{token}/media   auth: none       tags: [Sharing]
parameters: token (path), field (query, enum ["media","transcript"], default "media")
responses: 200/206 octet-stream (Range forwarded); 404; standardResponses
```
Storage: shares live in the platform JSON store as collection `shares` (capped 500). Rate-limit `/api/v1/shares/*` per IP at half the public rate.

**5. Settings**

```
operationId: getSettings
GET /api/v1/settings               auth: api        tags: [Settings]
```
```jsonc
// 200 -> SettingsView   (never carries a secret; every credential is a boolean or a masked tail)
{
  "type": "object",
  "required": ["version", "connection", "branding", "features"],
  "properties": {
    "version":         { "type": "string" },
    "platformVersion": { "type": "string" },
    "connection": {
      "type": "object",
      "required": ["mode", "ok"],
      "properties": {
        "mode":     { "type": "string", "enum": ["live", "mock"] },
        "ok":       { "type": "boolean" },
        "kbId":     { "type": "string", "description": "Truncated; never the full id." },
        "region":   { "type": "string" },
        "baseUrl":  { "type": "string" },
        "resources":{ "type": "integer" },
        "generativeModel": { "type": "string" },
        "lastCheckedISO":  { "type": "string", "format": "date-time" },
        "latencyMs":{ "type": "number" }
      }
    },
    "branding": { "$ref": "#/components/schemas/Branding" },
    "features": {
      "type": "object",
      "properties": {
        "apiKeysConfigured": { "type": "boolean" },
        "adminTokenConfigured": { "type": "boolean" },
        "uploadsEnabled": { "type": "boolean" },
        "sharingEnabled": { "type": "boolean" },
        "sampleDataAvailable": { "type": "boolean" }
      }
    },
    "limits": {
      "type": "object",
      "properties": {
        "maxUploadBytes": { "type": "integer" },
        "rateLimitPerMinute": { "type": "integer" },
        "exportMaxRows": { "type": "integer" },
        "cacheTtlMs": { "type": "integer" }
      }
    }
  }
}
```
```
operationId: updateSettings
PATCH /api/v1/settings             auth: admin      tags: [Settings]
requestBody: UpdateSettingsRequest — the runtime-overridable subset only:
  { "branding": { partial Branding }, "features": { "uploadsEnabled": bool, "sharingEnabled": bool } }
responses: 200 -> SettingsView; 400; 403; standardResponses
description: Overrides are held in DATA_DIR/settings.json and take precedence over BRAND_* for the
             running process only. A restart without the file returns to the environment values.
             The response documents which values are environment-pinned (`pinned: string[]`).
```

**6. Usage (non-admin subset)**

```
operationId: getUsage
GET /api/v1/usage                  auth: api        tags: [Analytics]
```
```jsonc
// 200 -> UsageSummary — the counters a product user may legitimately see. No route breakdown,
//        no token costs, no error details (those stay on /api/v1/admin/usage).
{
  "type": "object",
  "required": ["window", "calls", "asks", "uploads"],
  "properties": {
    "window":   { "type": "string", "enum": ["process"], "description": "Counters are per-process." },
    "uptimeSec":{ "type": "number" },
    "calls":    { "type": "integer", "description": "Calls currently in the Knowledge Box." },
    "analysed": { "type": "integer" },
    "asks":     { "type": "integer" },
    "uploads":  { "type": "integer" },
    "exports":  { "type": "integer" },
    "storageBytes": { "type": "integer" },
    "byDay":    { "type": "array", "items": { "$ref": "#/components/schemas/Datum" } }
  }
}
```

**7. Taxonomy (read) and labelset writes**

```
operationId: getTaxonomy
GET /api/v1/taxonomy               auth: api        tags: [Analytics]
summary: Labelsets, agent definitions and provisioning state in one read
```
```jsonc
// 200 -> TaxonomyView
{
  "type": "object",
  "required": ["labelsets", "agents", "provisioning"],
  "properties": {
    "labelsets": { "type": "array", "items": { "$ref": "#/components/schemas/LabelsetDetail" } },
    "agents":    { "type": "array", "items": { "$ref": "#/components/schemas/AgentStatus" } },
    "provisioning": {
      "type": "object",
      "required": ["state"],
      "properties": {
        "state":   { "type": "string", "enum": ["provisioned","partial","absent","running","failed"] },
        "jobId":   { "type": "string" },
        "lastRunISO": { "type": "string", "format": "date-time" },
        "missingLabelsets": { "type": "array", "items": { "type": "string" } },
        "missingAgents":    { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
// components/schemas/LabelsetDetail — LabelsetView plus the per-label definition and usage count
{
  "allOf": [
    { "$ref": "#/components/schemas/LabelsetView" },
    { "type": "object",
      "properties": {
        "editable": { "type": "boolean", "description": "False for labelsets ARAG created implicitly." },
        "source":   { "type": "string", "enum": ["taxonomy","knowledge-box"] },
        "definitions": {
          "type": "array",
          "items": { "type": "object",
            "required": ["label"],
            "properties": {
              "label": { "type": "string" },
              "description": { "type": "string" },
              "examples": { "type": "array", "items": { "type": "string" } },
              "calls": { "type": "integer", "description": "Calls currently carrying this label." }
            } } } } } ]
}
```
```
operationId: putLabelsetDef
PUT /api/v1/labelsets/{id}         auth: write      tags: [Analytics]
parameters: id (path, string, pattern ^[a-z0-9_]{1,64}$)
requestBody: LabelsetWrite
  { "title": string (1..120, required), "color": string (hex, optional),
    "multiple": boolean (default false),
    "kind": string enum ["RESOURCES","PARAGRAPHS"] (required),
    "labels": [ { "label": string (1..120, required),
                  "description": string (0..500),
                  "examples": [string] (max 10) } ]   (1..64 items, required) }
responses: 200 -> LabelsetDetail; 400; 409 (kind change on a labelset with applied labels); standardResponses
description: Idempotent create-or-replace. Changing a labelset does NOT relabel existing calls;
             the response carries `requiresReprovision: true` and the UI must say so.

operationId: deleteLabelsetDef
DELETE /api/v1/labelsets/{id}      auth: write
parameters: id (path), force (query, boolean, default false)
responses: 204; 409 when the labelset is applied to calls and force is not set (problem detail
           names the call count); standardResponses
```

**8. Onboarding and sample data**

```
operationId: getOnboarding
GET /api/v1/onboarding             auth: api        tags: [Onboarding]
```
```jsonc
// 200 -> OnboardingState
{
  "type": "object",
  "required": ["complete", "steps"],
  "properties": {
    "complete": { "type": "boolean" },
    "mode":     { "type": "string", "enum": ["live","mock"] },
    "callCount":{ "type": "integer" },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["key", "title", "state"],
        "properties": {
          "key":   { "type": "string", "enum": ["connect","taxonomy","calls","analysis"] },
          "title": { "type": "string" },
          "state": { "type": "string", "enum": ["done","current","blocked","pending"] },
          "detail":{ "type": "string" },
          "actionHref": { "type": "string" }
        }
      }
    },
    "sample": {
      "type": "object",
      "properties": {
        "available": { "type": "boolean" },
        "count": { "type": "integer", "description": "24 synthetic calls from lib/domain/scenarios.ts." },
        "seeded": { "type": "boolean" },
        "jobId":  { "type": "string" }
      }
    }
  }
}
```
```
operationId: seedSampleCalls
POST /api/v1/samples               auth: write      tags: [Onboarding]
requestBody (optional): { "count": integer 1..24 (default 24), "provision": boolean (default true) }
responses: 202 -> Job (kind "seed-samples"); 409 when a seed job is already running;
           422 when the Knowledge Box already holds calls with the sample slugs (detail says so);
           standardResponses
description: Uploads the synthetic scenarios in lib/domain/scenarios.ts, provisions the labelsets and
             starts the agents. Stages: provision -> upload -> process -> augment -> verify, each
             visible on GET /api/v1/jobs/{id}/events.
```

**9. Job cancellation**

```
operationId: cancelJob
POST /api/v1/jobs/{id}/cancel      auth: admin      tags: [Jobs]
parameters: id (path, string, maxLength 64)
responses: 200 -> Job; 404; 409 when the job already finished; standardResponses
```

**10. API keys (placeholder implementation)**

```
operationId: listApiKeys
GET /api/v1/admin/api-keys         auth: admin      tags: [Admin]
// 200 -> { "items": [ApiKeyView], "managed": boolean }
// `managed:false` means keys come from the API_KEYS environment variable and are read-only here;
// the UI then shows the list disabled with the reason. `managed:true` means DATA_DIR-backed.

// components/schemas/ApiKeyView
{
  "type": "object",
  "required": ["id", "label", "createdAt", "source"],
  "properties": {
    "id":        { "type": "string" },
    "label":     { "type": "string", "maxLength": 120 },
    "hint":      { "type": "string", "description": "Last 4 characters only. The full key is never returned after creation." },
    "createdAt": { "type": "string", "format": "date-time" },
    "lastUsedAt":{ "type": "string", "format": "date-time", "nullable": true },
    "expiresAt": { "type": "string", "format": "date-time", "nullable": true },
    "source":    { "type": "string", "enum": ["env", "store"] },
    "revokedAt": { "type": "string", "format": "date-time", "nullable": true }
  }
}

operationId: createApiKey
POST /api/v1/admin/api-keys        auth: admin
requestBody: { "label": string (1..120, required), "expiresInDays": integer 1..365 (optional) }
// 201 -> { "key": ApiKeyView, "secret": string }   secret returned exactly once, never logged
responses: 201; 400; 409 when managed:false; standardResponses

operationId: revokeApiKey
DELETE /api/v1/admin/api-keys/{id} auth: admin
responses: 204; 404; 409 when managed:false; standardResponses
```

**11. Saved views (P2, specify now so the table's URL contract does not change later)**

```
operationId: listSavedViews    GET    /api/v1/views          auth: api
operationId: createSavedView   POST   /api/v1/views          auth: write
operationId: deleteSavedView   DELETE /api/v1/views/{id}     auth: write
// SavedView: { id, name (1..80), filter: CallFilter, sort, order, columns: string[], createdAt }
```

### 2.4 URL state contract for `/calls`

Every filter is in the query string, so a view is shareable and back-navigable. The table reads and writes exactly these keys, one-to-one with the API params: `mode` (`table`|`browse`), `q`, `label` (repeated), `sentiment`, `agent`, `queue`, `media_type`, `lifecycle`, `from`, `to`, `duration_min`, `duration_max`, `sort`, `order`, `page`, `page_size`. Row selection is **not** in the URL. `mode` defaults from `localStorage`, and an explicit `?mode=` always wins.

---

## 3. Screens and wireframes

All wireframes are drawn at **1440 px**. The frame is 118 characters wide; one character is roughly 12 px. Regions are lettered and annotated beneath each frame.

### 3.0 Grid and shell geometry

| Region | Width | Notes |
|---|---|---|
| Progress band | full bleed, 44 px tall | `--arag-ink-950`. Hidden entirely when `poweredBy` is false. |
| Sidebar | 248 px expanded, 64 px rail | Border-right 1 px `--arag-border`. Sticky, full height, own scroll. |
| Content gutter | 24 px each side | |
| Content column | `min(1440px, 100vw) - 248 - 48` = 1144 px at 1440 | Max content width 1280 px, centred if the viewport is wider. |
| Right inspector | 400 px | Pushes content on `>= 1440 px`, overlays as a drawer below that. |
| Page header | 64 px | Title, breadcrumb, primary action. Sticky under the band. |
| Toolbar / filter bar | 52 px | Sticky beneath the page header on list screens. |

Breakpoints: `>=1440` full (sidebar + inspector side-by-side); `1024–1439` sidebar + inspector as overlay drawer; `768–1023` sidebar collapses to the 64 px rail, inspector is a drawer; `<768` sidebar becomes a top bar with a left drawer, tables switch to the stacked card list described in §4.2.

---

### 3.1 App shell

```
+======================================================================================================================+
| (A) [PROGRESS AGENTIC RAG wordmark, arag-logo-alt.svg, h=18]        Sample data   How this works   Admin   Docs      |
+=====================+================================================================================================+
| (B) SIDEBAR 248     | (C) PAGE HEADER                                                                                |
|  [Call Analysis   ] |  Calls                                                              [ Upload a call ]          |
|  [ wordmark/logo  ] |  Home / Calls                                                                                  |
|  Contact centre int |                                                                                                |
|  ------------------ +------------------------------------------------------------------------------------------------+
|  <ic> Dashboard     | (D) CONTENT                                                                                    |
|  <ic> Calls       * |                                                                                                |
|  <ic> Upload        |                                                                                                |
|  <ic> Agents & Taxo |                                                                                                |
|  <ic> Settings      |                                                                                                |
|  ------------------ |                                                                                                |
|  OPERATIONS         |                                                                                                |
|  <ic> Admin         |                                                                                                |
|  ------------------ |                                                                                                |
|                     |                                                                                                |
|  (E) [!] 2 jobs run |                                                                                                |
|      Mock data      |                                                                                                |
|  ------------------ |                                                                                                |
|  (F) [<] Collapse   |                                                                                                |
+=====================+================================================================================================+
| (G) Synthetic demo data - no real customer or call information.     v0.1.0   API   Built on Progress Agentic RAG     |
+======================================================================================================================+
```

- **(A) Progress band** — `--arag-ink-950`, 44 px. Left: `arag-logo-alt.svg` at `height:18px;width:auto` (the official dark-surface wordmark; the mark glyph inside it is `#5ce500` and must not be recoloured). Right, in order: a "Sample data" pill (only when the box holds only seeded scenarios — `--pg-green` fill, `--arag-ink-950` text), "How this works" (the existing `HowThisWorks` reveal, unchanged behaviour), "Admin", "Docs". The whole band is removed when `branding.poweredBy` is false; "How this works" then moves into (C).
- **(B) Sidebar** — top block is the product identity: `branding.logoUrl` if set, otherwise `arag-logo.svg` at `height:20px` above the product name in `t-title`, with `branding.tagline` in `t-caption` `--arag-text-subtle`. Nav items are 36 px tall, 20 px icon + label, 8 px radius. Active item: `--arag-brand-50` background, `--arag-brand-600` text, and a 3 px left bar in `--arag-brand-600`. The `OPERATIONS` group only renders when an admin session cookie is present or `ADMIN_TOKEN` is unset.
- **(E) Status foot** — a live strip: running job count (links to `/upload/history` or `/admin/jobs`), and the connection mode chip (`Live` / `Mock data`). Polls `GET /api/v1/settings` every 30 s and the job count from the SSE stream when a job is in flight.
- **(F) Collapse** — persists to `localStorage` `ca.nav.collapsed`. Collapsed, the sidebar is 64 px, shows `arag-mark.svg` (the green mark glyph cropped from the wordmark) and icon-only nav with `title` + `aria-label`.
- **(G) Footer** — `branding.footerText`, version, API link, and the powered-by credit with `arag-logo.svg` at `height:14px` `opacity:.75`.

Below 768 px, (A) and (B) collapse into a 56 px top bar: menu button, wordmark, page title, overflow kebab. The sidebar becomes a left drawer with a solid background and a backdrop.

---

### 3.2 Dashboard — `/`

```
+=====================+================================================================================================+
| SIDEBAR             | Dashboard                                        [ Last 30 days v ] [ All queues v ] [Export] |
|                     | Home                                                                                           |
|                     +------------------------------------------------------------------------------------------------+
|                     | (A) STAT STRIP                                                                                 |
|                     | +--------------+--------------+--------------+--------------+--------------+--------------+    |
|                     | | CALLS        | FIRST-CALL   | COMPLAINT    | CROSS-SELL   | AVG          | AVG          |    |
|                     | | 24           | RESOLUTION   | RATE         | ACCEPTED     | COMPLIANCE   | CSAT         |    |
|                     | | 24 analysed  | 58%          | 25%          | 17%          | 82           | 3.6/5        |    |
|                     | |              | +4 pts       | -2 pts       | 33% offered  | /100         |              |    |
|                     | +--------------+--------------+--------------+--------------+--------------+--------------+    |
|                     |   each tile is a link into /calls with the matching facet pre-applied                          |
|                     +------------------------------------------------------------------------------------------------+
|                     | (B) CHARTS                                                                                     |
|                     | +---------------------------------------+ +--------------------------------------------------+ |
|                     | | Reason for contact          24 calls  | | Sentiment                            24 calls    | |
|                     | | Claims           ############# 6      | | Positive  ########## 9                           | |
|                     | | Billing          ########## 5         | | Neutral   ######## 7                             | |
|                     | | Benefits         ####### 4            | | Negative  ###### 5                               | |
|                     | | Enrollment       ##### 3              | | Mixed     ### 3                                  | |
|                     | | ...                    [ See all > ]  | |                          [ See all > ]           | |
|                     | +---------------------------------------+ +--------------------------------------------------+ |
|                     | +---------------------------------------+ +--------------------------------------------------+ |
|                     | | Outcome                               | | Complaints by category                           | |
|                     | +---------------------------------------+ +--------------------------------------------------+ |
|                     +------------------------------------------------------------------------------------------------+
|                     | (C) BY AGENT                                                     [ Agents | Queues ]  [ > ]    |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | | AGENT           CALLS   FCR^    COMPLAINT   ESCALATION   CSAT    COMPLIANCE               | |
|                     | | Maria Gonzales      6    67%          17%           0%    3.8           88               | |
|                     | | David Okafor        5    40%          40%          20%    3.1           74               | |
|                     | | ...                                                                                       | |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     +------------------------------------------------------------------------------------------------+
|                     | (D) RECENT CALLS                                                            [ View all > ]     |
|                     | +-----------+ +-----------+ +-----------+ +-----------+                                        |
|                     | | moment map| | moment map| | moment map| | moment map|                                        |
|                     | | Billing.. | | Prior au..| | Claims d..| | Retention |                                        |
|                     | | [Negative]| | [Neutral] | | [Mixed]   | | [Positive]|                                        |
|                     | +-----------+ +-----------+ +-----------+ +-----------+                                        |
|                     +------------------------------------------------------------------------------------------------+
|                     | Fed by GET /api/v1/dashboard                                                                   |
+=====================+================================================================================================+
```

- **Header controls** — date range (`Last 7 days` / `Last 30 days` / `Last 90 days` / `All time` / `Custom…`) and a queue filter. Both write `from`/`to`/`queue` to the URL and to `GET /api/v1/dashboard`. **Export** opens the export dialog with the dashboard's current filter pre-loaded.
- **(A) Stat strip** — the `.arag-stat-strip` component (§7). Six tiles, equal width, one border, no internal shadows. A delta line appears only when the selected range has a comparable preceding range; never invent a delta for "All time".
- **(B) Charts** — horizontal bar lists, not pie charts. Bars use `--arag-brand-600` at 100 % for the largest and 55 % opacity below it; sentiment uses the semantic mapping in §6.4. Every bar is a link with the drill-through facet. Max 6 rows + "See all" which opens the full breakdown in the right inspector.
- **(C) By agent / by queue** — a sortable table using the data-table component at **compact** density. It is the answer to "who is driving this", the single biggest thing missing from today's dashboard.
- **(D) Recent calls** — the existing `CallCard` grid, four across, unchanged visual language.
- Below the fold, a one-line meta: `Fed by GET /api/v1/dashboard` in `t-caption` `--arag-text-subtle`. Every screen carries this line; it is how the API-first claim becomes visible.

---

### 3.3 Calls — Table mode — `/calls?mode=table`

```
+=====================+================================================================================================+
| SIDEBAR             | Calls                                        [ Table | Browse ]         [ Upload a call ]     |
|                     | Home / Calls                                                                                   |
|                     +------------------------------------------------------------------------------------------------+
|                     | (A) FILTER BAR                                                                                 |
|                     | [ Q Search transcripts...            ] [Reason v][Outcome v][Sentiment v][Agent v][More v]     |
|                     | (B) [Sentiment: Negative x] [Reason: Billing x] [Date: last 30 days x]    Clear all   24 calls |
|                     +------------------------------------------------------------------------------------------------+
|                     | (C) BULK BAR  (appears only when rows are selected, replaces the row of column headers)         |
|                     | [x] 3 selected   Select all 24 matching     [Export] [Re-run analysis] [Add label v] [Delete]  |
|                     +------------------------------------------------------------------------------------------------+
|                     | (D) DATA TABLE                                          [ Density: comfortable | compact ] [::] |
|                     | +--+-------------------------------+--------+------+--------+---------+--------+-------+------+ |
|                     | |[]| CALL                          | DATE v | DUR  | AGENT  | REASON  | OUTCOME|SENTI- |STATUS| |
|                     | |  |                               |        |      | /QUEUE |         |        |MENT   |      | |
|                     | +--+-------------------------------+--------+------+--------+---------+--------+-------+------+ |
|                     | |[]| <au> Billing complaint -      | 2 Jun  | 4:12 | Maria  | Billing |Resolved|[Neg]  |[ok]  | |
|                     | |  |      double-charged premium   | 15:12  |      | Billing|         |        |       |      | |
|                     | |  |      [Complaint Raised]       |        |      |        |         |        |       |  [:] | |
|                     | +--+-------------------------------+--------+------+--------+---------+--------+-------+------+ |
|                     | |[]| <vi> Prior authorisation -    | 2 Jun  | 6:40 | David  | Prior   |Follow- |[Neu]  |[ok]  | |
|                     | |  |      imaging request          | 16:03  |      | Clinical| auth   |up req  |       |  [:] | |
|                     | +--+-------------------------------+--------+------+--------+---------+--------+-------+------+ |
|                     | |[]| <tx> Retention - member       | 3 Jun  | 8:02 | Aisha  | Cancel- |Resolved|[Pos]  |[..]  | |
|                     | |  |      shopping competitors     | 09:41  |      | Reten. | lation  |        |       |Label-| |
|                     | |  |                               |        |      |        |         |        |       |ling  | |
|                     | +--+-------------------------------+--------+------+--------+---------+--------+-------+------+ |
|                     | ...                                                                                            |
|                     +------------------------------------------------------------------------------------------------+
|                     | (E) Rows per page [25 v]     1-25 of 24        [ < Previous ]  1  2  [ Next > ]                |
|                     | Fed by GET /api/v1/calls                                                                       |
+=====================+================================================================================================+
```

- **(A) Filter bar** — a single 52 px row. Search input (36 px, leading search icon, 320 px, debounced 250 ms). Then facet dropdowns: Reason, Outcome, Sentiment, Agent, and **More** which opens a popover carrying Queue, Line of business, Disposition flags, Media type, Status, Date range and Duration range. Each dropdown is a multi-select checkbox list showing the facet count from `CallPage.facets`, with a text filter when the list exceeds 10 options.
- **(B) Applied chips** — one chip per active filter with an `x`, plus **Clear all** and the live result count. This row only renders when at least one filter is active.
- **(C) Bulk bar** — replaces the header row in place (no layout shift) when any row is selected. "Select all N matching" promotes the selection from ids to a `filter`, which is what the bulk and export endpoints take. Delete asks for confirmation in a modal that names the count and requires typing nothing — a single explicit "Delete 3 calls" button, `.arag-btn.danger`.
- **(D) Table** — columns, in order:

| Column | Width | Sort key | Content |
|---|---|---|---|
| select | 40 | — | Checkbox. Header checkbox selects the visible page. |
| Call | flex, min 280 | `title` | Media-type icon, title (2-line clamp), and up to two disposition-flag chips on a second line. Whole cell is the link to `/calls/{id}`. |
| Date | 104 | `created` | Date on line 1, time on line 2, `t-caption`. Default sort, descending. |
| Duration | 72 | `duration` | `m:ss`, tabular-nums, right-aligned. |
| Agent / Queue | 120 | `agent` | Agent on line 1, queue on line 2 in `t-caption`. |
| Reason | 132 | — | Chip. |
| Outcome | 120 | — | Chip. |
| Sentiment | 96 | `sentiment` | Chip, semantic colour. |
| Status | 104 | `status` | Lifecycle chip (§4.1). |
| kebab | 44 | — | Row actions: Open, Open in inspector, Ask a question, Export, Re-run analysis, Copy share link, Delete. |

  Column visibility is controlled by the `[::]` columns button; the choice persists to `localStorage` `ca.calls.columns`. Header cells are sticky at the top of the scroll container and gain `--arag-shadow` only once scrolled.
- **Row click** opens `/calls/{id}`. **Row middle-click / cmd-click** opens in a new tab. The **kebab → Open in inspector** opens the 400 px right drawer with the call summary, moments track, analysis highlights and an **Open workspace** button — so a reviewer can triage a queue without losing the filter set.
- **(E) Pagination** — `.arag-pagination` (§7). Page size 25 / 50 / 100. The count reads `1-25 of 24` in full, never just a page number.

---

### 3.4 Calls — Browse mode — `/calls?mode=browse`

```
+=====================+================================================================================================+
| SIDEBAR             | Calls                                        [ Table | Browse ]         [ Upload a call ]     |
|                     | Home / Calls                                                                                   |
|                     +------------------------------------------------------------------------------------------------+
|                     | [ Q Search transcripts...            ]  Searching switches to Table mode automatically         |
|                     +------------------------------------------------------------------------------------------------+
|                     | Negative sentiment  [5]                                                        [ See all > ]    |
|                     | +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ --->        |
|                     | | moment map| | moment map| | moment map| | moment map| | moment map| | moment map|            |
|                     | | Billing.. | | Claims d..| | Pharmacy..| | Portal a..| | Prior au..| | Enrolme...|            |
|                     | | [Negative]| | [Negative]| | [Negative]| | [Negative]| | [Negative]| | [Negative]|            |
|                     | | Billing   | | Claims    | | Pharmacy  | | Tech      | | Clinical  | | Enrolment |            |
|                     | +-----------+ +-----------+ +-----------+ +-----------+ +-----------+ +-----------+            |
|                     +------------------------------------------------------------------------------------------------+
|                     | Claims  [6]                                                                    [ See all > ]    |
|                     | +-----------+ +-----------+ +-----------+ ...                                                   |
|                     +------------------------------------------------------------------------------------------------+
|                     | Complaint raised  [6]                                                          [ See all > ]    |
|                     | +-----------+ +-----------+ +-----------+ ...                                                   |
|                     +------------------------------------------------------------------------------------------------+
|                     | Compliance risk  [3]                                                           [ See all > ]    |
|                     +------------------------------------------------------------------------------------------------+
|                     | Fed by GET /api/v1/dashboard and GET /api/v1/calls                                             |
+=====================+================================================================================================+
```

- Browse mode is **discovery**, Table mode is **work**. Keep the existing rails, but extend the rail set from three to five: the top sentiment, the top two reasons, `disposition_flags/Complaint Raised` and `disposition_flags/Compliance Risk` — the two flags a QA lead comes for.
- Each rail: heading with a live count chip, horizontal scroll, 8 cards loaded, "See all" links into Table mode with the facet applied. Keyboard: left/right arrows scroll the focused rail by one card.
- Typing into the search box switches to Table mode, because searching implies a result set, not a browse.

---

### 3.5 Call workspace — `/calls/[id]`

```
+=====================+================================================================================================+
| SIDEBAR             | Billing complaint - double-charged premium                     [Ask] [Share] [Export] [ : ]   |
|                     | Home / Calls / Billing complaint - double-charged premium                                       |
|                     | 2 Jun 2026, 15:12  ·  4:12  ·  Maria Gonzales (Billing)  ·  IFP-558201  ·  <au> Audio  [Analysed]|
|                     | [Billing & Payments] [Resolved] [Negative] [Individual & Family] [Complaint Raised]             |
|                     +--------------------------------------------------+---------------------------------------------+
|                     | (A) PLAYER                                       | (D) INSPECTOR  [ Analysis | Ask | Details ]|
|                     | +----------------------------------------------+ | +-----------------------------------------+ |
|                     | | [>]  01:14 ---------O------------------ 04:12| | | ASK THIS CALL                           | |
|                     | |      [<<15] [>>15]  1.0x  [vol]   [ CC ]     | | | Answers come only from this transcript. | |
|                     | +----------------------------------------------+ | |                                         | |
|                     | (B) MOMENTS TRACK                                | | |  You                                    | |
|                     | +----------------------------------------------+ | |  Was the member satisfied?              | |
|                     | ||||  ##  |||  ####  ||  ###   |||||   ##   || | | |                                         | |
|                     | | ^greet ^complaint ^empathy ^x-sell ^resolution| | |  Answer                                 | |
|                     | | hover shows the label + timestamp            | | |  The member was not satisfied. They     | |
|                     | +----------------------------------------------+ | |  reported a duplicate premium charge[1] | |
|                     | (C) TRANSCRIPT                                   | | |  and declined the supplemental offer[2].| |
|                     | +----------------------------------------------+ | |                                         | |
|                     | | [ Q Search transcript ] [Moments v] 18 blocks| | |  [High confidence]  [1] 00:41  [2] 02:18| |
|                     | +----------------------------------------------+ | |                                         | |
|                     | | 00:00 [Greeting & Verification]              | | |  +-----------------------------------+  | |
|                     | | Agent: Thank you for calling Meridian...     | | |  | Ask about this call...      [Ask] |  | |
|                     | |                                              | | |  +-----------------------------------+  | |
|                     | | 00:41 [Complaint] [Sensitive / PII]  <- cited| | |  Suggested: Summarise this call ·       | |
|                     | | Member: You charged my card twice for my...  | | |  Was a disclosure given? ·              | |
|                     | | Agent: I completely understand why that is...| | |  What did the agent offer?              | |
|                     | |                                              | | +-----------------------------------------+ |
|                     | | 02:18 [Cross-sell Pitch] [Objection]         | |                                             |
|                     | | Agent: While I have you, you do not...       | |                                             |
|                     | | ...                                          | |                                             |
|                     | +----------------------------------------------+ |                                             |
|                     | Fed by GET /api/v1/calls/{id} · /media · /ask                                                   |
+=====================+================================================================================================+
```

Layout: content splits 60/40 — transcript column 660 px, inspector 400 px, 24 px gap, at 1440 px. Below 1280 px the inspector becomes a right drawer opened by the **Ask** button and the Analysis tab moves above the transcript.

- **Header** — title, then a single metadata line (date, duration, agent **and** queue together, member id, media type) and the lifecycle chip. Labels sit on their own row as chips, each a drill-through into `/calls?label=…`. Actions: **Ask** (focuses the inspector's Ask tab), **Share**, **Export**, and a kebab carrying Re-run analysis, Copy call id, Copy API URL, Delete.
- **(A) Player** — a custom control strip over the native `<audio>`/`<video>` element, never the browser default chrome, so the scrub bar can carry the moments track and the citation markers. Controls: play/pause, elapsed/total, scrub, back 15 s, forward 15 s, speed (0.75/1/1.25/1.5/2), volume, and a CC toggle that syncs transcript auto-scroll. Video renders 16:9 above the strip.
- **(B) Moments track** — a 28 px band directly under the scrub bar, one segment per paragraph, positioned by `startSeconds`/`endSeconds`, coloured by dominant moment (§6.4). Clicking a segment seeks. Hovering shows `label · mm:ss` in a tooltip. Segments with no moment are `--arag-border` at 40 % height. This is the single most product-defining surface on the screen: the "transcript broken into moments" promise made visible against the timeline.
- **(C) Transcript** — the existing block list, retained: per-block timestamp, moment chips that double as filters, speaker-split turns, click-to-seek, active-block highlight following playback, and the citation flash. Add: a sticky mini-header showing the current moment while scrolling, and a **Jump to** control listing every moment in the call.
- **(D) Inspector** — three tabs.
  - **Analysis** (default): executive summary, member intent, key topics, agent scorecard (three meters), complaint panel, cross-sell panel, action items, risk flags, notable quotes. Each quote has a play button that seeks to it when the quote can be matched to a paragraph.
  - **Ask**: the existing chat, restyled to the kit's `.arag-chat`. Answer, then the trust row: confidence badge, then one citation chip per citation reading `[n] mm:ss`. Clicking a chip seeks the player **and** scrolls and flashes the transcript block. Inline markers stay superscript numerals.
  - **Details**: raw record — call id, slug, field id and type, created, duration, media type, ARAG status, all labels, the full flat `call_metrics` as a key-value list, and a **View JSON** disclosure showing the `GET /api/v1/calls/{id}` response.

---

### 3.6 Upload — `/upload`

```
+=====================+================================================================================================+
| SIDEBAR             | Upload a call                                                        [ Ingest history > ]     |
|                     | Home / Upload                                                                                  |
|                     +------------------------------------------------------------------------------------------------+
|                     | (A) STEPPER    (1) Choose a file  ->  (2) Add details  ->  (3) Processing                      |
|                     +--------------------------------------------------+---------------------------------------------+
|                     | (B) DROPZONE                                     | (C) DETAILS                                 |
|                     | +----------------------------------------------+ | Title *                                     |
|                     | |              <upload icon 32>                | | [ Billing complaint - June premium       ]  |
|                     | |    Drop a recording or transcript here       | | Call time                                   |
|                     | |            or  [ Choose a file ]             | | [ 2026-06-02 ] [ 15:12 ]                    |
|                     | |                                              | | Agent name              Queue               |
|                     | |  MP3, MP4, WAV, M4A or .txt  ·  up to 200 MB | | [ Maria Gonzales ]      [ Billing ]         |
|                     | +----------------------------------------------+ | Member reference        Duration (s)        |
|                     |                                                  | [ IFP-558201 ]          [ 252 ]             |
|                     | Selected                                         |                                             |
|                     | +----------------------------------------------+ | [ ] Paste a transcript instead of a file    |
|                     | | <au> call-0001.mp3   3.8 MB          [ x ]   | | +-----------------------------------------+ |
|                     | +----------------------------------------------+ | | Agent: Thank you for calling...         | |
|                     |                                                  | +-----------------------------------------+ |
|                     |                                                  |                                             |
|                     |                                                  | [ Cancel ]                [ Upload call ]   |
|                     +--------------------------------------------------+---------------------------------------------+
|                     | (D) IN PROGRESS  (replaces B and C once submitted)                                             |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | | Billing complaint - June premium                                            00:38 elapsed  | |
|                     | | [#############################-------------------------] 62%                                | |
|                     | | (o) Uploaded                                       1.2 s                                    | |
|                     | | (o) Transcribing the recording                    24.0 s                                    | |
|                     | | (*) Labelling and analysing                       running                                   | |
|                     | | ( ) Verifying the call is searchable              pending                                   | |
|                     | |                                                                     [ Cancel ] [ Open call ] | |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | [ Upload another ]                                                                             |
|                     | Fed by POST /api/v1/calls and GET /api/v1/jobs/{id}/events                                     |
+=====================+================================================================================================+
```

- Drag over anywhere on the page activates the dropzone (`.arag-dropzone.drag`). Multiple files are accepted: each becomes its own row with its own progress, and the details panel applies to all of them with the title defaulting to the filename stem.
- Validation happens before the request: unsupported extension, zero bytes, over `limits.maxUploadBytes`. Each failure is inline on the file row, never a toast.
- **(D)** is driven by `GET /api/v1/jobs/{id}/events` (SSE) with a 3 s polling fallback on `GET /api/v1/jobs/{id}` if the stream errors. Stage labels come from the job's own `message`, so the UI never hard-codes stage names. **Open call** is enabled as soon as the resource id exists, even mid-transcription — the call page then shows the `transcribing` state.

### 3.7 Ingest history — `/upload/history`

```
+=====================+================================================================================================+
| SIDEBAR             | Ingest history                                                        [ Upload a call ]       |
|                     | Home / Upload / History                                                                        |
|                     +------------------------------------------------------------------------------------------------+
|                     | [ All statuses v ] [ All kinds v ] [ Last 7 days v ]                              42 runs      |
|                     +------------------------------------------------------------------------------------------------+
|                     | +------------------------+----------+-------------------+----------+----------+---------------+ |
|                     | | CALL                   | KIND     | STARTED v         | DURATION | STATUS   |               | |
|                     | +------------------------+----------+-------------------+----------+----------+---------------+ |
|                     | | Billing complaint...   | Upload   | 2 Jun, 15:14      |   1m 04s | [Done]   | [View call]:  | |
|                     | | Prior authorisation... | Upload   | 2 Jun, 16:05      |     58 s | [Done]   | [View call]:  | |
|                     | | member-call-9.mp3      | Upload   | 2 Jun, 16:22      |     12 s | [Failed] | [Retry]    :  | |
|                     | | Sample calls (24)      | Sample   | 1 Jun, 09:02      |   4m 11s | [Done]   |            :  | |
|                     | | Re-run: Claims denial  | Reanalyse| 1 Jun, 11:40      |     31 s | [Done]   | [View call]:  | |
|                     | +------------------------+----------+-------------------+----------+----------+---------------+ |
|                     | Rows per page [25 v]     1-25 of 42                      [ < Previous ]  1  2  [ Next > ]      |
|                     | Fed by GET /api/v1/jobs                                                                        |
+=====================+================================================================================================+
```

Clicking a row opens the **job drawer**: the job id, kind, ref, input summary, a stage timeline built from `job.events` with per-stage durations, the error object when failed, and the raw JSON behind a disclosure. Failed uploads offer **Retry**, which re-POSTs the original metadata (the file must be re-selected; the drawer says so plainly).

---

### 3.8 Agents & Taxonomy — `/taxonomy`

```
+=====================+================================================================================================+
| SIDEBAR             | Agents & Taxonomy                                                   [ Re-provision ]          |
|                     | Home / Agents & Taxonomy                                                                       |
|                     | [ Labelsets | Agents | Provisioning ]                                                           |
|                     +------------------------------------------------------------------------------------------------+
|                     | (A) BANNER (only when state != provisioned)                                                    |
|                     | [!] 1 labelset is not applied in the Knowledge Box. Re-provision to apply it. [ Re-provision ] |
|                     +------------------------------------------------------------------------------------------------+
|                     | (B) LABELSETS                                                          [ + New labelset ]     |
|                     | +--------------------+--------+--------+----------+---------+------------------+-------------+ |
|                     | | LABELSET           | LEVEL  | LABELS | APPLIED  | MULTIPLE| STATE            |             | |
|                     | +--------------------+--------+--------+----------+---------+------------------+-------------+ |
|                     | | Call Reason        | Call   |     10 | 24 calls | no      | [Applied]        | [Edit]  :   | |
|                     | | Outcome            | Call   |      5 | 24 calls | no      | [Applied]        | [Edit]  :   | |
|                     | | Sentiment          | Call   |      4 | 24 calls | no      | [Applied]        | [Edit]  :   | |
|                     | | Line of Business   | Call   |      6 | 24 calls | no      | [Applied]        | [Edit]  :   | |
|                     | | Disposition Flags  | Call   |      8 | 19 calls | yes     | [Applied]        | [Edit]  :   | |
|                     | | Call Moment        | Block  |     11 | 412 blks | yes     | [Applied]        | [Edit]  :   | |
|                     | | Product Line       | Call   |      4 | 0 calls  | no      | [Not provisioned]| [Edit]  :   | |
|                     | +--------------------+--------+--------+----------+---------+------------------+-------------+ |
|                     | Fed by GET /api/v1/taxonomy                                                                    |
+=====================+================================================================================================+
```

**Labelset editor** opens in the right inspector (400 px), not a separate page:

```
+---------------------------------------------+
| Edit labelset                          [ x ]|
+---------------------------------------------+
| Identifier   call_reason   (fixed after      |
|              creation)                       |
| Title        [ Call Reason                 ] |
| Level        (o) Whole call  ( ) Transcript  |
|                              block           |
| Selection    (o) One label   ( ) Many labels |
| Colour       [#2563eb] [swatch]              |
+---------------------------------------------+
| LABELS                        [ + Add label ]|
| +-----------------------------------------+  |
| | Claims                             [x]  |  |
| | [ Status, denial, payment, or         ] |  |
| | [ submission of a claim.              ] |  |
| | Applied to 6 calls                      |  |
| +-----------------------------------------+  |
| | Billing & Payments                 [x]  |  |
| | ...                                     |  |
+---------------------------------------------+
| [!] Changing a labelset does not relabel     |
|     existing calls. Re-provision applies it  |
|     to calls ingested from now on; use       |
|     Re-run analysis on a call to apply it    |
|     retrospectively.                         |
+---------------------------------------------+
| [ Cancel ]                          [ Save ] |
+---------------------------------------------+
```

**Agents tab**

```
| +----------------------+----------+-----------------------------------+--------------+------------+ |
| | AGENT                | TYPE     | WHAT IT DOES                      | OPERATIONS   | STATE      | |
| +----------------------+----------+-----------------------------------+--------------+------------+ |
| | resource-labeler     | Labeler  | Classifies each whole call into    | 5 labelsets  | [Running]  | |
| |                      |          | reason, outcome, sentiment, line   |              |            | |
| |                      |          | of business and disposition flags. |              |            | |
| | paragraph-labeler    | Labeler  | Tags transcript blocks with call   | 1 labelset   | [Completed]| |
| |                      |          | moments.                          |              |            | |
| | call-insights        | Ask      | Writes call_analysis (narrative)   | 2 operations | [Completed]| |
| |                      |          | and call_metrics (flat JSON).      |              |            | |
| +----------------------+----------+-----------------------------------+--------------+------------+ |
```

Row click opens the agent in the inspector: its full description, the operations it runs, the destination fields it writes, the generative model in use, the ARAG task id, and a **View parameters** JSON disclosure. Read-only in the product; the write path is `/admin/taxonomy`.

**Provisioning tab** — a table of `provision` jobs with the stage timeline, plus a **Re-provision** action with a confirmation modal that spells out exactly what happens: existing tasks are deleted, labelsets are re-created, and the three agents are started sequentially because ARAG allows one running task per operation type.

---

### 3.9 Settings

All four tabs share the same page shell; the tab strip sits under the page header. Each tab's content column is capped at 720 px — settings are forms, not dashboards.

**`/settings/connection`**

```
|                     | Settings                                                                                       |
|                     | Home / Settings                                                                                |
|                     | [ Connection | Branding | Usage | API keys | About ]                                            |
|                     +------------------------------------------------------------------------------------------------+
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | | Knowledge Box                                                        [ Test connection ]   | |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | | Status            (o) Connected  ·  118 ms  ·  checked 12 s ago                            | |
|                     | | Mode              Live                                                                     | |
|                     | | Knowledge Box     f3a1...c92e                                                              | |
|                     | | Region            europe-1                                                                 | |
|                     | | Base URL          https://europe-1.arag.cloud                                              | |
|                     | | Resources         24                                                                       | |
|                     | | Generative model  chatgpt-azure-4o                                                         | |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | | Credentials are read from the environment (ARAG_KB_ID, ARAG_API_KEY, ARAG_REGION) and are  | |
|                     | | never shown here. Change them where the service is deployed, then restart.                 | |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | | Limits                                                                                     | |
|                     | | Maximum upload          200 MB          Rate limit         120 requests / minute           | |
|                     | | Export row limit        1000            Cache lifetime     60 s                            | |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | Fed by GET /api/v1/settings                                                                    |
```

**`/settings/branding`**

```
|                     | +----------------------------------------+ +-----------------------------------------------+ |
|                     | | Identity                               | | PREVIEW                                       | |
|                     | | Product name  [ Call Analysis        ] | | +-------------------------------------------+ | |
|                     | | Tagline       [ Contact centre intel ] | | | [PROGRESS AGENTIC RAG]        How it works| | |
|                     | | Logo URL      [                      ] | | +----------+--------------------------------+ | |
|                     | |               Leave empty to use the   | | | Call     | Dashboard                      | | |
|                     | |               Progress wordmark.       | | | Analysis | +------+ +------+ +------+     | | |
|                     | | Primary       [#2b2bb2] [swatch]       | | |          | | 24   | | 58%  | | 25%  |     | | |
|                     | | Accent        [#00b563] [swatch]       | | | Dashboard| +------+ +------+ +------+     | | |
|                     | | Show "Built on Progress Agentic RAG"   | | | Calls    | [ Primary ] [ Secondary ]      | | |
|                     | |               [ on |  ]                | | | Upload   |                                | | |
|                     | | Footer text   [ Synthetic demo data  ] | | +----------+--------------------------------+ | |
|                     | | Docs URL      [ /api/v1/docs         ] | | Live preview of the real shell, not a mock.   | |
|                     | | Support URL   [                      ] | | +-------------------------------------------+ | |
|                     | +----------------------------------------+ | | [!] Accent contrast on white: 2.7:1       | | |
|                     | | [ Reset to defaults ]  [ Apply ]       | | |     Fills only, not text. Text uses the   | |
|                     | +----------------------------------------+ | |     darkened accent automatically.        | | |
|                     |                                            | +-------------------------------------------+ | |
|                     | +--------------------------------------------------------------------------------------------+ |
|                     | | Environment block                                                          [ Copy ]         | |
|                     | | BRAND_PRODUCT_NAME="Call Analysis"                                                         | |
|                     | | BRAND_TAGLINE="Contact centre intelligence"                                                | |
|                     | | BRAND_PRIMARY_COLOR="#2b2bb2"   BRAND_ACCENT_COLOR="#00b563"   BRAND_POWERED_BY=1          | |
|                     | +--------------------------------------------------------------------------------------------+ |
```

The preview is the actual shell rendered in an inert container with the candidate tokens applied — never a hand-drawn mock, which would drift. **Apply** calls `PATCH /api/v1/settings` (admin only); a non-admin sees the form read-only with an explanation and the copyable env block, which is still genuinely useful.

**`/settings/usage`** — a stat strip (Calls in the box, Analysed, Questions asked, Uploads, Exports, Storage), a 30-day sparkline column chart from `UsageSummary.byDay`, and a plain note that counters are per-process and reset on restart. A link to `/admin/usage` for the full operator view.

**`/settings/api-keys`** — the table below. When `managed:false`, the whole table renders disabled with a banner: "Keys are supplied by the `API_KEYS` environment variable and cannot be managed here."

```
| +----------------------+--------+---------------+---------------+----------+--------------------+ |
| | LABEL                | KEY    | CREATED       | LAST USED     | EXPIRES  |                    | |
| +----------------------+--------+---------------+---------------+----------+--------------------+ |
| | CRM integration      | ...8f2a| 12 May 2026   | 2 min ago     | never    | [ Revoke ]         | |
| | Reporting export     | ...0c11| 3 Jun 2026    | never         | 3 Sep    | [ Revoke ]         | |
| +----------------------+--------+---------------+---------------+----------+--------------------+ |
```

Creating a key opens a modal; on success the secret is shown once inside a `.arag-alert.warn` with a copy button and the line "This is the only time the key is shown. Store it now." Closing the modal removes it from the DOM.

**`/settings/about`** — product version, platform version, build, licence (Apache-2.0), links to the API reference, Swagger, the docs index, the repository and the support URL. One card, one key-value list.

---

### 3.10 Onboarding — `/welcome`

Shown automatically on first load when `GET /api/v1/onboarding` returns `complete:false`, and reachable afterwards from Settings → About. Never a modal over a populated app.

```
+======================================================================================================================+
| [PROGRESS AGENTIC RAG]                                                                          How this works       |
+======================================================================================================================+
|                                                                                                                      |
|                         Call Analysis                                                                                |
|                         Know what happened on every call.                                                            |
|                                                                                                                      |
|    +--------------------------------------------------------------------------------------------------------+       |
|    | (o) 1. Connect a Knowledge Box                                                              Done         |       |
|    |        Connected to f3a1...c92e in europe-1.                                        [ Check again ]      |       |
|    +--------------------------------------------------------------------------------------------------------+       |
|    | (*) 2. Add the taxonomy                                                                  In progress     |       |
|    |        6 labelsets and 3 agents. This is the vocabulary every call is labelled against.                  |       |
|    +--------------------------------------------------------------------------------------------------------+       |
|    | ( ) 3. Add some calls                                                                        To do       |       |
|    |        Upload your own recordings, or start with 24 synthetic calls so every screen is populated.        |       |
|    |                                                     [ Try with sample calls ]   [ Upload my own ]        |       |
|    +--------------------------------------------------------------------------------------------------------+       |
|    | ( ) 4. See the analysis                                                                      To do       |       |
|    |        Open a call, read the summary, ask it a question and click the citation.                          |       |
|    +--------------------------------------------------------------------------------------------------------+       |
|                                                                                                                      |
|    No ARAG credentials? Run with ARAG_MOCK=1 and everything above works against an in-process mock.                   |
|                                                                          [ Skip for now ]                            |
+======================================================================================================================+
```

While the sample seed runs, step 3 becomes a live progress card driven by the `seed-samples` job SSE stream with its five stages, and step 4 unlocks the moment the first call reaches `analysed`. **Skip for now** sets `localStorage` `ca.onboarding.skipped` and drops the user on an empty Dashboard whose empty state repeats the two entry points.

---

### 3.11 Shared call — `/share/[token]`

A single-column read-only version of the workspace: the Progress band, no sidebar, the call header without actions, the player, the moments track, the transcript and (when the share allows it) the analysis. No Ask panel, no export, no labels-as-links. A persistent bar states: "Read-only view shared on 2 June 2026. Expires 9 June 2026." Expired or revoked tokens render the 404 screen with no detail.

---

### 3.12 Admin — the operator product

Same shell, same sidebar, with the admin section expanded and a breadcrumb rooted at `Admin`. Signed-out admin routes render the sign-in card, not a bare error.

**`/admin` Overview**

```
|                     | Operations                                                       [ Re-provision ] [ Refresh ] |
|                     | Home / Admin                                                                                   |
|                     +------------------------------------------------------------------------------------------------+
|                     | +-------------+-------------+-------------+-------------+-------------+-------------+          |
|                     | | CONNECTION  | CALLS       | JOBS        | AGENTS      | REQUESTS    | ERRORS      |          |
|                     | | (o) OK      | 24          | 1 running   | 3 / 3       | 4,182       | 7           |          |
|                     | | 118 ms      | 24 analysed | 0 failed    | provisioned | uptime 4 h  | 0.17%       |          |
|                     | +-------------+-------------+-------------+-------------+-------------+-------------+          |
|                     +--------------------------------------------------+---------------------------------------------+
|                     | Recent jobs                       [ All jobs > ] | Recent errors            [ All logs > ]    |
|                     | +----------------------------------------------+ | +-----------------------------------------+ |
|                     | | ingest-call   Billing compl..  Done    1m04s | | | 15:22 warn  calls.summary.failed        | |
|                     | | provision     Taxonomy         Done    4m11s | | | 14:58 error arag.timeout /find          | |
|                     | +----------------------------------------------+ | +-----------------------------------------+ |
|                     +--------------------------------------------------+---------------------------------------------+
|                     | Cache: 48 entries · 91% hit rate · TTL 60 s                        [ Invalidate cache ]        |
```

**`/admin/connection`** — tabs `Health | Config`. Health: the connection card from §3.9 plus a **Run connection test** that performs a real round trip and shows the timing breakdown per ARAG call. Config: the effective environment as a filterable key-value table with every secret rendered as `configured` / `not configured`, never a masked value that hints at length, plus the raw redacted JSON behind a disclosure.

**`/admin/taxonomy`** — the read surfaces from §3.8 plus the write actions: create/edit/delete a labelset, **Re-provision** (with the destructive confirmation), and **Reset agents** (deletes all tasks, then re-creates). Destructive actions require a confirmation modal naming the object and the consequence.

**`/admin/jobs`**

```
|                     | Jobs                                                                        [ Refresh 5s ]    |
|                     | [ All kinds v ] [ All statuses v ] [ Last 24 hours v ]                             42 jobs     |
|                     | +------------+------------------+------------+---------+----------+----------+---------------+ |
|                     | | ID         | KIND             | REF        | STARTED | DURATION | STATUS   |               | |
|                     | +------------+------------------+------------+---------+----------+----------+---------------+ |
|                     | | j_8f2ac1   | ingest-call      | c_91ab..   | 15:14   |   1m 04s | [Done]   | [ : ]         | |
|                     | | j_7be019   | seed-samples     |            | 09:02   |   4m 11s | [Done]   | [ : ]         | |
|                     | | j_66d4aa   | reanalyse-call   | c_44cd..   | 11:40   | running  | [Running]| [Cancel] [:]  | |
|                     | | j_5a01ff   | ingest-call      |            | 16:22   |     12 s | [Failed] | [ : ]         | |
|                     | +------------+------------------+------------+---------+----------+----------+---------------+ |
```

Row click opens the **job drawer** with the stage timeline (`job.events` rendered as `.arag-steps`, each with its duration from `durationsMs`), the input, the result or the error object, and the raw JSON. A running job streams its stages live into the open drawer.

**`/admin/logs`** — level filter chips (`debug` `info` `warn` `error`), a contains-search, a limit selector, auto-refresh toggle, **Pause**, and **Copy**. The stream itself is `.arag-log`. Clicking a line expands its structured fields inline.

**`/admin/usage`** — tabs `Counters | Cache`. Counters: request/error/ask/upload/delete totals, a by-route table sorted by volume, ARAG call counts and token counters where available. Cache: statistics, per-namespace entry counts, the key list behind a disclosure, and **Invalidate** with an optional prefix (confirmation names the prefix and the number of keys it will drop).

**`/admin/branding`** — the same editor and live preview as `/settings/branding`, always writable, plus the full `BRAND_*` reference table with each variable's default and effect.

**`/admin/security`** — four cards: **Authentication** (which of `API_KEYS` / `ADMIN_TOKEN` / demo sessions are configured, and exactly what each unlocks); **API keys** (the table from §3.9); **Rate limits** (limit, window, current bucket occupancy); **Data handling** (single-tenant notice, the absence of PII redaction stated plainly, the media proxy explanation, the share-link policy and the retention position). This screen is where the FAQ's honest answers become product surface rather than marketing copy.

---

## 4. State inventory

Every state below must be implemented. A screen is not done until all six of its states render correctly with the network stubbed.

### 4.1 The call lifecycle

| State | Chip | Colour role | What the user sees | What they do next |
|---|---|---|---|---|
| `queued` | `Queued` | `.arag-chip.neutral` | The call exists but ARAG has not started. Transcript and analysis panes show the queued placeholder. | Wait; the page polls the job. Or open the ingest history. |
| `transcribing` | `Transcribing` | `.arag-chip.info`, dot animated | Title, metadata and media are available; the player works if the file is uploaded. Transcript pane shows a progress card with the job's elapsed time. | Wait, or leave and return — the row in `/calls` carries the same chip. |
| `labelling` | `Labelling` | `.arag-chip.info`, dot animated | Transcript is readable and seekable. Labels, moments and analysis are absent; each of those regions shows its own "being generated" placeholder with the agent name responsible. | Read the transcript, or ask a question (Ask works as soon as the transcript is indexed). |
| `analysed` | `Analysed` | `.arag-chip.ok` | Everything present. | Normal work. |
| `partial` | `Partly analysed` | `.arag-chip.warn` | Labels present, narrative or metrics missing or incomplete. The affected panel says which agent did not write back and offers **Re-run analysis**. The call still counts in the list, is excluded from rate denominators, and the dashboard footnote says how many calls are excluded. | Re-run analysis, or check `/admin/taxonomy` for a failed agent. |
| `failed` | `Failed` | `.arag-chip.error` | Ingestion or processing failed. The call page shows the job's error message verbatim under a plain-language line. | Retry from ingest history, re-run analysis, or delete. |

The chip appears in: the calls table Status column, the call workspace header, the recent-calls cards (only when not `analysed`), the ingest history, and the inspector.

### 4.2 Per-screen states

#### Dashboard `/`
| State | Trigger | Render | Next action |
|---|---|---|---|
| Empty | `total === 0` | Full-width empty state: "No calls yet. Add calls and every figure on this page fills in." Two buttons: **Try with sample calls**, **Upload a call**. Charts are not rendered as zeroed skeletons. | Either button. |
| Loading | First paint / range change | Skeleton: six stat tiles, four chart cards, one table, all as `.arag-skeleton` blocks at the final dimensions. No spinner, no "Loading…" text. | — |
| Partial | `withMetrics < total` | Everything renders, plus a footnote under the stat strip: "Rates exclude 3 calls that are still being analysed." with a link to `/calls?lifecycle=labelling`. | Follow the link. |
| Error | `GET /api/v1/dashboard` fails | `.arag-alert.error` in place of the stat strip: "Could not load the dashboard. The Knowledge Box did not respond." with **Try again** and **Open connection settings**. Charts are not rendered. | Retry or check the connection. |
| Permission denied | 401/403 | Sign-in card: "This deployment requires an API key." with a link to `/settings/about` and the docs. Never a bare 403. | Sign in / configure. |

#### Calls `/calls`
| State | Trigger | Render | Next action |
|---|---|---|---|
| Empty (no calls at all) | `total === 0`, no filters | `.arag-empty` with the two onboarding entry points. | Upload or seed samples. |
| Empty (filtered) | `total === 0`, filters active | "No calls match these filters." plus the applied-chip row repeated and **Clear all**. Facet counts still render so the user can see where the calls are. | Clear a filter. |
| Empty (search) | `total === 0`, `q` set | "No call mentions “refund cheque”." plus "Search covers every transcript, not just titles." and **Clear search**. | Change the query. |
| Loading (first) | No data yet | 8 skeleton rows at the exact row height. Filter bar renders immediately and is interactive. | — |
| Loading (refine) | Filter/sort change with data present | Existing rows stay, dimmed to 55 % opacity, with a 2 px indeterminate bar under the filter bar. Never blank the table. | — |
| Partial | Some rows have `lifecycle !== "analysed"` | Those cells show a dash with a title attribute, not zeros or "N/A". Status chip carries the reason. | Open the call. |
| Error | List request fails | `.arag-alert.error` above the table, table retains the last good page beneath it if there was one. **Try again**. | Retry. |
| Permission denied | 403 on bulk/delete | The bulk action is disabled with a tooltip naming the requirement ("Deleting calls needs an API key or the admin token"). Never show an action that will always fail without saying why. | Sign in as admin. |

#### Call workspace `/calls/[id]`
| State | Trigger | Render | Next action |
|---|---|---|---|
| Not found | 404 | The existing not-found card, reworded: "That call is not in this Knowledge Box. It may have been deleted." **Back to all calls**. | Back. |
| Loading | Server render | Skeleton header, player block, 6 transcript blocks, inspector card. | — |
| Media missing | `mediaType === "transcript"` | No player, no moments track; the transcript occupies the full left column and citation clicks scroll only. A one-line note: "Transcript-only call — no recording to play." | Read. |
| Media fails | Media proxy errors | The player is replaced by `.arag-alert.warn`: "The recording could not be loaded. The transcript and analysis are unaffected." with **Try again**. Citations still scroll the transcript. | Retry or continue. |
| Analysis absent | `lifecycle` in `queued/transcribing/labelling` | Analysis tab shows a stage card naming the agent: "The call-insights agent has not written this call's analysis yet." with the elapsed time and **Check again**. | Wait or re-run. |
| Analysis partial | `partial` | Present fields render; each absent block shows a one-line dashed placeholder naming the missing field. A single **Re-run analysis** at the top of the tab. | Re-run. |
| Ask: streaming | Request in flight | The answer bubble streams token by token; no confidence badge, no citation chips while streaming; the send button shows a stop control. | Stop or wait. |
| Ask: decline | `isDeclinedAnswer(text)` | The answer renders with **no** confidence badge and **no** citation chips (already the behaviour; keep it), plus a `.arag-alert` in the bubble: "This call's transcript does not answer that." and two suggested reformulations. | Ask differently. |
| Ask: no citations | Answer returns, zero citations | Confidence badge reads "No grounded citations" in the neutral style. The bubble carries a line: "No transcript passage was cited for this answer." | Treat with suspicion; ask more narrowly. |
| Ask: error | Request fails | Error bubble with the problem `detail`, a **Retry** button that re-sends the same question, and the question preserved in the input. | Retry. |
| Ask: rate limited | 429 | "Too many questions in a short time. Try again in 24 s." with a live countdown on the disabled send button. | Wait. |
| Permission denied | 403 on Share / Re-run / Delete | Those actions render disabled with the requirement in the tooltip. | Sign in. |

#### Upload `/upload`
| State | Render | Next action |
|---|---|---|
| Empty | Dropzone at rest, details form disabled until a file or a pasted transcript exists. | Choose a file. |
| Validating | File row shows a spinner icon and "Checking…" for under a second. | — |
| Invalid file | Row turns to the error style with the exact reason: "call.wav is 240 MB. The limit is 200 MB." plus **Remove**. | Remove or replace. |
| Uploading | Determinate progress from the fetch upload progress, then the job stepper. | Cancel. |
| Processing | The stepper of §3.6, driven by SSE. | Open call, or upload another. |
| Stream lost | SSE errors | The stepper switches to polling and shows a quiet line: "Live updates interrupted — checking every 3 seconds." Never an error dialog; the job is unaffected. | Wait. |
| Failed | Job status `failed` | The failed stage turns red and carries `job.error.message`. **Retry** and **Open ingest history**. | Retry. |
| Permission denied | 403 | The whole form is replaced by a sign-in card: "Uploading calls needs an API key or the admin token." | Sign in. |
| Uploads disabled | `features.uploadsEnabled === false` | Dropzone replaced by a note naming the configuration that disabled it. | Contact the operator. |

#### Agents & Taxonomy `/taxonomy`
| State | Render | Next action |
|---|---|---|
| Empty | No labelsets in the box: "This Knowledge Box has no labelsets. Provision the taxonomy to add the six shipped ones." **Provision**. | Provision. |
| Loading | Skeleton table of 6 rows. | — |
| Partial | `provisioning.state === "partial"` | The banner of §3.8 naming the missing labelsets and agents. | Re-provision. |
| Provisioning running | `state === "running"` | The banner becomes a live progress strip with the job's stage; every write action is disabled with the tooltip "Provisioning is running." | Wait. |
| Error | Taxonomy read fails | `.arag-alert.error` and a **Try again**; the shipped taxonomy definitions still render from `lib/domain/taxonomy.ts` with the state column showing "Unknown". | Retry. |
| Permission denied | Non-admin | Everything renders read-only; **New labelset**, **Edit**, **Delete** and **Re-provision** are disabled with the tooltip "Changing the taxonomy needs the admin token." | Sign in as admin. |

#### Settings
| State | Render |
|---|---|
| Loading | Skeleton key-value rows at the final height. |
| Connection down | The status row shows the error state with the upstream message and the elapsed time; the rest of the card still renders what is configured. |
| Mock mode | A `.arag-alert` at the top of Connection: "Running against the in-process mock. No ARAG credentials are configured." — stated as a fact, not a warning. |
| Read-only (non-admin) | Branding inputs disabled, the env block still copyable, a one-line reason at the top of the card. |
| API keys unmanaged | The keys table disabled with the `API_KEYS` explanation. |
| Save error | `.arag-alert.error` above the form with the problem `detail`; field-level problems are attached to their field. |

#### Admin
| State | Render |
|---|---|
| Signed out | Every admin route renders the sign-in card in the shell (not a redirect), with the destination preserved. |
| Loading | Skeletons matching each panel's final shape; the auto-refresh indicator is a 2 px bar, never a spinner over content. |
| Degraded | Connection fails but counters are local: health card shows the error, usage/jobs/logs/cache still render. The overview strip marks the failing tile only. |
| Error | Per-panel `.arag-alert.error` with the problem `detail` and a panel-level **Try again**. One failing panel never blanks the page. |
| Destructive confirm | Modal naming the object and the exact consequence, primary button labelled with the verb and the count ("Delete 3 calls", "Invalidate 48 keys"), cancel on the left, Escape closes. |

### 4.3 Object state matrix

| Object | Empty | Loading | Partial / degraded | Error | Permission denied |
|---|---|---|---|---|---|
| Call | Not applicable — a call always exists once created | Skeleton at final dimensions | `partial` lifecycle; missing panels named individually | Failed lifecycle with the job error verbatim | Action buttons disabled with the requirement in the tooltip |
| Job | "No jobs yet." with a link to Upload | Skeleton rows | Stage `soft` failure: the stage is amber, the job continues, the drawer explains | Red stage + `job.error.message` + Retry | Job list is public; Cancel is admin-only and disabled otherwise |
| Agent | "No agents configured." + Provision | Skeleton rows | `configured` but never run: amber chip "Configured, not run" | `failed` chip + the task error + Reset agents | Read-only outside admin |
| Labelset | "No labelsets." + Provision | Skeleton rows | In the taxonomy but not in the box: "Not provisioned" chip | Read error keeps the shipped definitions visible, state "Unknown" | Edit/Delete disabled |
| Upload | Dropzone at rest | Determinate bar | Transcription succeeded, augmentation pending: job completes, call lands `labelling` | Named validation or job error inline on the row | Form replaced by sign-in card |
| Answer | Suggested questions, no empty bubble | Streaming text, no badge yet | REMi timed out: the citation-coverage confidence stays; no error shown | Error bubble + Retry with the question preserved | 403 disables the composer with the reason |
| Share link | "No share links for this call." | — | Expiring within 24 h: amber chip "Expires in 6 hours" | Creation error inline in the dialog | Sharing needs write auth; button disabled with the reason |

### 4.4 Rules that apply everywhere

1. **Skeletons, not spinners** for first loads. Spinners only inside a button that is performing a discrete action.
2. **Never blank existing content** on a refine. Dim and overlay a progress bar.
3. **Errors never remove data that is still valid.** A failed dashboard refresh keeps the last good figures with a staleness note.
4. An action that cannot succeed is **disabled with the reason**, never hidden and never allowed to fail.
5. Every error offers a next step: retry, a settings link, or an explanation of who can fix it.
6. Empty states teach: what this screen would show, and the one action that fills it.
7. Auto-refreshing surfaces show **when** they last refreshed, in relative time.

---

## 5. Copy guidelines

### 5.1 Voice

Plain, specific, British. Say what happened and what to do. The product is an instrument, not a colleague — it does not congratulate, apologise effusively, or narrate its own cleverness.

- Write for someone halfway through their job, not someone being introduced to yours.
- A label beats a sentence. A sentence beats a paragraph. A paragraph is almost always wrong.
- State limits directly. "Automatic redaction of personal data is not built in" is better copy than any hedge.
- Numbers are facts: "24 calls", "118 ms", "3 excluded". Never "several", "a few", "lots".
- Second person for instructions ("Choose a file"), third person for descriptions ("Answers come only from this transcript").

### 5.2 Vocabulary — the exact nouns

Use these words and no synonyms. Consistency across nav, headings, table columns, buttons and API is the point.

| Concept | Word | Never |
|---|---|---|
| The unit of work | **call** | recording, conversation, item, record, interaction |
| The audio/video file | **recording** | audio file, media asset |
| The text of a call | **transcript** | text, content |
| One block of the transcript | **block** (UI) / `paragraph` (API) | segment, chunk, utterance, turn |
| A block-level classification | **moment** | tag, highlight, marker, event |
| A call-level classification | **label** | tag, category, classification |
| A group of labels | **labelset** | category set, dimension, taxonomy field |
| All labelsets together | **taxonomy** | schema, ontology, model |
| The ARAG augmentation task | **agent** | task, job, bot, worker |
| Background work | **job** | task, process, run (except "ingest run" in history) |
| The narrative write-up | **analysis** | insight, report, AI summary |
| The one-paragraph summary | **summary** | overview, abstract, TL;DR |
| The three agent ratings | **scorecard** | scores, rating, grade |
| The grounded answer link | **citation** | source, reference, footnote |
| The REMi-derived badge | **confidence** | score, accuracy, certainty, trust score |
| Adding a call | **upload** | import, ingest (except the screen title "Ingest history") |
| The ARAG instance | **Knowledge Box** | KB (except in a config key), index, database, corpus |
| A signed-in operator | **operator** | admin user, superuser |
| The whole set of calls | **the queue** (customer copy) / **all calls** (UI) | corpus, dataset, library |

### 5.3 Vocabulary — the exact verbs

| Action | Button label | Never |
|---|---|---|
| Add a call | **Upload a call** | Add, New, Create, Import |
| Run the taxonomy setup | **Provision** / **Re-provision** | Sync, Deploy, Install, Apply taxonomy |
| Regenerate labels and analysis | **Re-run analysis** | Reprocess, Refresh, Regenerate, Analyse again |
| Produce a file | **Export** | Download, Save as, Get data |
| Create a read-only link | **Share** | Publish, Send, Invite |
| Withdraw a link | **Revoke** | Delete link, Disable, Cancel |
| Remove a call | **Delete** | Remove, Archive, Discard |
| Question one call | **Ask** | Chat, Query, Search this call |
| Retry a failed thing | **Try again** | Retry (in sentences), Reload, Refresh |
| Clear filters | **Clear all** | Reset, Remove filters |
| Verify the connection | **Test connection** | Ping, Check, Validate |
| Drop cached reads | **Invalidate cache** | Clear cache, Flush, Purge |
| Leave onboarding | **Skip for now** | Skip, Dismiss, Later |
| Seed the demo data | **Try with sample calls** | Load demo, Use sample data, Demo mode |

### 5.4 Table headers and nav labels (verbatim)

Nav: `Dashboard` · `Calls` · `Upload` · `Agents & Taxonomy` · `Settings` · `Admin`.
Admin nav: `Overview` · `Connection` · `Taxonomy & Agents` · `Jobs` · `Logs` · `Usage` · `Branding` · `Security`.
Settings tabs: `Connection` · `Branding` · `Usage` · `API keys` · `About`.
Calls table headers: `Call` · `Date` · `Duration` · `Agent / Queue` · `Reason` · `Outcome` · `Sentiment` · `Status`.
Dashboard stat labels: `Calls` · `First-call resolution` · `Complaint rate` · `Cross-sell accepted` · `Avg compliance` · `Avg CSAT`.
Jobs table headers: `ID` · `Kind` · `Ref` · `Started` · `Duration` · `Status`.
Labelsets table headers: `Labelset` · `Level` · `Labels` · `Applied` · `Multiple` · `State`.

Sentence case everywhere except the one-word nav items and proper nouns. Column headers are uppercase via CSS (`t-label`), never typed in capitals.

### 5.5 Error-message pattern

Three parts, in this order, no more than two sentences total:

```
<What failed, in the user's terms>. <Why, if known, from the problem detail>.
[ <Recovery action> ]
```

Worked examples:

| Situation | Copy |
|---|---|
| Dashboard load fails | "Could not load the dashboard. The Knowledge Box did not respond within 10 seconds." → **Try again** · **Open connection settings** |
| Upload too large | "call.wav is 240 MB. The limit is 200 MB." → **Remove** |
| Unsupported file | "call.aac is not a supported format. Use MP3, MP4, WAV, M4A or a .txt transcript." → **Remove** |
| Ask rate limited | "Too many questions in a short time. Try again in 24 seconds." → disabled send with countdown |
| Delete forbidden | "Deleting calls needs an API key or the admin token." → **Open settings** |
| Share token dead | "This link is no longer available." (no further detail, deliberately) |
| Labelset in use | "Sentiment is applied to 24 calls. Delete it anyway?" → **Delete labelset** (danger) · **Cancel** |
| Agent failed | "The call-insights agent failed on its last run. ARAG reported: rate limit exceeded." → **Reset agents** |
| Stream dropped | "Live updates interrupted — checking every 3 seconds." (informational, no action) |

Rules: never show a raw stack trace, an HTTP status alone, or the word "unexpected". Always surface the RFC 9457 `detail` when it is intelligible; when it is not, say what the user can do instead. Never blame the user.

### 5.6 Trust copy (fixed strings)

These four strings carry the product's credibility. Use them exactly.

- Ask panel subtitle: **"Answers come only from this call's own transcript."**
- Decline: **"This call's transcript does not answer that."**
- No citations: **"No transcript passage was cited for this answer."**
- Confidence badge tooltip: **"{n} transcript passages ground this answer."** / **"No grounded source was found for this answer."**
- Citation chip: **"[n] mm:ss"** with tooltip **"Play this moment"**.
- Partial analysis: **"The {agent name} agent has not written this call's {field} yet."**

### 5.7 Anti-patterns

Prohibited, without exception:

1. **No emoji anywhere** — not in nav, not in empty states, not in log output, not as status markers, not in commit messages or docs written for this product.
2. **No emoji or pictographs as icons.** Icons are inline SVG only (§6.5).
3. **No "wow" copy** — no "Powerful", "Seamless", "AI-powered", "Effortless", "Unlock", "Supercharge", "Magic", "Instantly", "Simply", "Just". No exclamation marks.
4. **No explanatory paragraph where a label does.** If a form field needs a sentence, the label is wrong. Help text is one line, under 90 characters, and only where the consequence is not obvious.
5. **No anthropomorphism.** The product does not "think", "understand", "believe", "love" or "recommend". It labels, summarises, scores, cites and declines.
6. **No confidence theatre.** Never a raw REMi numeral in the customer view, never a percentage on the badge, never a badge on a decline, never a green tick next to an ungrounded answer.
7. **No invented deltas, trends or comparisons.** If the comparison period has no data, omit the delta.
8. **No "Loading…" text** where a skeleton belongs; no "Error" as a heading; no "Oops".
9. **No title-case headings** and no ALL-CAPS typed into content.
10. **No hidden destructive actions.** Delete is always behind a kebab or a bulk bar and always confirmed.
11. **No colour as the only signal.** Every status chip carries a word; every chart bar has a value.
12. **No American spellings** in UI copy: analyse, labelling, categorise, summarise, personalise, behaviour, licence (noun). API field names stay as they are (`analysis`, `labels`) — code is not copy.

---

## 6. Visual system

### 6.1 Type scale

Root is 14 px (the kit's `body.arag` base). Two weights only: 400 and 600. `--arag-font-display` for headings and numerals; `--arag-font-text` for everything else; `--arag-font-mono` for timestamps, ids and code. Progress Sans is proprietary and unbundled — the Arial fallback in the kit stands.

| Token | Size / line-height | Weight | Family | Used for |
|---|---|---|---|---|
| `t-display` | 24 / 29 px | 600 | display | Page title (h1), onboarding headline |
| `t-title` | 18 / 24 px | 600 | display | Card and section titles (h2), drawer titles, modal titles |
| `t-subtitle` | 15 / 21 px | 600 | text | Sub-sections (h3), table group headers |
| `t-body` | 14 / 21 px | 400 | text | Default. Transcript, descriptions, table cells |
| `t-body-strong` | 14 / 21 px | 600 | text | Emphasised cell values, the call title in a row |
| `t-sm` | 13 / 19 px | 400 | text | Dense table cells, inspector body, help text |
| `t-label` | 12 / 16 px | 600, `letter-spacing:.06em`, `text-transform:uppercase` | text | Table headers, stat labels, field labels, section eyebrows |
| `t-caption` | 11 / 15 px | 500 | text | Metadata under a value, timestamps in lists, footnotes |
| `t-metric` | 28 / 31 px | 600, `font-variant-numeric: tabular-nums` | display | Stat tile values |
| `t-metric-sm` | 20 / 24 px | 600, tabular-nums | display | Inline metrics, scorecard values |
| `t-mono` | 12 / 18 px | 400 | mono | Timestamps, ids, keys, JSON |

Prose maximum measure 72 characters (transcript blocks, analysis text, help text). Never justify. Never letterspace body text.

### 6.2 Spacing rhythm

Base unit 4 px. Permitted steps: **4, 8, 12, 16, 24, 32, 48, 64**. Nothing else.

| Use | Value |
|---|---|
| Page gutter | 24 |
| Gap between page sections | 24 |
| Card padding | 16 |
| Card head padding | 12 vertical / 16 horizontal |
| Grid gap between cards | 16 |
| Stack gap inside a card | 12 |
| Inline gap (chip rows, button rows) | 8 |
| Tight gap (icon to label, chip internals) | 4 |
| Drawer / modal padding | 20 |
| Table cell padding, comfortable | 12 vertical / 12 horizontal |
| Table cell padding, compact | 6 vertical / 10 horizontal |
| Control height, default | 36 |
| Control height, small | 28 |
| Control height, large | 44 |
| Sidebar nav item height | 36 |

Vertical rhythm inside a card runs 16 (padding) → 12 (between stacked blocks) → 8 (between a label and its value). Two adjacent sections never touch without at least 24.

### 6.3 Colour roles

Every colour is a token. No raw hex in components except the chart/moment palette in §6.4, which is deliberately literal for the reason already documented in `components/ui.tsx`.

| Role | Token | Value (light) | Notes |
|---|---|---|---|
| Page ground | `--arag-surface` | `#f4faff` | |
| Raised surface (cards, table, sidebar, drawer) | `--arag-surface-raised` | `#ffffff` | |
| Hairline / border | `--arag-border` | `#c9d9ee` | Outer borders, dividers between regions |
| Row divider | `--arag-brand-50` | `#eef1fd` | Inside tables and lists only |
| Body text | `--arag-text` | `#101828` | |
| Secondary text | `--arag-text-muted` | `#55627a` | Labels, descriptions |
| Tertiary text | `--arag-text-subtle` | `#8892b0` | Metadata, placeholders, the API meta line |
| Heading | `--arag-ink-950` | `#00123c` | h1–h3 |
| Brand band ground | `--arag-ink-950` | `#00123c` | |
| Primary action | `--arag-brand-600` | `#2b2bb2` | Buttons, links, active nav, selected row accent, focus ring source |
| Primary action hover | `--arag-brand-700` | `#00216b` | |
| Soft brand fill | `--arag-brand-50` | `#eef1fd` | Active nav background, hover rows, chips |
| Focus ring | `--arag-focus` | `0 0 0 3px rgba(75,75,247,.35)` | Light surfaces |
| Positive fill | `--arag-accent-500` | `#00b563` | Meters, "ok" chips, status dots. **Fill only** |
| Positive text | `--arag-accent-fg` | `#00663a` | 7.1:1 on white — the only green permitted as text on light |
| Positive soft fill | `--arag-accent-soft` | `#cdffca` | Chip and alert grounds |
| Warning | `--arag-warn-bg` / `--arag-warn-fg` | `#fff3c2` / `#6b4e00` | |
| Danger | `--arag-danger-bg` / `--arag-danger-fg` | `#ffe3e7` / `#8c1f2e` | |
| Info | `--arag-info-bg` / `--arag-info-fg` | `#dff3ff` / `#0b4a6f` | In-flight states |
| Progress green | `--pg-green` | `#5ce500` | Rules below |
| Progress green ink | `--pg-green-ink` | `#00123c` | The only text colour permitted **on** a `#5ce500` fill |

Dark surfaces (the Progress band, the log viewer, the collapsed rail in dark theme) use the kit's `[data-theme="dark"]` block unchanged. The product ships light-only; the dark block exists so the band and log viewer are correct and so a future theme toggle is a configuration change, not a redesign.

#### 6.3.1 Progress green — the exact rules

Measured contrast: `#5ce500` on `#ffffff` is **1.66:1**; on `#f4faff` it is essentially the same. On `#00123c` it is **11.1:1**. `#00123c` text on a `#5ce500` fill is **11.1:1**.

**Legitimate uses of `#5ce500`:**

1. **Inside the official wordmark SVGs**, unmodified. `arag-logo.svg` (mark green, wordmark `#4b4e52`) on light surfaces; `arag-logo-alt.svg` (mark green, wordmark white) on `--arag-ink-950`. Never recolour either file.
2. **On `--arag-ink-950` / `--arag-ink-900` surfaces**: as text, as an icon stroke, or as a 1–2 px rule. This covers the Progress band, dark toasts, the `.arag-log` viewer and the dark-theme sidebar rail.
3. **As a solid fill carrying `--pg-green-ink` text**: the "Sample data" pill in the band, the onboarding progress fill inside a dark card, the active marker in a stepper rendered on a dark ground.
4. **As a focus ring on dark surfaces only**: `box-shadow: 0 0 0 3px rgba(92,229,0,.45)` over ink, where the blue `--arag-focus` is too low-contrast.
5. **As a chart series colour only when** the plot ground is ink, or the series is bounded by a 1 px `--arag-ink-950` stroke that supplies the 3:1 non-text contrast.

**Prohibited uses of `#5ce500`:**

1. Any text on `--arag-surface` or `--arag-surface-raised`. 1.66:1 fails every threshold.
2. Any hairline, underline, active-tab bar, focus ring, chart axis or indicator on a light surface where the green alone carries the meaning — fails WCAG 1.4.11's 3:1 for non-text contrast.
3. Primary buttons, links, active nav pills, selected-row accents on light surfaces. Those are `--arag-brand-600`.
4. Success or positive semantics on light surfaces. Those are `--arag-accent-500` fill with `--arag-accent-fg` text.
5. Overriding any `--arag-accent-*` token. `--pg-green` is a separate token and never reassigns kit tokens.
6. The confidence badge, in any state. Confidence uses the semantic accent/warn/danger scale so it can never be read as brand decoration.

**White-label interaction:** `--pg-green` is used **only** inside Progress-owned surfaces — the band, the wordmark, the powered-by credit. Those are exactly the surfaces `BRAND_POWERED_BY=0` removes, so a white-labelled deployment shows no Progress green at all, with no extra conditional logic. `BRAND_PRIMARY_COLOR` and `BRAND_ACCENT_COLOR` continue to override `--arag-brand-*` and `--arag-accent-*` through `brandingCss()` on document order, and `BRAND_LOGO_URL` replaces the sidebar wordmark. `--pg-green` is declared in `public/ui-ext.css`, which loads **before** the branding `<style>`, and is never emitted by `brandingCss()`.

### 6.4 Semantic and categorical palettes

**Sentiment** (chips and chart series) — fixed mapping, never reassigned:

| Value | Background | Text |
|---|---|---|
| Positive | `--arag-accent-soft` | `--arag-accent-fg` |
| Neutral | `--arag-brand-50` | `--arag-text-muted` |
| Negative | `--arag-danger-bg` | `--arag-danger-fg` |
| Mixed | `--arag-warn-bg` | `--arag-warn-fg` |

**Lifecycle chips**: `queued` neutral · `transcribing` info · `labelling` info · `analysed` ok · `partial` warn · `failed` error. In-flight states carry the kit's animated `.arag-status[data-state="busy"]` dot.

**Moments** — keep the existing literal hexes from `components/ui.tsx` (`Complaint #e2536b`, `Escalation #e0ab00`, `Cross-sell Pitch #9333ea`, `Resolution #00b563`, `Empathy Statement #0891b2`, `Objection #ea580c`) and extend to the full eleven: `Greeting & Verification #64748b`, `Problem Statement #2563eb`, `Compliance Disclosure #0f766e`, `Next Steps #475569`, `Sensitive / PII #7c3aed`. Unlabelled blocks are `--arag-border` at 40 % track height. This palette is used identically in the card thumbnail, the moments track and the transcript chips, so a colour means the same thing in all three places.

**Charts**: single-series bar lists use `--arag-brand-600` with descending opacity 1.0 / 0.8 / 0.65 / 0.5 / 0.4 / 0.3. Categorical series that must be distinguishable use the labelset's own `color` from `lib/domain/taxonomy.ts`, which is already a per-labelset decision. Every bar carries its numeric value as text; colour is never the only encoding.

### 6.5 Icon system

Inline SVG only. No icon font, no emoji, no third-party sprite.

- `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Stroke width by size: **16 px → 2.0**, **20 px → 1.75**, **24 px → 1.75**, **32 px → 1.5**. This keeps optical weight constant.
- Size steps: 14 (inline with `t-caption`), 16 (buttons, chips, table cells), 20 (sidebar nav, toolbars), 24 (page header actions), 32 (empty states, dropzone).
- Always `aria-hidden="true"` when a text label is adjacent; otherwise the parent carries `aria-label`.
- Icons live in one module, `components/icons.tsx`, exporting a named component per icon. No inline `<svg>` literals scattered through screens.

Required set (name → meaning): `dashboard`, `calls`, `upload`, `taxonomy`, `settings`, `admin`, `search`, `filter`, `sort-asc`, `sort-desc`, `chevron-down`, `chevron-right`, `chevron-left`, `close`, `menu`, `kebab`, `columns`, `density`, `check`, `minus`, `plus`, `play`, `pause`, `skip-back-15`, `skip-forward-15`, `volume`, `captions`, `audio`, `video`, `transcript`, `clock`, `calendar`, `user`, `queue`, `share`, `link`, `export`, `refresh`, `trash`, `warning`, `error`, `info`, `success`, `citation`, `external`, `copy`, `eye`, `eye-off`, `key`, `shield`, `activity`, `database`, `chart-bar`, `chevrons-left` (collapse), `chevrons-right` (expand).

### 6.6 Density, elevation and shape

**Table density.** Two modes, toggled per table and persisted per screen.

| | Comfortable (default) | Compact |
|---|---|---|
| Row height | 56 px (two-line cells) / 44 px (single-line) | 34 px |
| Cell padding | 12 / 12 | 6 / 10 |
| Body type | `t-body` | `t-sm` |
| Chips per cell | up to 2, then "+n" | 1, then "+n" |
| Second metadata line | shown | hidden, moved to the row title attribute |

Rules: numeric columns are right-aligned with `font-variant-numeric: tabular-nums`. Dates are left-aligned and never relative in a table (relative time only in "last updated" strings). Row hover is `--arag-brand-50`. Selected rows are `--arag-brand-50` with a 3 px `--arag-brand-600` left bar. Sticky header, sticky bulk bar. No zebra striping — the row divider does the work. Minimum 3 and maximum 9 visible columns; anything beyond goes to the inspector.

**Elevation.** Only two levels:
- **Flat** — in-flow surfaces (cards, tables, panels, the sidebar): 1 px `--arag-border`, `box-shadow: none`. `app/globals.css` already overrides `.arag-card` to no shadow; keep that and make it the rule.
- **Overlay** — drawers, modals, popovers, kebab menus, toasts, the sticky table header once scrolled: `--arag-shadow`. Nothing else casts a shadow, ever.

**Shape.** `--arag-radius` 8 px for controls, inputs, chips, buttons, nav items, table wrappers. `--arag-radius-lg` 12 px for cards, drawers, modals, dropzone, empty states. `999px` for pills, progress bars and status dots. Nothing is fully square and nothing is a circle except status dots and avatars.

**Borders.** Region boundaries use `--arag-border`. Internal dividers inside a card or table use `--arag-brand-50`. A border and a shadow never appear on the same element.

**Motion.** 120 ms for colour and border transitions; 180 ms ease-out for drawer and popover entry; 250 ms for the citation flash (existing `.flash`). Respect `prefers-reduced-motion: reduce` by disabling the animated status dot, the citation flash and the drawer slide, keeping the end state.

---

## 7. Component list mapped to the UI kit

Legend — **Kit**: exists in `vendor/arag-platform/ui/arag-ui.css` today, use as-is. **Propose**: add to the platform kit; author it in `public/ui-ext.css` now, in kit style, for the Head to lift verbatim. **Local**: product-specific, lives in `public/ui-ext.css` and stays there.

`app/globals.css` gains one line immediately after the kit import:

```css
@import "../vendor/arag-platform/ui/arag-ui.css";
@import "../public/ui-ext.css";   /* kit candidates + product-local additions; see design/PRODUCT-EXPERIENCE.md §7 */
```

`public/ui-ext.css` uses only `--arag-*` tokens and `.arag-*` class names, contains no Tailwind, and is ordered: tokens, then kit candidates, then product-local. That is what makes the lift trivial.

### 7.1 Summary table

| # | Component | Class | Status | Note |
|---|---|---|---|---|
| 1 | Sidebar shell | `.arag-shell`, `.arag-sidebar`, `.arag-sidebar-nav` | **Propose** | The kit has only the top-nav shell (`.arag-header` + `.arag-nav`). Every product now needs a sidebar. |
| 2 | Data table | `.arag-table` (+ `.sortable`, `.selectable`, `.compact`, `.sticky`) | **Propose** (extend) | Base table exists. Sorting, selection, density, sticky header and the empty row are missing. |
| 3 | Drawer / inspector | `.arag-drawer` | **Propose** | Nothing equivalent; `.arag-modal` is centred and wrong for an inspector. |
| 4 | Tabs | `.arag-tabs` | **Kit** | Use as-is. Add `.arag-tabs.pill` variant locally only if the segmented control does not cover the need — it does, so do not. |
| 5 | Breadcrumb | `.arag-breadcrumb` | **Propose** | Missing. |
| 6 | Filter bar | `.arag-filterbar`, `.arag-filterchip` | **Propose** | Missing. `.arag-chip` is a display badge, not a removable filter token. |
| 7 | Empty state | `.arag-empty` | **Kit** (extend) | Exists but is a bare bordered box. Add `.arag-empty > .icon/.title/.body/.actions` structure. |
| 8 | Stat strip | `.arag-stat-strip` wrapping `.arag-kpi` | **Propose** | `.arag-kpi` exists as a tile; the joined strip with shared borders and a delta line does not. |
| 9 | Progress / stepper | `.arag-progress`, `.arag-steps` | **Kit** | Both exist and are exactly right. Add nothing. |
| 10 | Toast | `.arag-toast` | **Kit** (extend) | Container exists. Add `.arag-toast > div.ok/.warn` and a dismiss affordance. |
| 11 | File dropzone | `.arag-dropzone` | **Kit** (extend) | Exists. Its `.icon` rule sets `font-size` for a glyph — replace with SVG sizing, and add `.arag-filerow`. |
| 12 | Segmented control | `.arag-segmented` | **Propose** | Missing. Needed for Table/Browse, density, Agents/Queues. |
| 13 | Pagination | `.arag-pagination` | **Propose** | Missing. |
| 14 | Kebab menu | `.arag-menu`, `.arag-menu-btn` | **Propose** | Missing. |
| 15 | Skeleton | `.arag-skeleton` | **Propose** | Missing; every screen needs it. |
| 16 | Tooltip | `.arag-tip` | **Propose** | Missing; needed by the moments track and every disabled action. |
| 17 | Popover | `.arag-popover` | **Propose** | Missing; the facet dropdowns and the columns picker need it. |
| 18 | Confidence badge | `.arag-confidence` | **Propose** | Trust surface; belongs in the kit so all three products render it identically. |
| 19 | Citation chip | `.arag-cite` | **Kit** | Exists. Add only the `data-time` content rule locally. |
| 20 | Media player strip | `.ca-player` | **Local** | Product-specific. |
| 21 | Moments track | `.ca-moments` | **Local** | Product-specific — the defining surface of this product. |
| 22 | Transcript block | `.ca-block` | **Local** | Product-specific. |
| 23 | Call thumbnail | `.ca-thumb` | **Local** | Already implemented in `components/ui.tsx`; move its styling here. |
| 24 | Scorecard meter | `.arag-meter` | **Propose** | A labelled 0–100 bar; generic enough for all three products. |

### 7.2 CSS sketches for the proposed kit additions

Author these verbatim in `public/ui-ext.css`, under the heading `/* ===== Kit candidates — lift into arag-ui.css unchanged ===== */`.

```css
/* --- tokens added by this product ------------------------------------ */
:root {
  --pg-green: #5ce500;        /* Progress green. Dark surfaces and fills only. See §6.3.1. */
  --pg-green-ink: #00123c;    /* the only text colour permitted on a --pg-green fill */
  --arag-sidebar-w: 248px;
  --arag-sidebar-rail: 64px;
  --arag-drawer-w: 400px;
  --arag-row-h: 56px;
  --arag-row-h-compact: 34px;
}

/* --- 1. sidebar shell ------------------------------------------------- */
.arag-shell { display: grid; grid-template-columns: var(--arag-sidebar-w) minmax(0, 1fr); min-height: 100vh; }
.arag-shell.collapsed { grid-template-columns: var(--arag-sidebar-rail) minmax(0, 1fr); }
.arag-sidebar {
  position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto;
  background: var(--arag-surface-raised); border-right: 1px solid var(--arag-border);
  display: flex; flex-direction: column; gap: 16px; padding: 16px 12px;
}
.arag-sidebar .brandblock { display: flex; flex-direction: column; gap: 4px; padding: 0 4px 12px; border-bottom: 1px solid var(--arag-border); }
.arag-sidebar-nav { display: flex; flex-direction: column; gap: 2px; list-style: none; margin: 0; padding: 0; }
.arag-sidebar-nav a {
  display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px;
  border-radius: var(--arag-radius); color: var(--arag-text-muted); font-weight: 500; font-size: .875rem;
  border-left: 3px solid transparent; text-decoration: none;
}
.arag-sidebar-nav a:hover { background: var(--arag-brand-50); color: var(--arag-text); text-decoration: none; }
.arag-sidebar-nav a[aria-current="page"] { background: var(--arag-brand-50); color: var(--arag-brand-600); border-left-color: var(--arag-brand-600); }
.arag-sidebar-nav .group { padding: 12px 10px 4px; font-size: .72rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--arag-text-subtle); }
.arag-sidebar .foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; font-size: .78rem; color: var(--arag-text-muted); }
.arag-shell.collapsed .arag-sidebar { padding: 16px 8px; align-items: center; }
.arag-shell.collapsed .arag-sidebar-nav a { justify-content: center; padding: 0; }
.arag-shell.collapsed .arag-sidebar-nav a span, .arag-shell.collapsed .arag-sidebar .brandblock .name,
.arag-shell.collapsed .arag-sidebar .group, .arag-shell.collapsed .arag-sidebar .foot span { display: none; }
@media (max-width: 1023px) { .arag-shell { grid-template-columns: minmax(0, 1fr); } .arag-sidebar { display: none; } }

/* --- 2. data table extensions ---------------------------------------- */
.arag-table thead th { position: sticky; top: 0; z-index: 2; background: var(--arag-surface-raised); }
.arag-table.sticky thead th.scrolled { box-shadow: 0 1px 0 var(--arag-border), var(--arag-shadow); }
.arag-table th.sortable > button {
  all: unset; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
  font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit;
}
.arag-table th.sortable > button:hover { color: var(--arag-brand-600); }
.arag-table th[aria-sort] > button { color: var(--arag-brand-600); }
.arag-table th.num, .arag-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.arag-table td { padding: 12px; }
.arag-table.compact td, .arag-table.compact th { padding: 6px 10px; font-size: .8rem; }
.arag-table.selectable tr[aria-selected="true"] td { background: var(--arag-brand-50); }
.arag-table.selectable tr[aria-selected="true"] td:first-child { box-shadow: inset 3px 0 0 var(--arag-brand-600); }
.arag-table td.actions { width: 44px; text-align: right; }
.arag-table tbody tr.clickable { cursor: pointer; }
.arag-table .cellstack { display: flex; flex-direction: column; gap: 2px; }
.arag-table .cellstack .sub { font-size: .72rem; color: var(--arag-text-subtle); }
.arag-tablewrap { border: 1px solid var(--arag-border); border-radius: var(--arag-radius-lg); overflow: auto; background: var(--arag-surface-raised); }
.arag-tabletoolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--arag-border); }
.arag-bulkbar {
  display: flex; align-items: center; gap: 12px; padding: 8px 12px;
  background: var(--arag-brand-50); border-bottom: 1px solid var(--arag-border);
  font-size: .82rem; font-weight: 500; color: var(--arag-brand-700);
}

/* --- 3. drawer -------------------------------------------------------- */
.arag-drawer-backdrop { position: fixed; inset: 0; background: rgba(0,18,60,.45); z-index: 80; }
.arag-drawer {
  position: fixed; top: 0; right: 0; height: 100vh; width: min(var(--arag-drawer-w), 100vw); z-index: 81;
  background: var(--arag-surface-raised); border-left: 1px solid var(--arag-border);
  box-shadow: var(--arag-shadow); display: flex; flex-direction: column;
}
.arag-drawer > .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 16px 20px; border-bottom: 1px solid var(--arag-border); }
.arag-drawer > .body { padding: 20px; overflow-y: auto; flex: 1; }
.arag-drawer > .foot { padding: 16px 20px; border-top: 1px solid var(--arag-border); display: flex; gap: 8px; justify-content: flex-end; }
.arag-drawer.inline { position: sticky; top: 0; height: auto; max-height: 100vh; border-radius: var(--arag-radius-lg); border: 1px solid var(--arag-border); box-shadow: none; }
@media (prefers-reduced-motion: no-preference) {
  .arag-drawer { animation: arag-slide-in .18s ease-out 1; }
  @keyframes arag-slide-in { from { transform: translateX(16px); opacity: 0; } to { transform: none; opacity: 1; } }
}

/* --- 5. breadcrumb ---------------------------------------------------- */
.arag-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: .78rem; color: var(--arag-text-subtle); }
.arag-breadcrumb a { color: var(--arag-text-muted); }
.arag-breadcrumb a:hover { color: var(--arag-brand-600); }
.arag-breadcrumb .sep { color: var(--arag-text-subtle); }
.arag-breadcrumb [aria-current="page"] { color: var(--arag-text); font-weight: 500; }

/* --- 6. filter bar ---------------------------------------------------- */
.arag-filterbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 0; }
.arag-filterbar .search { position: relative; flex: 0 0 320px; max-width: 100%; }
.arag-filterbar .search .arag-input { padding-left: 34px; height: 36px; }
.arag-filterbar .search .ic { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--arag-text-subtle); pointer-events: none; }
.arag-filterbar .spacer { flex: 1; }
.arag-filterbar .count { font-size: .8rem; color: var(--arag-text-muted); font-variant-numeric: tabular-nums; }
.arag-filterchips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-bottom: 8px; }
.arag-filterchip {
  display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 6px 0 10px;
  border-radius: var(--arag-radius); border: 1px solid var(--arag-brand-200);
  background: var(--arag-brand-50); color: var(--arag-brand-700); font-size: .76rem; font-weight: 500;
}
.arag-filterchip > button { all: unset; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 4px; cursor: pointer; color: var(--arag-brand-600); }
.arag-filterchip > button:hover { background: var(--arag-brand-100); }

/* --- 7. empty state structure ---------------------------------------- */
.arag-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; }
.arag-empty > .icon { color: var(--arag-text-subtle); }
.arag-empty > .title { font-family: var(--arag-font-display); font-size: 1rem; font-weight: 600; color: var(--arag-text); }
.arag-empty > .body { font-size: .86rem; color: var(--arag-text-muted); max-width: 46ch; }
.arag-empty > .actions { display: flex; gap: 8px; margin-top: 8px; }

/* --- 8. stat strip ---------------------------------------------------- */
.arag-stat-strip {
  display: grid; grid-template-columns: repeat(var(--n, 6), minmax(0, 1fr));
  border: 1px solid var(--arag-border); border-radius: var(--arag-radius-lg);
  background: var(--arag-surface-raised); overflow: hidden;
}
.arag-stat-strip > * + * { border-left: 1px solid var(--arag-border); }
.arag-stat-strip .arag-kpi { padding: 16px; }
.arag-stat-strip a.arag-kpi:hover { background: var(--arag-brand-50); text-decoration: none; }
.arag-kpi .delta { font-size: .74rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.arag-kpi .delta.up { color: var(--arag-accent-fg); }
.arag-kpi .delta.down { color: var(--arag-danger-fg); }
@media (max-width: 1100px) { .arag-stat-strip { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .arag-stat-strip > * { border-left: 1px solid var(--arag-border); border-top: 1px solid var(--arag-border); } }
@media (max-width: 640px) { .arag-stat-strip { grid-template-columns: repeat(2, minmax(0,1fr)); } }

/* --- 12. segmented control -------------------------------------------- */
.arag-segmented { display: inline-flex; padding: 2px; gap: 2px; background: var(--arag-brand-50); border: 1px solid var(--arag-border); border-radius: var(--arag-radius); }
.arag-segmented > button {
  all: unset; cursor: pointer; padding: 5px 12px; border-radius: 6px; font: 500 .82rem var(--arag-font-text);
  color: var(--arag-text-muted); text-align: center;
}
.arag-segmented > button[aria-pressed="true"] { background: var(--arag-surface-raised); color: var(--arag-brand-600); box-shadow: 0 1px 2px rgba(0,18,60,.08); }
.arag-segmented > button:focus-visible { box-shadow: var(--arag-focus); }

/* --- 13. pagination --------------------------------------------------- */
.arag-pagination { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-top: 1px solid var(--arag-border); font-size: .8rem; color: var(--arag-text-muted); }
.arag-pagination .range { font-variant-numeric: tabular-nums; }
.arag-pagination .pages { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.arag-pagination .pages button { all: unset; cursor: pointer; min-width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--arag-radius); color: var(--arag-text-muted); font-weight: 500; }
.arag-pagination .pages button:hover { background: var(--arag-brand-50); }
.arag-pagination .pages button[aria-current="page"] { background: var(--arag-brand-600); color: #fff; }
.arag-pagination .pages button:disabled { opacity: .4; cursor: not-allowed; }

/* --- 14. kebab menu + 17. popover ------------------------------------- */
.arag-menu-btn { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--arag-radius); color: var(--arag-text-muted); }
.arag-menu-btn:hover { background: var(--arag-brand-50); color: var(--arag-text); }
.arag-menu-btn:focus-visible { box-shadow: var(--arag-focus); }
.arag-popover {
  position: absolute; z-index: 70; min-width: 200px; max-width: 320px; padding: 6px;
  background: var(--arag-surface-raised); border: 1px solid var(--arag-border);
  border-radius: var(--arag-radius); box-shadow: var(--arag-shadow);
}
.arag-menu { display: flex; flex-direction: column; gap: 1px; }
.arag-menu button, .arag-menu a {
  all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 7px 10px;
  border-radius: 6px; font-size: .84rem; color: var(--arag-text);
}
.arag-menu button:hover, .arag-menu a:hover { background: var(--arag-brand-50); text-decoration: none; }
.arag-menu button.danger { color: var(--arag-danger-fg); }
.arag-menu button:disabled { color: var(--arag-text-subtle); cursor: not-allowed; background: none; }
.arag-menu .sep { height: 1px; background: var(--arag-border); margin: 4px 0; }

/* --- 15. skeleton ----------------------------------------------------- */
.arag-skeleton { background: var(--arag-brand-50); border-radius: var(--arag-radius); position: relative; overflow: hidden; }
.arag-skeleton.text { height: 12px; }
.arag-skeleton.row { height: var(--arag-row-h); border-radius: 0; }
@media (prefers-reduced-motion: no-preference) {
  .arag-skeleton::after {
    content: ""; position: absolute; inset: 0; transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.7), transparent);
    animation: arag-shimmer 1.4s infinite;
  }
  @keyframes arag-shimmer { to { transform: translateX(100%); } }
}

/* --- 16. tooltip ------------------------------------------------------ */
.arag-tip {
  position: absolute; z-index: 95; padding: 5px 8px; border-radius: 6px;
  background: var(--arag-ink-950); color: #fff; font-size: .74rem; line-height: 1.35;
  max-width: 240px; pointer-events: none; box-shadow: var(--arag-shadow);
}

/* --- 18. confidence badge -------------------------------------------- */
.arag-confidence {
  display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: var(--arag-radius);
  font-size: .74rem; font-weight: 600;
}
.arag-confidence .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.arag-confidence[data-level="high"]     { background: var(--arag-accent-soft); color: var(--arag-accent-fg); }
.arag-confidence[data-level="moderate"] { background: var(--arag-warn-bg);     color: var(--arag-warn-fg); }
.arag-confidence[data-level="low"]      { background: var(--arag-danger-bg);   color: var(--arag-danger-fg); }
.arag-confidence[data-level="none"]     { background: var(--arag-brand-50);    color: var(--arag-text-muted); }

/* --- 24. meter -------------------------------------------------------- */
.arag-meter { display: flex; flex-direction: column; gap: 4px; }
.arag-meter .row { display: flex; justify-content: space-between; font-size: .78rem; color: var(--arag-text-muted); }
.arag-meter .row .val { font-weight: 600; color: var(--arag-text); font-variant-numeric: tabular-nums; }
.arag-meter .bar { height: 6px; border-radius: 999px; background: var(--arag-brand-50); overflow: hidden; }
.arag-meter .bar > i { display: block; height: 100%; background: var(--arag-accent-500); }
.arag-meter[data-band="warn"] .bar > i { background: #e0ab00; }
.arag-meter[data-band="poor"] .bar > i { background: var(--arag-danger-fg); }
```

### 7.3 Product-local components

Under `/* ===== Product-local — stays in call-analysis ===== */` in the same file.

```css
/* --- 20. media player strip ------------------------------------------ */
.ca-player { background: var(--arag-surface-raised); border: 1px solid var(--arag-border); border-radius: var(--arag-radius-lg); overflow: hidden; }
.ca-player video { width: 100%; aspect-ratio: 16 / 9; background: #000; display: block; }
.ca-player .controls { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
.ca-player .time { font-family: var(--arag-font-mono); font-size: .74rem; color: var(--arag-text-muted); font-variant-numeric: tabular-nums; }
.ca-player .scrub { flex: 1; height: 6px; border-radius: 999px; background: var(--arag-brand-50); position: relative; cursor: pointer; }
.ca-player .scrub > .played { position: absolute; inset: 0 auto 0 0; background: var(--arag-brand-600); border-radius: 999px; }
.ca-player .scrub > .head { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: var(--arag-brand-600); border: 2px solid var(--arag-surface-raised); }

/* --- 21. moments track ------------------------------------------------ */
.ca-moments { display: block; width: 100%; height: 28px; padding: 0 12px 10px; }
.ca-moments rect { cursor: pointer; }
.ca-moments rect:hover { opacity: .85; }
.ca-moments .none { fill: var(--arag-border); }
.ca-moments .cited { stroke: var(--arag-ink-950); stroke-width: 1.5; }

/* --- 22. transcript block -------------------------------------------- */
.ca-block { padding: 12px; border-bottom: 1px solid var(--arag-brand-50); cursor: pointer; }
.ca-block:hover { background: color-mix(in srgb, var(--arag-brand-50) 60%, transparent); }
.ca-block[data-active="true"] { background: var(--arag-brand-50); box-shadow: inset 3px 0 0 var(--arag-brand-600); }
.ca-block .meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.ca-block .ts { font-family: var(--arag-font-mono); font-size: .72rem; color: var(--arag-text-subtle); }
.ca-block[data-active="true"] .ts { color: var(--arag-brand-600); }
.ca-block .turn { font-size: .875rem; line-height: 1.6; color: var(--arag-text); margin: 0 0 4px; max-width: 72ch; }
.ca-block .turn .who { font-weight: 600; font-size: .76rem; margin-right: 6px; }
.ca-block .turn .who[data-who="Agent"]  { color: var(--arag-brand-600); }
.ca-block .turn .who[data-who="Member"] { color: var(--arag-accent-fg); }

/* --- 23. call thumbnail ----------------------------------------------- */
.ca-thumb { position: relative; overflow: hidden; border-radius: var(--arag-radius) var(--arag-radius) 0 0; background: var(--arag-ink-900); }
.ca-thumb svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.ca-thumb .badge { position: absolute; top: 6px; right: 6px; color: rgba(255,255,255,.8); }
```

### 7.4 React component inventory

Files to create or rewrite under `components/`:

| File | Status | Contains |
|---|---|---|
| `components/shell/AppShell.tsx` | new | `.arag-shell`, band, sidebar, page header, footer, mobile drawer |
| `components/shell/Sidebar.tsx` | new | nav model, collapse state, status foot |
| `components/shell/PageHeader.tsx` | new | title, breadcrumb, actions, the API meta line |
| `components/shell/Brandmark.tsx` | new | the wordmark lockup + logo override; replaces `Logo()` in `AppChrome.tsx` |
| `components/AppChrome.tsx` | delete | superseded by `AppShell` |
| `components/data/DataTable.tsx` | new | headless-ish table: columns, sort, selection, density, sticky, skeleton, empty |
| `components/data/FilterBar.tsx` | new | search, facet popovers, applied chips, URL sync |
| `components/data/Pagination.tsx` | new | |
| `components/data/BulkBar.tsx` | new | |
| `components/ui/Drawer.tsx` | new | focus trap, Escape, backdrop, inline variant |
| `components/ui/Popover.tsx`, `Menu.tsx`, `Tooltip.tsx`, `Segmented.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `StatStrip.tsx`, `Meter.tsx`, `Toast.tsx` | new | thin wrappers over §7.2 |
| `components/icons.tsx` | new | the icon set in §6.5 |
| `components/call/CallWorkspace.tsx` | rewrite of `CallDetailView` | three-pane layout |
| `components/call/Player.tsx`, `MomentsTrack.tsx`, `Transcript.tsx` | new | split out of `CallDetailView` |
| `components/call/AskPanel.tsx` | rewrite of `ChatPanel` | kit chat classes, trust row |
| `components/call/AnalysisPanel.tsx` | keep, restyle | meters via `.arag-meter` |
| `components/call/CallCard.tsx`, `CategoryRails.tsx`, `Markdown.tsx` | keep | unchanged behaviour |
| `components/upload/Dropzone.tsx`, `IngestProgress.tsx` | new | |
| `components/admin/*` | rewrite | reuse `DataTable`, `Drawer`, `StatStrip`; drop the bespoke `Panel`/`StateBlock` in favour of shared ones |

### 7.5 Accessibility requirements (non-negotiable)

- Every interactive element reachable and operable by keyboard; visible focus via `--arag-focus` (or the green ring on ink surfaces).
- The table is a real `<table>` with `<th scope="col">`, `aria-sort` on the sorted header, and a caption naming the result count.
- The drawer traps focus, closes on Escape, restores focus to its trigger, and is labelled by its heading.
- The player's scrub bar is an ARIA slider with `aria-valuetext` in `mm:ss`.
- The moments track is a list of buttons with `aria-label="{moment} at {mm:ss}"`, not a bare SVG.
- Live regions: the answer stream is `aria-live="polite"`; job stage changes are announced once each; toasts are `role="status"`, errors `role="alert"`.
- Colour contrast: all text meets 4.5:1, all UI boundaries 3:1. The Progress-green rules in §6.3.1 exist precisely to hold this line.

---

## 8. The guided path — "Try with sample calls"

This is the product's demo. It runs entirely through the real screens, with no demo-only route, no scripted overlay and no seeded UI state. `showcase/record.spec.ts` follows exactly these steps, in this order, and `showcase/SCRIPT.md` and `STORYBOARD.md` are regenerated from them.

Preconditions: `ARAG_MOCK=1`, a Knowledge Box with zero calls, `localStorage` cleared.

| # | Screen | Action | What the viewer sees | Screenshot |
|---|---|---|---|---|
| 1 | `/` → `/welcome` | Load the app | Onboarding. Step 1 **Done** (connected). Step 2 in progress. Step 3 offers **Try with sample calls** and **Upload my own**. | `01-welcome.png` |
| 2 | `/welcome` | Click **Try with sample calls** | Step 3 becomes a live job card: `provision → upload → process → augment → verify`, each stage ticking with its duration. Step 4 unlocks when the first call reaches `analysed`. | `02-seeding.png` |
| 3 | `/` | Click **See the analysis** | Dashboard, populated. Stat strip: 24 calls, 58 % first-call resolution, 25 % complaint rate. Four charts, the by-agent table, recent calls. | `03-dashboard.png` |
| 4 | `/` | Click the **Complaint rate** tile | Navigates to `/calls?label=disposition_flags%2FComplaint+Raised&mode=table` with the filter chip already applied and 6 results. This is the drill-through proof. | `04-drilldown.png` |
| 5 | `/calls` | Open the **Sentiment** facet, tick **Negative** | The table refines to 4 rows without blanking; a second filter chip appears; facet counts update. | `05-facets.png` |
| 6 | `/calls` | Clear filters, type `double charged` in search | Semantic and full-text search across transcripts returns the billing complaint call first. | `06-search.png` |
| 7 | `/calls` | Switch to **Browse** | Category rails: Negative sentiment, Claims, Billing, Complaint raised, Compliance risk — each with a live count and real cards showing per-call moment maps. | `07-browse.png` |
| 8 | `/calls` | Switch back to **Table**, tick three rows | Bulk bar appears: 3 selected, Export / Re-run analysis / Add label / Delete. Do not run the action — the point is that the affordance is real. | `08-bulk.png` |
| 9 | `/calls/{id}` | Open **Billing complaint — double-charged premium** | The workspace: header with labels, player, moments track under the scrub bar, transcript with per-block timestamps and moment chips, inspector on Analysis. | `09-workspace.png` |
| 10 | `/calls/{id}` | Click the **Complaint** segment on the moments track | The player scrubs to 00:41 and the transcript block highlights in place. The moments track is the product's own idea made literal. | `10-moment-seek.png` |
| 11 | `/calls/{id}` | Inspector → **Ask**, ask "Was the member satisfied, and did they accept the offer?" | The answer streams with inline superscript markers. | `11-asking.png` |
| 12 | `/calls/{id}` | Wait for the stream to end | Trust row appears: confidence badge, then `[1] 00:41` and `[2] 02:18` citation chips. | `12-answer.png` |
| 13 | `/calls/{id}` | Click citation `[2]` | The recording scrubs to 02:18 and the cited transcript block highlights and flashes. **This is the hero moment.** | `13-citation-scrub.png` |
| 14 | `/calls/{id}` | Ask "What was the member's credit score?" | An honest decline: "This call's transcript does not answer that." No confidence badge, no citations. The refusal is the feature. | `14-decline.png` |
| 15 | `/calls/{id}` | Click **Share** → create a link | The share dialog with an expiry; the link is copied. | `15-share.png` |
| 16 | `/upload` | Sidebar → **Upload** | Dropzone, metadata form, the ingest history link. Drop a transcript; the stepper runs live. | `16-upload.png` |
| 17 | `/taxonomy` | Sidebar → **Agents & Taxonomy** | Six labelsets with applied counts, three agents with their state, provisioning history. Open the Call Reason labelset in the inspector to show the categories are editable — the "your categories, not ours" promise. | `17-taxonomy.png` |
| 18 | `/settings/branding` | Sidebar → **Settings** → Branding | Change the product name and primary colour; the live shell preview re-renders. Reset. | `18-branding.png` |
| 19 | `/admin` | Sidebar → **Admin** | Operator overview: connection OK, counts, recent jobs, recent errors, cache. | `19-admin.png` |
| 20 | `/admin/jobs` | Open the `seed-samples` job | The job drawer with the full stage timeline and per-stage timings — the provenance of everything just seen. | `20-admin-job.png` |
| 21 | `/api/v1/docs` | Click **Docs** in the band | Redoc. Every screen in the recording was a client of these endpoints. | `21-api-docs.png` |

Runtime target: 2 min 30 s. Steps 9–14 are the spine and take 55 s of it; nothing else may grow at their expense. If a cut is needed, drop 8, 15 and 18 in that order.

---

## 9. Implementation priority

### P0 — the product does not pass the bar without these

1. **Shell.** `AppShell` + `Sidebar` + `PageHeader` + `Brandmark`; the official wordmark as the default identity; the collapse state; the mobile drawer. Delete `AppChrome.tsx`'s bespoke waveform logo. (§3.1, §6.3.1)
2. **`public/ui-ext.css`** with the tokens and the kit candidates from §7.2, imported from `app/globals.css`.
3. **API first**: extend `listCalls` (sort/order/date/duration/facets/`applied`), add `lifecycle` to `CallSummary`, and add `bulkCallAction`, `exportCalls`, `exportCall`, `reanalyseCall`, `getSettings`, `getTaxonomy`, `getOnboarding`, `seedSampleCalls`. Spec in `lib/openapi.ts`, then handlers, then services, then contract tests.
4. **Calls table mode** with the data table, filter bar, applied chips, sorting, pagination, row selection and the bulk bar; the Table | Browse segmented control preserving the existing rails.
5. **Call workspace** three-pane layout with the player strip, the moments track and the inspector tabs.
6. **Upload** screen with the dropzone, metadata, SSE progress stepper and ingest history.
7. **Onboarding** `/welcome` with the sample-seed path, plus the empty states that reach it.
8. **Settings** Connection + Branding + About.
9. **Admin restructured** into the shell with the new nav, `DataTable` on Jobs and Logs, and the job drawer; redirects from the old paths.
10. **States**: skeletons, empty, error, permission-denied on every screen listed in §4.2; the lifecycle chip everywhere it is specified.
11. **Copy pass**: every string against §5, including British spellings and the removal of any remaining "AI Analysis"-style headings (it becomes **Analysis**).

### P1 — the product is noticeably better with these

1. Dashboard date-range and queue scoping, `byAgent` / `byQueue` / `byDay`, and the by-agent table.
2. Share links end to end: create, revoke, `/share/[token]`, and the read-only view.
3. Re-run analysis, from the workspace kebab and from the bulk bar, with the 409 conflict handling.
4. Export dialogue: CSV and JSON, filter-scoped, with the row cap and the 413 path; single-call `txt` / `vtt` export.
5. Taxonomy write path: labelset create/edit/delete in the inspector, the re-provision warning, `/admin/taxonomy`.
6. Settings → Usage, and `GET /api/v1/usage`.
7. Admin Security screen and the API-keys endpoints (`managed:false` against `API_KEYS` is an acceptable first cut).
8. Column picker and density toggle with persistence; the row inspector ("Open in inspector") on the calls table.
9. Job cancellation.
10. Toasts for asynchronous completions (upload finished, export ready, link copied).

### P2 — worth doing, safe to cut

1. Saved views (`/api/v1/views`) and a **Views** section in the sidebar.
2. Keyboard command palette (`cmd-K`) over calls and navigation.
3. Dark theme toggle (the tokens already exist; only a persisted `data-theme` and a QA pass are missing).
4. Transcript virtualisation for calls over 500 blocks.
5. Waveform rendering behind the moments track.
6. Per-agent and per-queue trend charts over time.
7. Bulk label add/remove (the endpoint is specified; the UI can follow).
8. `prefers-reduced-data` handling for the media proxy.

### Cut lines

- Dropping **all of P2** leaves a complete product.
- Dropping **P1 items 4–10** leaves a product that still tells the whole story and still records the showcase; only the operator surfaces get thinner.
- **Nothing in P0 may be cut.** Each P0 item is the difference between a page with a coat of paint and a product a partner could white-label tomorrow.

### Definition of done for this pass

- Every route in §2.1 exists and renders all six states from §4.
- Every endpoint in §2.3 is in `lib/openapi.ts` with a matching `API_ROUTES` entry, and `lintSpec` / `missingFromSpec` / `checkResponse` pass.
- No emoji anywhere in `app/`, `components/`, `lib/`, `services/`, `docs/` or `showcase/`.
- No raw hex in `components/` outside the documented moment and chart palettes.
- The showcase spec follows §8 step for step and produces the 21 screenshots.
- Before/after screenshots at 1440 px of Dashboard, Calls, Call workspace, Settings and Admin in `docs/screenshots/`.
