# Data flow

## Upload -> resource -> transcription -> agents -> labels/metrics/analysis -> dashboard

```mermaid
sequenceDiagram
    actor Caller
    participant API as POST /api/v1/calls
    participant Svc as services/calls.ts
    participant Job as JobManager (ingest-call)
    participant ARAG as Progress Agentic RAG
    participant Admin as POST /api/v1/admin/provision
    participant Dash as GET /api/v1/dashboard

    Caller->>API: multipart (title + recording|transcript)
    API->>Svc: createCall()
    Svc->>ARAG: POST /resources
    ARAG-->>Svc: { uuid }
    opt recording uploaded
        Svc->>ARAG: POST /resource/{uuid}/file/media/upload
    end
    Svc-->>API: callId
    API->>Job: submit(ingest-call, {callId, transcribed})
    API-->>Caller: 202 { job, call: {id, title} }

    Job->>ARAG: poll GET /resource/{uuid} until PROCESSED
    Note over ARAG: transcription: paragraphs +<br/>start_seconds/end_seconds
    Job->>ARAG: poll /find (waitSearchable)
    Job-->>Caller: (via GET /jobs/{id} or SSE) succeeded

    Note over Admin: separately, provisioning (idempotent,<br/>re-run any time)
    Admin->>ARAG: PUT /labelset/{id} × 6 (taxonomy)
    Admin->>ARAG: POST /task/start (resource-labeler, on=1)
    Admin->>ARAG: wait tasks idle
    Admin->>ARAG: POST /task/start (paragraph-labeler, on=0)
    Admin->>ARAG: wait tasks idle
    Admin->>ARAG: POST /task/start (call-insights ask, on=1)
    Note over ARAG: writes computedmetadata.field_classifications,<br/>paragraph classifications,<br/>da-call_analysis-*, da-call_metrics-*

    Caller->>Dash: GET /api/v1/dashboard
    Dash->>Svc: allSummaries() (cached, TTL 60s)
    Svc->>ARAG: GET /resource/{id} per call (cache miss only)
    ARAG-->>Svc: labels + call_metrics field
    Svc-->>Dash: CallSummary[]
    Dash-->>Caller: aggregated KPIs + charts
```

Two things worth noting that aren't obvious from the diagram: the resource is created and
returned to the caller **synchronously** (step 1–4) — the job only tracks the slow part
(transcription and searchability) — and provisioning is a separate, idempotent, re-runnable flow
from ingestion: uploading a call does not itself run the agents over it. Agents run over whatever
resources exist in the Knowledge Box at the moment they are started, so a freshly uploaded call
only gets labels/analysis after a provisioning run (or, in mock mode, the agents that ran once at
boot over the seeded calls).

## A question -> scoped ask -> NDJSON -> citations -> transcript paragraph -> media scrub

```mermaid
sequenceDiagram
    actor User
    participant Chat as ChatPanel (browser)
    participant API as POST /api/v1/calls/{id}/ask
    participant Svc as services/ask.ts
    participant ARAG as Progress Agentic RAG
    participant Detail as CallDetailView (browser)

    User->>Chat: types a question
    Chat->>API: {question}
    API->>Svc: askCall(rt, callId, question)
    Svc->>ARAG: POST /ask {query, resource_filters:[callId],<br/>citations:true, top_k:8}
    ARAG-->>Svc: NDJSON: retrieval, answer×N, citations, metadata, status
    Svc-->>Chat: same NDJSON bytes, streamed unchanged
    Note over Chat: concatenates answer.text chunks,<br/>renders inline as they arrive

    Svc->>Svc: accumulate full answer + every<br/>retrieved paragraph's text
    alt answer is not a decline and has citations
        Svc->>ARAG: POST /predict/remi {question, answer, contexts}
        ARAG-->>Svc: {answer_relevance, groundedness, context_relevance}
        Svc-->>Chat: extra NDJSON line: {"item":{"type":"quality",...}}
    else declined or no context
        Note over Svc: REMi call skipped entirely
    end

    Chat->>Chat: derive confidence badge<br/>(REMi score, else citation-coverage floor)
    User->>Chat: clicks citation [1]
    Chat->>Detail: onCitation({key, start, end})
    Detail->>Detail: find paragraph where<br/>charStart < end && charEnd > start
    Detail->>Detail: seek(paragraph.startSeconds)<br/>+ scroll + highlight transcript line
```

The confidence badge shown to the user is never a raw REMi number: `lib/confidence.ts` buckets
both the instant citation-coverage estimate and the REMi score into the same four qualitative
levels (`high` / `moderate` / `low` / `none`), and a declined answer ("Not enough data to answer
this.") shows no badge at all rather than a REMi score that measured relevance rather than
whether an answer was actually given (see
[ARAG integration](arag-integration.md#gotchas-the-hard-won-parts)).

## A settings edit -> validate -> persist -> apply to the runtime -> audit

```mermaid
sequenceDiagram
    actor Operator
    participant API as PUT /api/v1/settings/{section}
    participant Auth as lib/api.ts (auth = admin)
    participant Cfg as services/config.ts
    participant Store as Store (DATA_DIR/settings.json)
    participant RT as lib/runtime.ts (Runtime)
    participant Audit as DATA_DIR/audit.json
    participant Next as The very next request

    Operator->>API: {"primaryColor": "#7c3aed"}
    API->>Auth: admin token or arag_admin cookie
    Auth-->>API: ok (401/403 otherwise)
    API->>API: OpenAPI validation (additionalProperties: false)
    API->>Cfg: updateSettings(rt, section, patch, actor)
    Cfg->>Cfg: validateBranding / Connection / Limits / Retention
    Note over Cfg: safeColor, safeLogoUrl, integer ranges —<br/>the same grammar the boot-time reader uses
    Cfg->>Store: put({ ...stored, branding: { ...old, ...applied } })
    Store-->>Cfg: the saved document
    Cfg->>RT: applyToRuntime(rt, doc)
    Note over RT: mutate in place: rt.env scalars,<br/>rt.branding, rt.arag (live only),<br/>rt.cache when the TTL moved
    Cfg->>Audit: audit("settings.branding", actor, {primaryColor})
    Note over Audit: apiKey is recorded as `true`, never quoted
    Cfg-->>API: effective settings
    API-->>Operator: 200 — the whole SettingsView
    Next->>RT: reads rt.branding / rt.env
    RT-->>Next: the new value
```

Four things in that sequence are load-bearing.

**Validation is the same grammar as boot.** A colour or URL that arrives from a signed-in
operator's form goes through `safeColor`/`safeLogoUrl` exactly as a value from the environment
does. A settings screen must not be a way past the checks the environment gets. An unrecognised
key is a 400 rather than a silent no-op, so a typo in a partner's automation fails loudly.

**Persist before apply.** The store write happens first and the runtime is applied from the
document that came back, so what is in force is always what is on disk — a process that crashes
between the two comes back with the setting, not without it.

**Apply mutates the memoised container.** This is what makes "no restart" true; see
[Architecture](architecture.md#the-runtime-container-and-why-no-restart-is-true). The response is
the *whole* settings view rather than the section that changed, because a limits change moves
`features` and a connection change moves `connection.mode` — returning a fragment would leave the
screen showing a stale version of the thing next to the thing that changed.

**Audit last, with the secret reduced to a boolean.** The entry records the keys that changed and
their non-secret values; `apiKey` is written as `true`. An audit trail that quotes the credential
is a second place to leak it.

`DELETE /api/v1/settings/{section}` runs the same path in reverse: the section is removed from the
stored document, `rt.branding` is restored from `rt.envBranding` and the overridable scalars from
`rt.envDefaults`, the remaining overrides are re-applied over the top, and a
`settings.<section>.reset` entry is audited.

## Read caching: what changed, and why a drill-through used to stall

```mermaid
sequenceDiagram
    participant Dash as GET /api/v1/dashboard
    participant Calls as GET /api/v1/calls
    participant Cache as TtlCache
    participant ARAG as Progress Agentic RAG

    Note over Cache: the catalog and per-call summary keys<br/>are read through getOrLoadStale()
    Dash->>Cache: catalogIds(), then summaryOf(id) per call
    alt entry fresh
        Cache-->>Dash: value
    else entry expired, within grace (9 x TTL)
        Cache-->>Dash: the stale value, immediately
        Cache->>ARAG: one refresh, behind the reader
    else cold or beyond grace
        Cache->>ARAG: load once, single-flight — concurrent callers share it
        ARAG-->>Cache: value
        Cache-->>Dash: value
    end
    Dash->>Dash: aggregate() over the summaries — pure, O(N), not cached
    Calls->>Cache: the same catalog and summary keys, now warm
```

The dashboard aggregate is deliberately **not** cached under a key of its own. It used to be
(`dashboard:all`), and that was a real bug: the entry was written only once its loader resolved,
so it was stamped later than the `summary:<id>` entries it was built from — by the whole per-call
fan-out. For that difference the dashboard rendered instantly from its own entry while quietly
re-warming nothing, and the next screen to read (in practice the calls list, one drill-through
click later) paid the entire cold load, measured at about eight seconds on a live Knowledge Box.

`aggregate()` is pure and O(N) over a few hundred summaries, so re-running it per render costs
nothing measurable, and every dashboard render now re-warms exactly the entries the calls list
reads next. Raising the TTL would only have widened the stale window without removing the cliff
(DECISIONS D-CA-40).

Stale-while-revalidate is only correct because every mutation in this product invalidates its keys
outright — `delete`, `invalidatePrefix` or `clear` — rather than letting them age out. Staleness
is therefore bounded by the TTL, never by a write nobody noticed. Two supporting changes ship with
it: `/calls` has its own `loading.tsx`, and the dashboard's drill-through links drop Next.js'
prefetch, which was saturating the browser's connection pool immediately before the click.
