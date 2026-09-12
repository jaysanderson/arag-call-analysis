# Call Analysis — Reference Architecture Workshop

**Time:** 90 minutes. **Audience:** solution architects and technical evaluators, not necessarily
hands-on in this codebase. **Format:** presenter-led with two group exercises. No ARAG credentials
needed — every claim here can be verified against the running mock (`make dev`, `ARAG_MOCK=1`).

| Segment | Time |
|---|---|
| 1. The ARAG capability map | 15 min |
| 2. How this product composes it | 20 min |
| 3. Service / cache / job layering | 15 min |
| 4. Trade-offs made (walk `DECISIONS.md`) | 10 min |
| 5. Whiteboard exercise: ingestion at 50k calls/month | 20 min |
| 6. Failure modes discussion | 10 min |

---

## 1. The ARAG capability map (15 min)

Progress Agentic RAG (ARAG / Nuclia) exposes a Knowledge Box (KB) as the unit of tenancy. This
product's `vendor/arag-platform/src/arag/client.ts` (`AragClient`) wraps the KB's HTTP surface;
every method below is something Call Analysis actually calls, at least once, in `services/*.ts`:

| Capability | ARAG surface | Used for |
|---|---|---|
| **Resource CRUD** | `createResource`, `getResource`, `deleteResource` | One call recording/transcript = one KB resource |
| **File fields** | `uploadFileField`, `downloadFileField` (Range-aware) | Recording upload; media-player streaming proxy |
| **Processing state** | `status`, `waitProcessed`, `isSearchable`, `waitSearchable` | Transcription completion, tracked as a job stage |
| **Catalog & search** | `listResourceIds` (via `catalog`), `find` (keyword + semantic) | The calls list, with and without a query |
| **Labelsets** | `listLabelsets`, `putLabelset`, `deleteLabelset` | The taxonomy: call reason, outcome, sentiment, disposition flags, per-paragraph "moments" |
| **Data augmentation (tasks)** | `listTasks`, `startTask`, `deleteTask`, `waitTasksIdle` | `resource-labeler` (whole-call classification), `paragraph-labeler` (moment tagging), `call-insights` (generated JSON analysis + metrics) |
| **Grounded QA** | `askStream` (NDJSON) scoped with `resource_filters:[id]`, citations | "Ask this call" chat, answers restricted to one call's own transcript |
| **Answer quality** | `remi` (`/predict/remi`) | Post-hoc relevance/groundedness scoring appended to the ask stream |
| **Health/config** | `health`, `getConfiguration`, `getSchema` | Admin panel's KB connection test |

**Key constraint to internalise before the rest of the workshop:** ARAG allows only **one running
task per operation type** at a time. Two `labeler` tasks running concurrently (or two `ask` tasks)
returns `422`. This is why this product's three agents are started sequentially and why
provisioning is a background job, not a synchronous request (`services/jobs.ts`, `JOB_PROVISION`).

**Discussion prompt:** which of these capabilities would a *different* document type (contracts,
support tickets, product manuals) reuse unchanged, and which are call-analysis-specific? (Answer to
draw out: resource CRUD, catalog/find, labelsets, tasks and ask/remi are all generic KB
capabilities — what's call-analysis-specific is *the taxonomy content* in
`lib/domain/taxonomy.ts` and the paragraph-to-timestamp mapping that drives media scrubbing.)

---

## 2. How this product composes it (20 min)

Walk the request path for the two highest-value screens, on the whiteboard or the live mock:

**Calls list (`/calls`, `GET /api/v1/calls`):**
```
browser → route() [lib/api.ts: auth, rate limit, validate]
        → listCalls() [services/calls.ts]
            → catalogIds() ── cached, catalog: namespace ── rt.arag.listResourceIds()
            → summaryOf(id) per id ── cached, summary: namespace ── rt.arag.getResource()
            → filterByLabels() [pure, in-process]
```

**Call detail chat (`POST /api/v1/calls/{id}/ask`):**
```
browser → route() → getCall() [404 pre-check, cached]
                   → askCall() [services/ask.ts]
                       → rt.arag.askStream() ── NDJSON, forwarded byte-for-byte to the client
                       → (tapped) once the stream ends: rt.arag.remi() ── best-effort, 12s cap
                       → one extra {"item":{"type":"quality",...}} line appended
```

Point out: the **server-rendered pages and the versioned API call the same service functions**
(`services/calls.ts`, `services/dashboard.ts`, …) — there is exactly one code path that talks to
ARAG (`DECISIONS.md` D-CA-01). A server component and `GET /api/v1/calls` can never drift in what
they show, because they're the same function call.

**Whiteboard it:** draw the box-and-arrow diagram above from memory, then check it against
`docs/architecture/architecture.md`'s Mermaid diagram once that's published.

---

## 3. Service / cache / job layering (15 min)

Three layers, each with one job:

1. **`services/*.ts`** — pure-ish domain logic plus the *only* code that calls `rt.arag.*`.
   `services/calls.ts`, `services/dashboard.ts`, `services/labelsets.ts`, `services/agents.ts`,
   `services/ask.ts`, `services/admin.ts`. Route handlers are thin; almost all logic lives here so
   it's unit-testable without HTTP (`test/unit/services.test.ts`).
2. **`services/cache.ts` (`TtlCache`)** — an in-process, namespaced, single-flight TTL cache
   sitting in front of every read. Not a distributed cache — it lives in the Node process's
   memory, which matters directly for the sizing discussion in section 5 and in
   `sizing-deployment.md`.
3. **Jobs (`JobManager`, `services/jobs.ts`)** — anything slow or multi-step becomes a job with a
   stable id, pollable status, and an SSE progress stream, instead of holding an HTTP connection
   open or, worse, timing out. Two jobs exist: `ingest-call` (waits for transcription) and
   `provision` (labelsets, then agents sequentially, respecting the one-task-per-type constraint).

**Why this shape, not a queue/worker split:** call volume for a contact-centre analytics tool is
naturally bursty but modest (thousands, not millions, of calls/month per tenant — see
`sizing-deployment.md`), and Fly's `min_machines_running = 1` topology means a single Next.js
process comfortably hosts both the HTTP surface and the in-process job runner
(`JobManager({ concurrency: 2 })`). A separate worker fleet would be over-engineering at this
product's target scale; the trade-off is documented, not accidental (see `DECISIONS.md`).

---

## 4. Trade-offs made — walk `DECISIONS.md` (10 min)

Read `DECISIONS.md` D-CA-01 through D-CA-11 as a group (it's short — eleven rows). For each,
answer out loud: *what would a customer with 10x the scale, or 10x the compliance requirements,
need to revisit?* Two worth dwelling on:

- **D-CA-04 (in-process cache, 60 s TTL):** fine for one machine; on a multi-machine deployment
  each machine caches independently, so two viewers hitting different machines within the same TTL
  window can see slightly different data. Not wrong, but a fact to disclose (see
  `docs/architecture/scaling.md` once published, and `sizing-deployment.md` here).
- **D-CA-05 (`202` + job for upload):** correct pattern for a slow transcription step, but it means
  "is my call visible yet" is a poll, not an instant read-your-write guarantee against the full
  catalog (individual resource reads by id ARE immediately consistent; the *catalog listing* has
  the cache's staleness window until `invalidateCall()` runs, which it does synchronously on
  upload — but rendering pages already served before that point won't retroactively update).

---

## 5. Whiteboard exercise: "design ingestion for 50,000 calls a month" (20 min)

Split into pairs or small groups. Starting point: this repo's current shape (single Fly machine,
in-process job runner, in-process cache, `DATA_DIR` on a mounted volume for job records). 50,000
calls/month is roughly 1,650/day, ~70/hour at an even rate — but contact-centre volume is not even;
assume a 5x peak-to-average ratio (∼350/hour at peak).

Each group should produce answers to:

1. **Where is the bottleneck first?** (Expect: the synchronous part of `POST /api/v1/calls` is
   fast — it's one `createResource` + one `uploadFileField` call; the slow part, transcription, is
   already a job and off the request path. The more likely first bottleneck is `JobManager`'s
   `concurrency: 2` — at peak, ingestion jobs queue.)
2. **What breaks first if you just raise `concurrency`?** (Expect: ARAG's own one-running-task-
   per-operation-type limit doesn't apply to ingestion — waiting for transcription isn't a "task,"
   it's a resource-status poll — so raising ingestion job concurrency is mostly safe up to ARAG's
   own rate limits and the Fly machine's CPU/memory. The real constraint becomes `MAX_BODY_BYTES`
   × concurrent uploads on machine memory and network egress.)
3. **Does the in-process cache still make sense?** (Expect: yes for reads at this scale — a 60 s
   TTL cache in front of a catalog of tens of thousands of resources still collapses N+1 fetches
   the same way; the question is whether one machine's memory holds it, which it does — `TtlCache`
   caps at 2,000 entries with LRU-ish eviction by insertion order.)
4. **Where would you add a second machine, and what changes?** (Expect: `fly.toml`'s
   `min_machines_running` goes up; each machine gets its own cache and its own `JobManager`, so
   `DATA_DIR` — currently a single Fly volume — needs to become either a shared/attached volume per
   machine or, more robustly, the job store moves to a shared backend. This is a genuine MVP
   limitation to name explicitly, not paper over — see `design-review-checklist.md`.)
5. **What would you tell a customer about data residency and multi-region at this volume?** (Expect:
   the KB region (`ARAG_REGION`) and the Fly `primary_region` should be co-located — this repo's
   `fly.toml` already documents that reasoning in its header comment. 50k calls/month for a single
   region is well within normal KB scale; multi-region would be a data-residency requirement, not
   a throughput one.)

Have each group present their answer to (4) — it's the one with the most legitimate disagreement.

---

## 6. Failure modes discussion (10 min)

Go around the table; for each failure mode, name where in the code it's already handled and where
it isn't:

| Failure | Handled how | Gap to disclose |
|---|---|---|
| **ARAG 5xx / timeout** | `toHttpError()` maps `AragError` (`kind: "http"`, `kind: "timeout"`) to `502`/`504` problem responses, never leaking the upstream URL; `withRetry()` wraps catalog/summary reads | A sustained ARAG outage still means the product is down for reads — there's no offline/degraded read mode. Say this plainly to a customer evaluating uptime. |
| **REMi (`/predict/remi`) 500 or slow** | Best-effort and time-capped at `REMI_TIMEOUT_MS` (12 s); a failure degrades silently to no quality badge, never blocks the answer itself (`services/ask.ts`) | None — this is by design (`D-CA-09`) and correctly scoped. |
| **Transcription lag** | Tracked as an `ingest-call` job stage (`waitProcessed`, 10-minute timeout), pollable via `GET /api/v1/jobs/{id}` or its SSE stream | A caller who doesn't poll and instead immediately lists calls will see the resource but possibly `status: PENDING` and no metrics yet — correct, but worth setting UX expectations on. |
| **Cache staleness** | Bounded by `CALLS_CACHE_TTL_MS` (60 s default); write paths invalidate immediately | Multi-machine deployments cache per-machine (see section 4) — different viewers can see different data within the TTL window across machines. |
| **A generated field fails its enum/shape check** | `sanitizeMetrics()` drops (not renders) invalid values; `readJsonField()` tries multiple candidate fields and tolerates a code-fenced JSON body | A call whose generated JSON is entirely unparseable simply has no `analysis`/`metrics` — visible in the dashboard's `withMetrics` count, not silently wrong. |

Close with: **what in this table would you put in a customer-facing SLA, and what would you put in
a documented limitation instead?** That's exactly the distinction `design-review-checklist.md`
asks an architect to make explicit before a deployment goes live.
