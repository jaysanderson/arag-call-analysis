# Examples

Every example runs against `make dev` (mock mode, `http://localhost:3000`, no credentials) or a
live deployment. Response shapes below are the real `CallSummary` / `CallDetail` / `Dashboard`
schemas from `lib/openapi.ts` — see [`api-reference.md`](api-reference.md) for the full contract.

Set a base URL once:

```bash
export BASE=http://localhost:3000
```

## List / search / filter calls

`GET /api/v1/calls` — `q` runs ARAG semantic + keyword search across every transcript; `label`
filters by `labelset/label` (repeatable, ANDed); `agent`, `queue`, `media_type`, `from`/`to`,
`min_duration`/`max_duration`, `complaint`, `fcr`, `escalated` and `lifecycle` filter by the
call's structured attributes; `sort` (`created`, `title`, `duration`, `agent`, `sentiment`,
`compliance`, `csat`) and `order` (`asc`/`desc`) control ordering; `page` / `page_size` (max 200)
paginate. The response carries `facets` (label tallies over the filtered set), `agents` and
`queues` — everything the Calls table's filter bar needs in one request.

```bash
curl -s "$BASE/api/v1/calls?page_size=3" | jq
```

```json
{
  "items": [
    {
      "id": "demo0000000000000000000000000002",
      "slug": "call-billing-complaint-0001",
      "title": "Billing complaint - double-charged premium",
      "icon": "audio/mpeg",
      "mediaType": "audio",
      "createdISO": "2026-06-02T15:12:00Z",
      "durationSec": 62,
      "agentName": "Maria Gonzales",
      "memberId": "IFP-558201",
      "queue": "Billing",
      "status": "PROCESSED",
      "lifecycle": "analysed",
      "labels": [
        { "labelset": "call_reason", "label": "Billing & Payments" },
        { "labelset": "sentiment", "label": "Negative" }
      ],
      "metrics": { "call_reason": "Billing & Payments", "sentiment": "Negative", "complaint": true, "cross_sell_offered": true, "cross_sell_accepted": false, "csat_estimate": 3, "compliance_score": 90, "first_call_resolution": false, "escalated": false },
      "momentTrack": ["", "Complaint", "", "Resolution", "Cross-sell Pitch", "Objection", "", "Next Steps"]
    }
  ],
  "page": 1,
  "page_size": 3,
  "total": 13,
  "next_page": true,
  "facets": [{ "labelset": "sentiment", "label": "Negative", "count": 5 }],
  "agents": ["Maria Gonzales", "Dana Kim"],
  "queues": ["Billing", "Claims"]
}
```

`lifecycle` is one of `queued`, `transcribing`, `labelling`, `partial`, `analysed`, `failed` —
derived from the resource's processing status, the labels actually applied and whether the
generated metrics have arrived; see [`lib/lifecycle.ts`](../../lib/lifecycle.ts).

Full-text search:

```bash
curl -s "$BASE/api/v1/calls?q=duplicate%20charge" | jq '.items[].title'
```

Filter by facet (AND across repeated `label`):

```bash
curl -s "$BASE/api/v1/calls?label=sentiment/Negative&label=disposition_flags/Complaint%20Raised" | jq '.total'
```

TypeScript:

```ts
const res = await fetch(`${BASE}/api/v1/calls?${new URLSearchParams({ q: "premium", page_size: "20" })}`);
const page: { items: CallSummary[]; total: number; next_page: boolean } = await res.json();
```

## Get one call

`GET /api/v1/calls/{id}` returns the full transcript, paragraph list, moment labels and the
generated `analysis` object on top of the summary fields.

```bash
curl -s "$BASE/api/v1/calls/demo0000000000000000000000000002" | jq '{title, fieldId, fieldType, paragraphs: (.paragraphs | length), analysis: .analysis.executive_summary}'
```

```json
{
  "title": "Billing complaint - double-charged premium",
  "fieldId": "media",
  "fieldType": "files",
  "paragraphs": 10,
  "analysis": "The member reported being double-charged for their June premium; the agent verified the duplicate charge, issued a refund and filed a complaint for related overdraft fees."
}
```

One paragraph looks like this (`charStart`/`charEnd` are offsets into `transcriptText`, which is
exactly what an `/ask` citation range indexes into):

```json
{
  "index": 3,
  "text": "You charged my card twice for my June premium. Two hundred and forty dollars, taken out twice.",
  "charStart": 412,
  "charEnd": 508,
  "startSeconds": 18.4,
  "endSeconds": 24.1,
  "kind": "TRANSCRIPT",
  "moments": ["Complaint"],
  "speaker": "Member"
}
```

## Stream media with Range

`GET /api/v1/calls/{id}/media?field=media` proxies the ARAG file field so the service-account
token never reaches the browser, forwarding `Range` for scrubbing. `field` is allowlisted to
`media` (the recording) or `transcript` (a text-resource's raw body); anything else is a `400`.

```bash
curl -s -D- -o /dev/null -H "Range: bytes=0-1023" \
  "$BASE/api/v1/calls/demo0000000000000000000000000002/media?field=media"
```

```
HTTP/1.1 206 Partial Content
Content-Type: audio/mpeg
Content-Range: bytes 0-1023/993184
Accept-Ranges: bytes
```

The demo player just points a native `<audio>`/`<video>` element at this URL:

```tsx
<audio src={`/api/v1/calls/${call.id}/media?field=${call.fieldId}`} controls />
```

## Ask a grounded question (NDJSON stream)

`POST /api/v1/calls/{id}/ask` scopes ARAG's `/ask` to this one call
(`resource_filters:[id]`) and streams the raw NDJSON straight through, then appends one more line
carrying a REMi answer-quality read. `question` must be 3–500 characters
(`CALLS_MAX_QUESTION_CHARS`, default 500).

```bash
curl -N -s -X POST "$BASE/api/v1/calls/demo0000000000000000000000000002/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"Was the member offered anything else?"}'
```

Each line is `{"item": {...}}`. A full response looks like this, in order:

```jsonl
{"item":{"type":"retrieval","results":{"resources":{"demo...0002":{"fields":{"f/media":{"paragraphs":{"...":{"text":"...","position":{"start":412,"end":508}}}}}}}}}}
{"item":{"type":"answer","text":"Yes, "}}
{"item":{"type":"answer","text":"the agent offered the supplemental hospital indemnity plan for $12/month, which the member declined."}}
{"item":{"type":"citations","citations":{"demo0000000000000000000000000002/f/media/701-812":[[13,98]]}}}
{"item":{"type":"metadata","tokens":{"input":842,"output":31}}}
{"item":{"type":"status","code":"0","status":"SUCCESS"}}
{"item":{"type":"quality","answerRelevance":4.2,"groundedness":4.5,"contextRelevance":3.1}}
```

- **`answer`** items arrive incrementally — concatenate `text` across every `answer` item to build
  the full response.
- **`citations`** maps `<resourceId>/f/<fieldId>/<charStart>-<charEnd>` (the *transcript's* char
  range) to a list of `[answerStart, answerEnd]` ranges inside the *answer* text. To resolve a
  citation to a moment: split the key on `/`, take the trailing `start-end`, find the call
  paragraph where `charStart < paragraph.charEnd && charEnd > paragraph.charStart`, and use that
  paragraph's `startSeconds` to seek the player.
- **`quality`** is added by this app, not ARAG — it is the last line, appended server-side after
  the upstream stream finishes (see [ARAG integration](../architecture/arag-integration.md)). It
  is skipped entirely when the answer is a decline ("Not enough data to answer this.") or when the
  best-effort `/predict/remi` call times out (12 s) or fails, so a client must treat it as
  optional.

Consuming it from the browser (this is essentially `components/ChatPanel.tsx`):

```ts
const res = await fetch(`/api/v1/calls/${callId}/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = "", answer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const { item } = JSON.parse(line);
    if (item.type === "answer") answer += item.text ?? "";
    else if (item.type === "citations") { /* map char ranges to paragraphs */ }
    else if (item.type === "quality") { /* upgrade the confidence badge */ }
  }
}
```

## Upload a call and poll its job

`POST /api/v1/calls` is `multipart/form-data`. Provide either a `recording` file (audio/video —
ARAG transcribes it) or a `transcript` text field, plus metadata. Uploading always needs the admin
token or an API key (`Authorization: Bearer $ADMIN_TOKEN` or `X-API-Key: $KEY`) unless the
deployment has neither configured — see [the security model](../architecture/security-model.md).

```bash
curl -s -X POST "$BASE/api/v1/calls" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F title="Prior-auth follow-up" \
  -F agent_name="Dana Kim" \
  -F queue="Prior Authorization" \
  -F transcript="Agent: Thanks for calling...
Member: I'm calling about a denied MRI authorization..."
```

```json
{
  "job": { "id": "job_9f2a...", "kind": "ingest-call", "status": "queued", "progress": 0 },
  "call": { "id": "8b1c...", "title": "Prior-auth follow-up" }
}
```

Response is `202 Accepted` with `Location: /api/v1/calls/{id}`. The resource is created
synchronously (you already have `call.id`); the job just waits for ARAG to finish transcribing
(recordings only) and become searchable. Poll it:

```bash
curl -s "$BASE/api/v1/jobs/job_9f2a..." | jq '{status, stage, progress}'
```

```json
{ "status": "succeeded", "stage": "ready", "progress": 1 }
```

Uploading a recording instead:

```bash
curl -s -X POST "$BASE/api/v1/calls" \
  -F title="Escalated claim dispute" \
  -F queue="Claims" \
  -F "recording=@call.mp3;type=audio/mpeg"
```

Allowed recording MIME types: `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/mp4`,
`audio/ogg`, `audio/webm`, `video/mp4`, `video/webm`, `video/quicktime`. The size cap is a
*setting* — `CALLS_MAX_UPLOAD_BYTES` (default 100 MB) as a boot default, editable in
Settings → Limits and applied per request, backstopped by `MAX_BODY_BYTES`. An oversized or
wrong-type file gets `413`/`415` before anything is created.

## Subscribe to job SSE

`GET /api/v1/jobs/{id}/events` streams `job` and `event` Server-Sent Events until the job reaches
a terminal status, then closes.

```bash
curl -N -s "$BASE/api/v1/jobs/job_9f2a.../events"
```

```
event: job
data: {"id":"job_9f2a...","kind":"ingest-call","status":"running","stage":"process","progress":0.6}

event: event
data: {"ts":"2026-09-12T10:00:01.000Z","stage":"process","status":"ok","ms":842}

event: job
data: {"id":"job_9f2a...","kind":"ingest-call","status":"succeeded","progress":1}
```

```ts
const es = new EventSource(`/api/v1/jobs/${jobId}/events`);
es.addEventListener("job", (e) => {
  const job = JSON.parse((e as MessageEvent).data);
  if (["succeeded", "failed", "cancelled"].includes(job.status)) es.close();
});
```

This is exactly how `app/admin/agents/page.tsx` follows a provisioning job rather than polling.

## Admin: login, health, provision

Admin routes require `ADMIN_TOKEN` as a bearer token or the `arag_admin` cookie issued by login.

```bash
curl -s -X POST "$BASE/api/v1/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"token":"'"$ADMIN_TOKEN"'"}' -c cookies.txt
```

```json
{ "ok": true }
```

Health (KB connection test — a real catalog read plus config):

```bash
curl -s -b cookies.txt "$BASE/api/v1/admin/health" | jq
```

```json
{
  "ok": true,
  "version": "0.1.0",
  "platformVersion": "0.1.0",
  "uptimeSec": 412,
  "mock": true,
  "arag": { "ok": true, "kbId": "mock1234…", "baseUrl": "http://127.0.0.1:54213", "resources": 13, "generativeModel": "chatgpt-azure-4o", "ms": 4 },
  "jobs": { "queued": 0, "running": 0, "failed": 0 },
  "cache": { "entries": 27, "hits": 140, "misses": 27 }
}
```

Or with a bearer token instead of a cookie:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/v1/admin/health"
```

Provision (idempotent — create every labelset, then restart the three data-augmentation agents
one at a time):

```bash
curl -s -X POST "$BASE/api/v1/admin/provision" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"agents": true}'
```

```json
{ "id": "job_prov_1", "kind": "provision", "status": "queued", "progress": 0 }
```

`202 Accepted` with `Location: /api/v1/jobs/{id}` — follow it the same way as the ingest job
above (`GET /api/v1/jobs/{id}` or its `/events` SSE stream).

## Cancel a job

`DELETE /api/v1/jobs/{id}` signals the job's abort controller and marks it cancelled. It needs the
same credential a write does (the admin token or an API key).

```bash
curl -s -X DELETE "$BASE/api/v1/jobs/job_9f2a..." \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '{id, status}'
```

```json
{ "id": "job_9f2a...", "status": "cancelled" }
```

Work already committed upstream is not rolled back: a cancelled ingestion leaves the Knowledge Box
resource it had already created, which the call list then shows as incomplete rather than
pretending it never existed. A job that has already finished returns `409`.

## Scope the dashboard to a date window

`GET /api/v1/dashboard` takes either a named `range` (`7d`, `30d`, `90d`, `12m`, `all` — the
default) or an explicit `from`/`to` pair. `from`/`to` override `range`.

```bash
curl -s "$BASE/api/v1/dashboard?range=30d" | jq '{window, total, withMetrics, fcrRate, complaintRate}'
```

```json
{
  "window": { "range": "30d", "from": "2026-08-15T00:00:00.000Z", "excluded": 9 },
  "total": 4,
  "withMetrics": 4,
  "fcrRate": 0.75,
  "complaintRate": 0.25
}
```

Named windows are resolved on the server and snapped to whole UTC days, so a link reproduces the
dashboard the sender saw and two people opening it four minutes apart share one cache entry.
`window.excluded` is how many calls the window left out, which is what stops an empty dashboard
from being mistaken for no data.

An explicit window:

```bash
curl -s "$BASE/api/v1/dashboard?from=2026-06-01T00:00:00Z&to=2026-06-30T23:59:59Z" | jq '.window'
```

Switching range never costs a second pass over the Knowledge Box: the aggregate is recomputed from
summaries already in the cache.

## Edit a setting

`PUT /api/v1/settings/{section}` — `branding`, `connection`, `limits` or `retention`. Admin token
required. The body is a patch; unknown keys are rejected. The response is the whole settings view.

```bash
curl -s -X PUT "$BASE/api/v1/settings/branding" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productName":"Northwind Call IQ","primaryColor":"#7c3aed"}' \
  | jq '{branding: {productName: .branding.productName, primaryColor: .branding.primaryColor}, overridden}'
```

```json
{
  "branding": { "productName": "Northwind Call IQ", "primaryColor": "#7c3aed" },
  "overridden": ["branding"]
}
```

The change is in force for the very next request — no restart. `overridden` names the sections the
store, rather than the environment, is currently driving.

Reset one section to the values the deployment booted with:

```bash
curl -s -X DELETE "$BASE/api/v1/settings/branding" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.overridden'
```

The public read carries no secrets and needs no credential:

```bash
curl -s "$BASE/api/v1/settings" | jq '{connection, limits, retention, apiKeys}'
```

`connection.apiKey` is write-only and never appears in that response; only `apiKeySet` and
`apiKeyOverridden` booleans do. Sending `"apiKey": ""` leaves the stored credential alone rather
than clearing it.

Uploading a partner logo is a multipart write on the same section:

```bash
curl -s -X POST "$BASE/api/v1/settings/logo" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "logo=@./logo.svg;type=image/svg+xml" | jq '.branding.logoUrl'
```

## Issue and revoke an API key

```bash
curl -s -X POST "$BASE/api/v1/api-keys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Reporting pipeline"}' | jq
```

```json
{
  "key": {
    "id": "0d6b6f2e-…",
    "name": "Reporting pipeline",
    "preview": "ca_live_Qx7mB2Zt…",
    "createdISO": "2026-09-13T09:14:22.031Z",
    "revoked": false,
    "fromEnv": false,
    "createdBy": "operator"
  },
  "secret": "ca_live_Qx7mB2Zt9f…"
}
```

`secret` is returned exactly once: the store keeps only a SHA-256 digest, so the product
physically cannot show it again. Use it as either header:

```bash
curl -s -H "X-API-Key: $KEY" "$BASE/api/v1/calls?page_size=1" | jq '.total'
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/calls?page_size=1" | jq '.total'
```

List, rename and revoke (all admin):

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/v1/api-keys" | jq '.items[] | {name, preview, lastUsedISO, revoked}'

curl -s -X PUT "$BASE/api/v1/api-keys/0d6b6f2e-…" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Reporting pipeline (EU)"}' | jq '.name'

curl -s -X DELETE "$BASE/api/v1/api-keys/0d6b6f2e-…" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.revoked'
```

Revoking marks the row revoked rather than deleting it, so "what did this key touch, and when" is
still answerable. `lastUsedISO` is recorded at most once a minute per key, so a read-only API call
does not become a disk write.

## Create and provision a labelset

```bash
curl -s -X POST "$BASE/api/v1/labelsets" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "id": "ticket_category",
        "title": "Ticket Category",
        "color": "#2563eb",
        "multiple": false,
        "kind": "RESOURCES",
        "labels": [
          { "label": "Access & Accounts",
            "description": "Password resets, MFA, licence and permission requests." },
          { "label": "Hardware",
            "description": "Laptops, peripherals, phones, physical failures." }
        ]
      }' | jq
```

```json
{
  "labelset": { "id": "ticket_category", "title": "Ticket Category", "…": "…" },
  "provisioned": true
}
```

Creating also writes the labelset to the Knowledge Box, so the labeler agent can apply it on its
next run. `provisioned: false` with a `provisionError` means the definition was saved but the
Knowledge Box write failed — re-run it with
`POST /api/v1/labelsets/ticket_category/provision`.

Every label needs a `description`: it is the instruction the agent reads when deciding whether to
apply the label. `id` must match `^[a-z][a-z0-9_]{1,48}$` and a labelset may hold at most 60
labels.

Editing replaces the definition and re-provisions it in the same request. **The path id always
wins over a body id** — a labelset id never changes after creation, because renaming it would
orphan every label already applied in the Knowledge Box under the old one:

```bash
curl -s -X PUT "$BASE/api/v1/labelsets/ticket_category" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d @labelset.json | jq '.provisioned'
```

Deleting removes it from the product's vocabulary. Whether the Knowledge Box also drops it is a
separate, explicit choice:

```bash
# Product only. Analysed calls keep the labels already applied with it.
curl -s -X DELETE "$BASE/api/v1/labelsets/ticket_category" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -o /dev/null -w '%{http_code}\n'

# Also upstream. This DESTROYS the labels already applied to analysed calls.
curl -s -X DELETE "$BASE/api/v1/labelsets/ticket_category?knowledge_box=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -o /dev/null -w '%{http_code}\n'
```

Both return `204`.

## Edit an agent

```bash
curl -s "$BASE/api/v1/agents" | jq '.items[] | {key, type, enabled, state, operations, labelsets}'
```

```json
{ "key": "resource-labeler", "type": "labeler", "enabled": true, "state": "completed", "operations": 5, "labelsets": ["call_reason", "call_outcome", "sentiment", "line_of_business", "disposition_flags"] }
```

A labeler agent's `operations` and `labelsets` are **derived from the current labelsets** on every
read rather than stored, so a labelset edit and the agent that applies it cannot drift apart.

Re-instruct the `call-insights` agent — `prompts` is keyed by the resource field the operation
writes:

```bash
curl -s -X PUT "$BASE/api/v1/agents/call-insights" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"prompts": {"call_metrics": "Return ONLY a JSON object with exactly these keys: …"}}' \
  | jq '.prompts | keys'
```

Disable, start and stop:

```bash
curl -s -X PUT "$BASE/api/v1/agents/paragraph-labeler" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled": false}' | jq '.enabled'

curl -s -X POST "$BASE/api/v1/agents/resource-labeler/start" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '{state, taskId}'

curl -s -X DELETE "$BASE/api/v1/agents/resource-labeler" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.state'
```

A prompt edit takes effect on the **next provision**: the Knowledge Box holds the running task,
and ARAG allows exactly one running task per operation type, so starting an agent that already has
one fails rather than silently queueing a second.

## Save a view of the calls list

A saved view is a name for a calls-list query string, stored on the server and shared by everyone
who can open the deployment.

```bash
curl -s -X POST "$BASE/api/v1/views" \
  -H "Content-Type: application/json" \
  -d '{
        "name": "Escalated complaints",
        "query": "label=disposition_flags/Complaint%20Raised&escalated=true&sort=created&order=desc",
        "description": "Reviewed every morning by the duty supervisor."
      }' | jq
```

```json
{
  "id": "b7c1…",
  "name": "Escalated complaints",
  "query": "label=disposition_flags%2FComplaint+Raised&sort=created&order=desc",
  "href": "/calls?label=disposition_flags%2FComplaint+Raised&sort=created&order=desc",
  "description": "Reviewed every morning by the duty supervisor.",
  "createdISO": "2026-09-13T09:20:10.482Z",
  "createdBy": "session"
}
```

The query is re-parsed through an allowlist on save — only `q`, `label`, `agent`, `queue`,
`media_type`, `lifecycle`, `from`, `to`, `sort`, `order`, `page_size` and `mode` survive, in that
fixed order, so `escalated=true` above is dropped and two people who built the same filter stack
in a different order save the same view. `href` is the link to open it.

```bash
curl -s "$BASE/api/v1/views" | jq '.items[] | {name, href}'

curl -s -X PUT "$BASE/api/v1/views/b7c1…" \
  -H "Content-Type: application/json" \
  -d '{"name":"Escalations — morning review","query":"label=sentiment%2FNegative"}' | jq '.name'

curl -s -X DELETE "$BASE/api/v1/views/b7c1…" -o /dev/null -w '%{http_code}\n'
```

Reading views is public; creating, updating and deleting sit at read-level auth alongside share
links — they write application state only and grant no access the read API does not already give.
The curl above therefore needs no credential on an open deployment; on one with an active API key
add `-H "X-API-Key: $KEY"` (the product UI uses its session cookie instead). At most 100 views,
and names are unique case-insensitively.

Column choice and row density are **not** here: they are per-browser preferences in
`localStorage`, deliberately never in the URL or on the server, so a link someone sends carries
the question rather than the sender's taste in row heights.

## Preview and run a retention purge

```bash
curl -s "$BASE/api/v1/retention/preview?days=90" | jq '{days, enabled, cutoffISO, total, retained}'
```

```json
{
  "days": 90,
  "enabled": false,
  "cutoffISO": "2026-06-15T09:22:41.117Z",
  "total": 6,
  "retained": 18
}
```

The preview is always available, whether or not the policy is enabled, so the consequence of a
policy can be seen before it is saved. `?days=` previews a policy other than the saved one; with
no parameter it uses the saved policy. **`days=0` means no retention limit** and returns no
candidates — the destructive reading of a default-valued field is never the right one.

Saving the policy is a settings write:

```bash
curl -s -X PUT "$BASE/api/v1/settings/retention" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"days": 90, "enabled": true}' | jq '.retention'
```

Nothing is deleted by saving it. **There is no background sweeper**: deletion happens only when
someone runs a purge.

```bash
# Dry run first — the same code path and the same scope, without deleting
curl -s -X POST "$BASE/api/v1/retention/purge" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"dryRun": true}' | jq '{dryRun, deleted: (.deleted | length)}'

# For real
curl -s -X POST "$BASE/api/v1/retention/purge" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{}' | jq '{deleted: (.deleted | length), failed, sharesRevoked}'
```

```json
{ "deleted": 6, "failed": [], "sharesRevoked": 2 }
```

Irreversible: the Knowledge Box resource, its recording and every label and analysis derived from
it are gone. Live share links pointing at a purged call are revoked in the same pass so no URL is
left resolving to nothing. One run deletes at most 200 calls; `ids` narrows a run to specific
calls within the candidate set, and `days` overrides the saved policy for that run.

## Read the audit trail

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE/api/v1/admin/audit?limit=20" | jq '.items[] | {createdAt, actor, action, detail}'
```

```json
{
  "createdAt": "2026-09-13T09:19:02.774Z",
  "actor": "operator",
  "action": "settings.connection",
  "detail": { "apiKey": true, "timeoutMs": 45000 }
}
```

`actor` is `operator`, `api-key:<name>`, `session` or `anonymous`. Secret values are reduced to
`true` — an audit trail that quotes the credential is a second place to leak it. Filter with
`?action=` on an exact action name; the trail is capped at 5,000 records.

## Further reading

- **`/api` in the running product** — every operation below and above, with a try-it form and a
  copyable curl generated from this deployment's own OpenAPI document.
- [Extension points](extension-points.md) — how to add a new route following this same pattern.
- [ARAG integration](../architecture/arag-integration.md) — exactly what each of these calls does
  upstream, and the gotchas behind them.
- [Security model](../architecture/security-model.md) — which credential each operation above
  needs, and why.
- [Limits](../architecture/limits.md) — every numeric bound referenced above.
