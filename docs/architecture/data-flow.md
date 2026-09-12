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
