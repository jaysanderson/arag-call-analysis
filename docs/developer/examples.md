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
filters by `labelset/label` (repeatable, ANDed); `page` / `page_size` (max 200) paginate.

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
  "next_page": true
}
```

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
`audio/ogg`, `audio/webm`, `video/mp4`, `video/webm`, `video/quicktime`. Max 100 MB
(`MAX_BODY_BYTES`); an oversized or wrong-type file gets `413`/`415` before anything is created.

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

## Further reading

- [Extension points](extension-points.md) — how to add a new route following this same pattern.
- [ARAG integration](../architecture/arag-integration.md) — exactly what each of these calls does
  upstream, and the gotchas behind them.
- [Limits](../architecture/limits.md) — every numeric bound referenced above.
