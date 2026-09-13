# ARAG integration

This product stores nothing of its own except job bookkeeping (`DATA_DIR`). Every call, label,
transcript, generated analysis and search index lives in one Progress Agentic RAG (ARAG) Knowledge
Box. This page lists exactly which ARAG capabilities are used, how, and the hard-won gotchas
behind each — most of them first documented live in `docs/ARAG_NOTES.md` during the pre-MVP audit
and now encoded as behavior (validation, sequencing, timeouts) rather than just comments.

## Resource create + file-field upload

A call becomes an ARAG resource in `services/calls.ts`'s `createCall`:

1. `POST /resources` creates the resource shell — `title`, `slug`, `icon` (the MIME type),
   `origin` (created/modified timestamps, a `path` derived from the queue, `collaborators`
   carrying the agent name) and `extra.metadata` (agent name, member id, queue, duration,
   `media_type`). A transcript-only call also includes `texts.transcript.body` in this same call.
2. For a recording, `POST /resource/{rid}/file/{field}/upload` (field name `media`) uploads the
   raw bytes with `Content-Type` and `X-FILENAME` (base64-encoded filename) headers. ARAG picks up
   the file asynchronously and transcribes it — the resource moves `PENDING` → `PROCESSED`.

The public `POST /api/v1/calls` route returns as soon as step 1–2 complete (so the caller gets an
id and a `Location` immediately) and hands the slow part to a job (`JOB_INGEST`,
`services/jobs.ts`) that waits for processing and searchability (D-CA-05).

## Transcription with `start_seconds`

Once ARAG finishes processing a file field, `GET /resource/{rid}?extracted=text,metadata` exposes
the transcript as `<field>.extracted.text.text` (the full text) plus
`<field>.extracted.metadata.metadata.paragraphs[]`, each carrying `start`/`end` (character
offsets into the full text), `start_seconds`/`end_seconds` (arrays; this app takes index 0), a
`kind` (`TRANSCRIPT` for media, `TEXT` for text resources, plus noise kinds like `OCR` from video
frame analysis), and any `classifications` applied by the paragraph labeler. `lib/parse.ts`'s
`extractParagraphs` turns this into the `CallParagraph[]` the transcript panel and the media
scrubber both key off — `charStart`/`charEnd` are the same offsets an `/ask` citation range
indexes into, which is what makes citation-to-timestamp resolution possible without a second
lookup.

## Catalog / find

- `POST /catalog` — page through every resource id in the Knowledge Box. `services/calls.ts`'s
  `catalogIds()` calls the vendored `AragClient.listResourceIds({ pageSize: 100, max: 500 })`,
  which pages `/catalog` until it hits 500 ids or the last page — the ceiling behind the "catalog
  walk max 500 resources" limit (see [Limits](limits.md)).
- `POST /find` — semantic + keyword search across every transcript
  (`features: ["keyword", "semantic"]`). `GET /api/v1/calls?q=...` routes here instead of the
  catalog; `searchIds()` returns the matching resource ids, which then go through the same
  per-call summary path as a catalog listing.

Both id lists are cached (`catalog:` / `find:<query>` cache keys) and then resolved to per-call
`CallSummary`s through `summaryOf()`, one `GET /resource/{id}` per call, all cached individually
— this collapsed what the pre-MVP audit measured as roughly 600 ARAG requests per dashboard view
at 200 calls down to one fetch per call per cache window (D-CA-04).

## Labelsets

`PUT /labelset/{id}` (via `AragClient.putLabelset`) creates or replaces a labelset:
`{title, color, multiple, kind: ["RESOURCES"|"PARAGRAPHS"], labels: [{title}]}`. This product
pre-creates every labelset so the facets carry stable, human titles and colours — a labeler agent
would otherwise auto-create the labelset itself, but only with its bare identifier (e.g.
`call_reason`) as the title, which is why provisioning always creates labelsets *before* starting
the agents.

**The definitions come from the product's own store, not from the source tree.**
`lib/domain/taxonomy.ts` seeds `DATA_DIR/taxonomy.json` the first time anything reads it;
`labelsetDefs(rt)` (`services/taxonomy-store.ts`) is what `provisionLabelsets()` iterates, so a
labelset created or edited in the product is what reaches the Knowledge Box (DECISIONS D-CA-37).
There are three ways into `PUT /labelset/{id}`:

| Product operation | Upstream effect |
|---|---|
| `POST /api/v1/labelsets` | Saves the definition and writes that one labelset upstream in the same request |
| `PUT /api/v1/labelsets/{id}` | Replaces the definition and re-provisions it, so the store and the Knowledge Box cannot drift apart |
| `POST /api/v1/labelsets/{id}/provision` | Writes one existing definition upstream, for when an earlier write failed |
| `POST /api/v1/admin/provision` | Writes *every* definition in the store, then restarts the enabled agents |

Each of these deletes the cached `labelsets:all` entry immediately. Without that, a labelset
created a second ago reads back as "not provisioned" for the rest of the cache window and the
Taxonomy screen contradicts the request that had just succeeded.

Deleting is deliberately asymmetric. `DELETE /api/v1/labelsets/{id}` removes the definition from
the product's vocabulary and leaves the Knowledge Box alone; `?knowledge_box=true` additionally
calls `DELETE /labelset/{id}` upstream, which removes the labels already applied to analysed
calls. Those labels are data, not configuration, so the upstream delete is never the default. The
upstream call tolerates a 404 — a labelset the Knowledge Box never had is already in the state the
caller asked for.

## Data-augmentation `labeler` (resource `on:1` and paragraph `on:0`)

Two `labeler` tasks classify every call:

- **`resource-labeler`** (`on: 1`) — classifies the whole call into five resource-level
  labelsets (call reason, outcome, sentiment, line of business, disposition flags). Results land
  in `computedmetadata.field_classifications[].classifications[]` on the resource, which
  `lib/parse.ts`'s `extractLabels` reads.
- **`paragraph-labeler`** (`on: 0`) — tags individual transcript paragraphs with "moment" labels
  (Complaint, Escalation, Cross-sell Pitch, Compliance Disclosure, Sensitive/PII, ...). Results
  land per-paragraph as `classifications[].label`, which both the transcript's moment filter chips
  and the card thumbnail's per-call "moment map" (`extractMomentTrack`) read directly from data
  already fetched for the summary — no extra ARAG call.

Both are `POST /task/start` with `{name: "labeler", parameters: {name, on, operations: [{label:
{ident, description, multiple, labels}}], llm}}`. `ident` on a `label` operation *names* the
labelset the agent writes into (auto-creating it if it doesn't already exist, hence provisioning
labelsets first).

**A labeler's `operations` array is derived, not stored.** `agentConfigs()`
(`services/taxonomy-store.ts`) rebuilds it from the *current* labelsets on every read: the
resource-level sets for `resource-labeler`, the paragraph-level ones for `paragraph-labeler`, each
turned into a `label` operation whose `ident` is the labelset id, whose `description` is generated
from the labelset's title and its `multiple` flag, and whose `labels[]` carry each label's own
`description` and `examples`. Nothing in the store holds a second copy, which is what stops a
labelset edit and the agent that applies it from drifting apart (DECISIONS D-CA-37).

The same function applies the operator's own edits: `enabled: false` forces the task's `on`
parameter to `0`, a `model` override replaces the `llm` block's model, and for the `ask` agent a
`prompts` override replaces the `question` of the operation writing that destination field.

## `ask` agents writing `da-call_analysis-*`/`da-call_metrics-*`

One `ask`-type task (`call-insights`, `on: 1`) with two operations writes the structured fields
the detail page and dashboard read:

- `{ask: {question: ANALYSIS_PROMPT, destination: "call_analysis", json: false}}`
- `{ask: {question: METRICS_PROMPT, destination: "call_metrics", json: false}}`

Both operations live in **one** task rather than two, because ARAG allows only one *running* task
per operation type at a time — two separate `ask` tasks would collide (`422 Already running an
operation of type ...`). The generated output is stored as a text field named
`da-<destination>-<f|t>-<sourceField>` (e.g. `da-call_analysis-f-media`); `lib/parse.ts`'s
`readJsonField` finds it by substring match on `destination`, strips a possible ```` ```json ````
code fence, and `JSON.parse`s it.

## Scoped `/ask` with `resource_filters` + `citations`

The chat panel calls the **Knowledge Box** `/ask` (`POST /ask`, `services/ask.ts`'s `askCall`),
not `/resource/{id}/ask` — the latter was confirmed live to return no retrieval data on this KB
(`docs/ARAG_NOTES.md`). Instead every question is scoped with
`resource_filters: [callId]`, `citations: true`, `features: ["keyword", "semantic"]`, `top_k: 8`,
and the configured `generative_model`/`reranker`. The raw upstream NDJSON body is piped straight
to the client unchanged (so the answer still renders token by token) while the same bytes are
tapped server-side to accumulate the full answer text and every retrieved paragraph.

## Citation-key -> paragraph -> timestamp mapping

A citation entry's key has the shape `<resourceId>/<f|a|t|u>/<fieldName>/<charStart>-<charEnd>`,
mapping to `[[answerStart, answerEnd], ...]` — ranges *inside the answer text*, not the source. To
turn a clicked citation into a media seek: parse the trailing `start-end` off the key, find the
`CallParagraph` where `charStart < paragraph.charEnd && charEnd > paragraph.charStart` (the same
char-offset space `extractParagraphs` produced), and seek the player to that paragraph's
`startSeconds` (`components/CallDetailView.tsx`'s `resolveCitation`). Citations on a different
field than the call's own transcript field are deliberately ignored (their char ranges would
otherwise collide with unrelated offsets).

## `/predict/remi`

After the upstream `/ask` stream ends, `services/ask.ts` scores the finished answer with
`POST /predict/remi` (`{user_id, question, answer, contexts}`, where `contexts` is every
retrieved paragraph's text, not just the cited ones) and appends one extra NDJSON line —
`{"item":{"type":"quality",...}}` — carrying `answerRelevance`, `groundedness` and
`contextRelevance` (0–5 scale). This is best-effort and time-capped at 12 s
(`REMI_TIMEOUT_MS`); a slow or failed call simply means the client never sees the `quality` line
and falls back to its own citation-coverage floor (`lib/confidence.ts`'s `deriveConfidence`).

## File download with Range

`GET /resource/{rid}/file/{field}/download/field` streams the raw bytes; the media proxy
(`app/api/v1/calls/{id}/media/route.ts`) forwards the client's `Range` header verbatim so the
player can scrub without downloading the whole file, and passes through
`content-type`/`content-range`/`accept-ranges`/`etag`/`last-modified` from the upstream response.

## What the product controls upstream, and what it does not

The line matters, because a settings screen that appears to change the Knowledge Box but does not
is worse than one that admits the limit.

**The product writes these upstream:**

| Product action | ARAG call |
|---|---|
| Upload a call | `POST /resources`, then `POST /resource/{rid}/file/media/upload` |
| Delete a call, or purge under retention | `DELETE /resource/{rid}` |
| Create, edit or provision a labelset | `PUT /labelset/{id}` |
| Delete a labelset with `?knowledge_box=true` | `DELETE /labelset/{id}` |
| Start an agent, or re-provision | `POST /task/start` |
| Stop an agent, or re-provision | `DELETE /task/{id}` |
| Ask a question | `POST /ask`, then `POST /predict/remi` |
| Search, list, read a call | `POST /find`, `POST /catalog`, `GET /resource/{rid}` |

**The product does not control these, and the UI does not pretend otherwise:**

- **Which Knowledge Box exists, or its plan, quota and zone.** Settings → Connection re-points the
  client at a Knowledge Box that already exists; it does not create one. A `kbId`, a token and
  either a region or a base URL must all resolve before the client is rebuilt at all — an
  incomplete connection patch is stored and the existing client is left running.
- **The generative model catalogue.** `generativeModel` is passed through to `/ask` and into every
  agent's `llm` block. The product does not enumerate or validate the available models; an
  unrecognised value fails upstream, not here. An empty value means "the Knowledge Box default".
- **Task scheduling.** ARAG owns the running task. The product can start one, stop one, and read
  the `configs`/`running`/`done` buckets — it cannot queue one, prioritise one, or run two of the
  same operation type. This is why an agent edit takes effect on the *next* provision rather than
  immediately, and why `POST /api/v1/agents/{key}/start` fails rather than queueing when a task of
  that type is already running.
- **Re-analysis of existing resources when the taxonomy changes.** Starting an agent runs it over
  whatever is in the Knowledge Box at that moment; there is no upstream "re-label these specific
  resources" call. A labelset edit therefore changes how *subsequent* runs classify, and existing
  calls keep their old labels until an agent passes over them again.
- **Labels already applied.** Removing a labelset from the product's vocabulary does not remove
  the labels; removing it from the Knowledge Box does, irreversibly.
- **Transcription itself.** ARAG decides when a resource moves `PENDING` → `PROCESSED` and when it
  becomes searchable. The product polls; `ARAG_TIMEOUT_MS` (editable as `connection.timeoutMs`)
  bounds a single request, not the transcription.

## Gotchas (the hard-won parts)

- **One running task per operation type.** Two `label` tasks or two `ask` tasks cannot run
  concurrently — ARAG returns `422`. This is why the two JSON generators share one `ask` task
  (two operations) and why provisioning (`services/jobs.ts`'s `JOB_PROVISION`) starts each agent
  and then calls `waitTasksIdle()` before starting the next, rather than firing all three at once.
- **The `llm` block is required.** A data-augmentation task started without
  `{model, provider: "openai"}` fails silently (`failed: true` with no obvious error) rather than
  using a default. `AGENT_LLM` in `lib/domain/taxonomy.ts` is injected into every agent
  definition for exactly this reason — never construct a task's parameters by hand without it.
- **`answer_json_schema` and `citations` are mutually exclusive.** ARAG rejects requesting both on
  one `/ask` call; the vendored `AragClient.askStream` drops `citations` automatically when
  `answer_json_schema` is set. This product never uses `answer_json_schema` (it needs citations
  for the click-to-scrub feature), which is also why generated fields are produced as *prompted*
  JSON text rather than schema-validated structured output.
- **Generated fields are parsed as text, not native JSON.** The KV schema registry
  (`/models/kv_schema`) returned 404 on `POST` and 500 on `GET` for every shape tried against this
  platform, so `json: true` (which requires a registered schema) is not used. Every generated
  field is `json: false` with the JSON shape spelled out in the prompt, and parsed server-side
  (`readJsonField`, with code-fence stripping) — which means a model can occasionally return prose
  where an enum value was requested. `sanitizeMetrics` (`lib/parse.ts`) validates every metrics
  field against its taxonomy enum before it reaches a chart; a value that fails validation is
  dropped, not rendered. This is not hypothetical: the pre-MVP audit found "Not enough data to
  answer this." rendered as a line-of-business chart category before this validation existed.
- **PROCESSED precedes searchable.** A resource can report `metadata.status: PROCESSED` seconds
  before `/find` can actually retrieve it. `waitProcessed()` and `waitSearchable()` are two
  separate polls for exactly this reason (`services/jobs.ts`'s ingest job runs both, the second
  as a soft/best-effort stage so an upload never hard-fails just because indexing lagged slightly).
- **REMi scores a refusal as confident.** `/predict/remi` measures the retrieved context's
  topical relevance to the question, not whether the model actually answered it — it reproducibly
  scored ARAG's own honest decline text ("Not enough data to answer this.") as high confidence in
  the pre-MVP audit. `services/ask.ts` skips the REMi call entirely when the answer matches
  `isDeclinedAnswer()` (`lib/confidence.ts`), and the client independently suppresses the badge on
  a decline even if a quality event somehow still arrived (D-CA-09).
