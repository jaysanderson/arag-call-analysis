# Call Analysis — Reference Architecture Workshop

**Format:** half day, presenter-led, with four group exercises. **Audience:** solution architects
and technical evaluators, not necessarily hands-on in this codebase. No ARAG credentials needed —
every claim here is checkable against a running sample deployment:

```bash
ARAG_MOCK=1 ADMIN_TOKEN=dev-admin-token DATA_DIR=./data/ws make dev
```

| Segment | Time |
|---|---|
| 1. The ARAG capability map | 15 min |
| 2. How this product composes it | 20 min |
| 3. Service / cache / job layering | 15 min |
| *break* | 10 min |
| 4. [Configuration, cache and sharing](configuration-cache-and-sharing.md) | 45 min |
| 5. Trade-offs: walking `DECISIONS.md` | 20 min |
| *break* | 10 min |
| 6. Whiteboard: ingestion at 50k calls/month | 25 min |
| 7. Failure modes | 15 min |
| 8. [Sizing](sizing-deployment.md) and the [design review](design-review-checklist.md) | 25 min |
| 9. [Knowledge check](knowledge-check.md) | 20 min |

**Total: 3 h 40 including two breaks.** Segments 1–3 are the system; 4 is the module on the three
designs that changed most in the product pass and that a customer's architect will interrogate
hardest; 5–8 are the evaluation.

**What the product is now**, so nobody arrives expecting the June prototype: a signed-in workspace
with one shell for the product and the operator console, a date-scoped dashboard whose every number
drills through, a calls table with facets, sort, saved views, a column picker, bulk actions and a
browse mode, a call workspace with a moments track, transcript, scorecard, cited ask and share
links, an upload pipeline with live progress and history, an editable taxonomy and agent
configuration, a settings area where every setting is editable and persisted, a real API-key store,
retention preview and purge, an audit trail, job cancellation, and an in-product API explorer over
**60 operations in 13 tags**. `DECISIONS.md` runs to D-CA-48.

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

**Dashboard (`/`, `GET /api/v1/dashboard`):**
```
browser → route() → dashboard(rt, window)  [services/dashboard.ts]
            → allSummaries() → catalogIds() + summaryOf(id) per id
                               ── both stale-while-revalidate (see §4)
            → aggregate()  [lib/aggregate.ts — pure, O(N), NOT cached under a key of its own]
```

Point out: the **server-rendered pages and the versioned API call the same service functions**
(`services/calls.ts`, `services/dashboard.ts`, …) — there is exactly one code path that talks to
ARAG (`DECISIONS.md` D-CA-01). A server component and `GET /api/v1/calls` can never drift in what
they show, because they are the same function call.

**And then show where that guarantee stops.** The dashboard's numbers come from `aggregate()`,
which reads each call's `call_metrics` — written by the `call-insights` **ask** agent. Every
drill-through link on that page filters on **labels** — written by the `resource-labeler`
**labeler** agent. Two independent data-augmentation agents answering the same question separately,
with nothing reconciling them. On the sample corpus:

| Tile | Number shown | Calls the drill-through returns |
|---|---|---|
| First-call resolution | 10 of 13 | 3 |
| Complaint rate | 3 of 13 | 0 |
| Cross-sell accepted | **0 of 13** | **10** |

This is a live defect, not a teaching device (`enablement/developer-track/LAB.md`, *Known defects*).
It is the right one to show an architect early, because it is the failure mode of every
click-through dashboard and the lesson generalises: *one query behind the number and the list, or
they will drift.* The product already has the pieces for the stat strip —
`GET /api/v1/calls?complaint=true|fcr=true|escalated=true` filters on the metrics and agrees with
the tiles exactly — so the fix is small and the missing **test** is the real deliverable.

**Whiteboard it:** draw the three box-and-arrow paths above from memory, then check them against
`docs/architecture/architecture.md`'s Mermaid diagram and `docs/architecture/data-flow.md`.

---

## 3. Service / cache / job layering (15 min)

Three layers, each with one job:

1. **`services/*.ts`** — pure-ish domain logic plus the *only* code that calls `rt.arag.*`.
   `services/calls.ts`, `services/dashboard.ts`, `services/labelsets.ts`, `services/agents.ts`,
   `services/ask.ts`, `services/admin.ts`. Route handlers are thin; almost all logic lives here so
   it's unit-testable without HTTP (`test/unit/services.test.ts`).
2. **`services/cache.ts` (`TtlCache`)** — an in-process, namespaced, single-flight TTL cache
   sitting in front of every read, with a **stale-while-revalidate** path for the two hottest read
   models. Not a distributed cache — it lives in the Node process's memory, which matters directly
   for the sizing discussion in §6 and in `sizing-deployment.md`. §4 covers why it changed.
3. **Jobs (`JobManager`, `services/jobs.ts`)** — anything slow or multi-step becomes a job with a
   stable id, pollable status, an SSE progress stream and a **cancel** (`DELETE /api/v1/jobs/{id}`),
   instead of holding an HTTP connection open or, worse, timing out. `ingest-call` waits for
   transcription; `provision` runs labelsets then agents sequentially, respecting the
   one-task-per-type constraint; `reanalyze` and `seed-samples` are the other two.
   Cancellation is **cooperative**: `JobManager.cancel()` aborts a signal and marks the job
   cancelled, and work only actually stops where the job body calls `ctx.check()`. Work already
   committed upstream is **not** rolled back — a cancelled ingestion leaves whatever Knowledge Box
   resource it had created, and the call list shows it as incomplete rather than pretending the
   upload never happened. Say that to a customer before they discover it.
4. **The store (`DATA_DIR`)** — seven JSON collections, and the layer the June prototype did not
   have: `jobs`, `settings`, `apikeys`, `taxonomy`, `views`, `shares`, `audit`. This is the
   deployment's own state, distinct from the Knowledge Box, which still holds every transcript,
   recording and generated analysis. What is in `DATA_DIR` is what a customer loses if they lose
   the volume — configuration, credentials, saved views, live share links and the audit trail; not
   one byte of call content.

**Why this shape, not a queue/worker split:** call volume for a contact-centre analytics tool is
naturally bursty but modest (thousands, not millions, of calls/month per tenant — see
`sizing-deployment.md`), and Fly's `min_machines_running = 1` topology means a single Next.js
process comfortably hosts both the HTTP surface and the in-process job runner
(`JobManager({ concurrency: 2 })`). A separate worker fleet would be over-engineering at this
product's target scale; the trade-off is documented, not accidental (see `DECISIONS.md`).

---

## 4. Configuration, cache and sharing (45 min)

Run [`configuration-cache-and-sharing.md`](configuration-cache-and-sharing.md) here. It is the
module for the three designs a customer's architect will push on hardest — settings as a store
(D-CA-34/35/42/45), the stale-while-revalidate cache and the stall it fixed (D-CA-40), and
share-link security (D-CA-27/38) — and it carries three of the workshop's four group exercises.

---

## 5. Trade-offs made — walk `DECISIONS.md` (20 min)

`DECISIONS.md` now runs to **D-CA-48**. Do not read all of it aloud. Pick the seven below, and for
each ask the room: *what would a customer with 10x the scale, or 10x the compliance requirement,
need to revisit?*

| Decision | The trade |
|---|---|
| **D-CA-13** | Writes need a real credential; the freely-issued demo session cookie never suffices. In production with nothing configured, writes are refused outright rather than defaulting open |
| **D-CA-25** | `lifecycle` is derived on every read, never stored — because ARAG's three signals arrive independently and a stored state can outlive the truth |
| **D-CA-26** | "Re-run analysis" refreshes one call's cached read; it does **not** re-invoke a model per call, because ARAG's agents are Knowledge-Box-wide tasks. The UI copy says so rather than implying otherwise |
| **D-CA-33** | An action the deployment would refuse is not rendered. `canWrite` comes from the server |
| **D-CA-37** | The taxonomy moved from the source tree into an editable store, seeded once. A partner's vocabulary is theirs; the shipped one is a default |
| **D-CA-38** | Retention has no background sweeper. `days: 0` means "no limit", never "delete everything" |
| **D-CA-46** | API-key enforcement is sticky: revoking the last key does not reopen the API |

Two worth dwelling on for the whole group:

- **D-CA-04 + D-CA-40 (in-process cache, 60 s TTL, serve-stale):** fine for one machine; on a
  multi-machine deployment each machine caches independently, so two viewers hitting different
  machines within the same TTL window can see slightly different data — and stale-while-revalidate
  widens that worst case from `ttlMs` to `ttlMs + graceMs` (ten TTLs) on each machine
  independently. Not wrong, but a fact to disclose, with the larger number (see
  `docs/architecture/scaling.md`, `sizing-deployment.md` here, and §4).
- **D-CA-05 (`202` + job for upload):** correct pattern for a slow transcription step, but it means
  "is my call visible yet" is a poll, not an instant read-your-write guarantee against the full
  catalog (individual resource reads by id ARE immediately consistent; the *catalog listing* has
  the cache's staleness window until `invalidateCall()` runs, which it does synchronously on
  upload — but rendering pages already served before that point won't retroactively update).

---

## 6. Whiteboard exercise: "design ingestion for 50,000 calls a month" (25 min)

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

## 7. Failure modes discussion (15 min)

Go around the table; for each failure mode, name where in the code it's already handled and where
it isn't:

| Failure | Handled how | Gap to disclose |
|---|---|---|
| **ARAG 5xx / timeout** | `toHttpError()` maps `AragError` (`kind: "http"`, `kind: "timeout"`) to `502`/`504` problem responses, never leaking the upstream URL; `withRetry()` wraps catalog/summary reads | A sustained ARAG outage still means the product is down for reads — there's no offline/degraded read mode. Say this plainly to a customer evaluating uptime. |
| **REMi (`/predict/remi`) 500 or slow** | Best-effort and time-capped at `REMI_TIMEOUT_MS` (12 s); a failure degrades silently to no quality badge, never blocks the answer itself (`services/ask.ts`) | None — this is by design (`D-CA-09`) and correctly scoped. |
| **Transcription lag** | Tracked as an `ingest-call` job stage (`waitProcessed`, 10-minute timeout), pollable via `GET /api/v1/jobs/{id}` or its SSE stream | A caller who doesn't poll and instead immediately lists calls will see the resource but possibly `status: PENDING` and no metrics yet — correct, but worth setting UX expectations on. |
| **Cache staleness** | Bounded by `CALLS_CACHE_TTL_MS` (60 s default); every write path invalidates outright rather than letting entries age out | With serve-stale (D-CA-40) a reader can be handed a value up to `ttlMs + graceMs` — ten TTLs — old. Multi-machine deployments cache per-machine, so that window applies on each independently. |
| **An operator edits a label description** | The edit is validated, stored, provisioned and audited; nothing is reclassified until the labeler is re-run | There is **no way to test a wording change before it applies**, no evaluation set, and no diff of which calls changed label. On a corpus of thousands this is a one-way door taken blind. The strongest gap in the product for a taxonomy-owning customer. |
| **An operator edits a shipped labelset and wants it back** | — | Nothing. Every settings section has `DELETE /api/v1/settings/{section}`; the taxonomy has no equivalent. `restoreLabelset()` exists in the service layer, unit-tested, unreachable from any route or button. |
| **A share link is created for a sensitive call** | 256-bit token, 1–90 day expiry, revocable, revoked/expired/unknown all return an identical 404, revoked automatically when the call is purged | The token is stored **in plaintext** (it is the document id in `shares.json`), and creation/revocation is **not audited**. On a deployment that enforces API keys, a share link grants access nothing else grants — and the trail cannot say who published it. |
| **A call is deleted** | The Knowledge Box resource, its recording and everything derived from it go; the cache is invalidated | **Not audited.** A retention purge is recorded; the `DELETE /api/v1/calls/{id}` that removes the same recording is not — and it is reachable with an API key, not just the operator token. |
| **A generated field fails its enum/shape check** | `sanitizeMetrics()` drops (not renders) invalid values; `readJsonField()` tries multiple candidate fields and tolerates a code-fenced JSON body | A call whose generated JSON is entirely unparseable simply has no `analysis`/`metrics` — visible in the dashboard's `withMetrics` count, not silently wrong. |

Close with: **what in this table would you put in a customer-facing SLA, and what would you put in
a documented limitation instead?** That is exactly the distinction `design-review-checklist.md`
asks an architect to make explicit before a deployment goes live.

---

## 8. Sizing and the design review (25 min)

Two documents, used differently.

**[`sizing-deployment.md`](sizing-deployment.md)** — walk §1 ("ARAG calls per view") with the
customer's real catalogue size in front of you, then the worked example. The three numbers that
decide a sizing conversation for this product are **catalogue size** (it sets read cost and the
cache-cap conversation), **calls per month** (it sets ingestion concurrency), and **machine count**
(it decides whether three documented per-machine behaviours become the customer's problem).

**[`design-review-checklist.md`](design-review-checklist.md)** — this is not a document to read
aloud. Give each participant a copy and ten minutes on the sections that match their own
deployment, then take the *Known MVP limitations* list as a group and ask, for each: *would this
customer accept it, and does their contract already say something that contradicts it?* Every row
names a file, so every answer is checkable rather than remembered.

**Close the workshop by picking the three limitations you would put on the first slide of a
go-live review for this specific customer.** Different customers should get different threes, and
if they do not, the group has not engaged with the deployment in front of them. For a
contact-centre customer handling PHI the usual three are: the audit trail covers configuration but
not data, share tokens are stored in plaintext, and a taxonomy edit is a one-way door with no
preview.

---

## Read next

- [`configuration-cache-and-sharing.md`](configuration-cache-and-sharing.md) — §4, standalone.
- [`sizing-deployment.md`](sizing-deployment.md), [`design-review-checklist.md`](design-review-checklist.md).
- [`knowledge-check.md`](knowledge-check.md) — 15 questions with answers.
- `enablement/developer-track/LAB.md` — the hands-on half day, if you want to verify any of this
  yourself rather than take it on trust. Its *Known defects and gaps* section is the same list as
  §7's right-hand column, with reproduction steps.
- `DECISIONS.md` (48 entries), `docs/architecture/`, `docs/developer/extension-points.md`.
