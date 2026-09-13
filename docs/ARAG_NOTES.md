# ARAG / Nuclia — confirmed API mechanics for this app

Base: `https://aws-us-east-2-1.dp.progress.cloud/api/v1`
KB:   `/kb/550da8b5-dbf2-4f45-9277-f75ae33ec738`
Auth: header `X-NUCLIA-SERVICEACCOUNT: Bearer <service-account-key>`

All paths below are relative to the KB URL unless noted.

## Confirmed live (probed)

### Labelsets
- `POST /labelset/{id}` body:
  ```json
  { "title": "Call Reason", "color": "#2563eb", "multiple": false,
    "kind": ["RESOURCES"], "labels": [{ "title": "Claims" }, ...] }
  ```
  `kind`: `["RESOURCES"]` for resource labels, `["PARAGRAPHS"]` for paragraph labels.
- `GET /labelsets` → `{ uuid, labelsets: { <id>: {title,color,multiple,kind,labels:[{title,...}]} } }`
- `DELETE /labelset/{id}`

### Data augmentation agents ("tasks")
- `GET /tasks` → `{ tasks: [available types...], configs, running, done }`.
  Types: `labeler`, `ask`, `qa`, `llm-graph`, `synthetic-questions`, `llm-align`,
  `llama-guard`, `prompt-guard`, `memory`.
- `POST /task/start` body `{ "name": "<type>", "parameters": {...} }` →
  `{ "name", "status": "started", "id": "<task-id>" }`.
- `DELETE /task/{task-id}` stops/removes a task (200). (`/task/stop` is NOT a route.)
- Task `parameters` core fields: `name`, `on` (0=paragraphs, 1=whole field/resource),
  `operations[]`, optional `filter`, optional `llm` (omit → managed default LLM).
- `Operation` is one of: `graph | label | ask | qa | extract | prompt_guard | llama_guard | memory`.
  - **label**: `{ ident, description, multiple, labels:[{label,description,examples}] }`.
    `ident` NAMES the labelset the agent writes to (auto-creates if missing).
  - **ask**: `{ question, user_prompt ({context} placeholder), destination, json,
    store_as_key_value, kv_schema_id }`. `json:true` → JSON output into `destination`.

### Resources
- `POST /resources` create. Body: `title`, `slug`, `icon` (mime), `origin{created,modified,path,tags,collaborators}`,
  `extra{metadata:{...}}`, plus content: `texts{<field>:{body,format:"PLAIN"}}` for text.
  → `{ uuid }`.
- `POST /resource/{rid}/file/{field}/upload` — raw bytes body, headers
  `Content-Type: <mime>`, `X-FILENAME: <base64(filename)>`, `X-LANGUAGE: en`. (Verified: audio/video upload works, resource goes PENDING→PROCESSED.)
- `GET /resource/{rid}?show=basic,values,extracted,origin,extra&extracted=text,metadata`
- `DELETE /resource/{rid}`
- `GET /catalog?page_size=N` → `{ resources: { <id>: {...} }, ... }` (resource browsing).
- Processing status at `metadata.status` = `PENDING` | `PROCESSED` | `ERROR`.

### Media file download (for the player proxy)
- `GET /resource/{rid}/file/{field}/download/field` (forwards Range for scrubbing).

## Decisions / fallbacks
- **KV schema registry** (`/models/kv_schema`) returned 404 on POST / 500 on GET for every
  shape tried. So the **aggregatable JSON** is produced as a plain `ask` op with `json:true`
  into a `call_metrics` field; the dashboard reads each resource's `call_metrics` and
  aggregates server-side. (Native KV aggregation can be revisited if the endpoint is clarified.)
- **LLM**: agents started WITHOUT an `llm` block ran fine → managed default LLM is available.

## Confirmed from the Phase-0 slice (all green)

### Augmentation agents — gotchas (hard-won)
- Agents REQUIRE an `llm` block: `{"model":"chatgpt-azure-4o","provider":"openai"}` (the KB's
  managed model; no BYO key). Without it the task silently `failed:true`.
- Only ONE running task per operation type. Two `label` tasks or two `ask` tasks at once → 422
  "Already running an operation of type ...". → Run agents SEQUENTIALLY (start, wait until
  `/tasks.running` empty, then next). The two JSON generators live in ONE `ask` task (2 ops).
- `ask` op: `question` is REQUIRED. If you also pass `user_prompt`, it must contain `{question}`.
  Simplest: put the full instruction in `question`, omit `user_prompt` (default injects `{context}`).
- `json:true` needs a registered KV schema (`/models/kv_schema` unavailable here → 404/500). So
  we use `json:false` and instruct the model to emit JSON text; we parse the field in the app.
- Task lifecycle: started → `configs`+`running` → `done` (`failed`/`completed` flags). `DELETE /task/{id}` removes it.

### Transcription + timestamps (verified)
- Content field: file resources `data.files.media`, text resources `data.texts.transcript`.
- Extracted text: `<field>.extracted.text.text`. Paragraphs:
  `<field>.extracted.metadata.metadata.paragraphs[]` = `{start,end,start_seconds:[s],end_seconds:[s],kind,classifications}`.
- Media paragraphs carry `start_seconds`/`end_seconds` → drives video/audio scrubbing. `kind`:
  `TRANSCRIPT` (media) / `TEXT` (text). Filter out `OCR` (waveform-frame noise from MP4).

### Labels (verified)
- Resource labels (resource-labeler, on=1): `computedmetadata.field_classifications[].classifications[]`
  = `{labelset,label}`. Also queryable via catalog facets `/classification.labels/<labelset>`.
- Paragraph labels (paragraph-labeler, on=0): on each paragraph as `classifications[].label`
  (labelset "moment"). Media transcripts get fewer (coarser chunking) than text transcripts.

### Generated JSON fields (verified)
- Stored as TEXT fields named `da-<destination>-<f|t>-<sourceField>`
  (e.g. `da-call_analysis-f-media`, `da-call_metrics-t-transcript`). Body is ```json-fenced
  JSON (json:false) → strip fence + `JSON.parse`. Content is accurate.

### Scoped ask + citations (verified)
- `/resource/{id}/ask` returns NO retrieval data on this KB. Use KB `/ask` with
  `resource_filters:[rid]`, `citations:true`, `generative_model:"chatgpt-azure-4o"`.
- Citations: `{ "<rid>/f/media/<start>-<end>": [[answerStart,answerEnd]] }`. The char range maps
  to a paragraph (overlap on charStart/charEnd) → `start_seconds` → seek the player.
