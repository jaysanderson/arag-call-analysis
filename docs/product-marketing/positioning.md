# Positioning — Call Analysis

> Working title: **Call Analysis**. This is the repository and code-path name and it stays that
> way (workspace decision [D-15](../../DECISIONS.md)). The name options below are proposals for a
> customer-facing product name; they live only in this document and are not used anywhere in the
> codebase, API, or configuration.

## One-line positioning

Call Analysis turns every recorded contact-centre call into a labeled, searchable, and citable
record — transcribed, classified, and scored automatically the moment it lands, with no analyst
tagging a single call by hand.

## What it is

Call Analysis is an application built entirely on Progress Agentic RAG (ARAG). A call recording
(MP3/MP4) or a transcript is uploaded through the API; ARAG transcribes it into timestamped
paragraphs, and a small set of data-augmentation agents label the call (call reason, outcome,
sentiment, line of business, disposition flags such as "Complaint Raised" or "Cross-sell
Accepted"), label individual transcript paragraphs (moments like "Compliance Disclosure" or
"Escalation"), and write two structured JSON fields per call — a narrative analysis (executive
summary, agent scorecard, complaint and cross-sell detail, notable quotes) and a flat metrics
object the dashboard aggregates. The product presents this as a browsable, filterable, searchable
call list, a queue-wide dashboard, and a per-call detail view where a reviewer can scrub straight
to a labeled moment, read the AI analysis, and ask the call itself a question — answered only from
that call's own transcript, with citations that click through to the exact paragraph and scrub the
recording to it. Everything the demo UI shows is a client of one versioned, documented
`/api/v1`, and the whole product runs with no ARAG credentials against an in-process mock for
evaluation or CI.

## What it is not

Call Analysis is not a real-time or in-call product: there is no live transcription, no
whisper-coaching, no streaming call feed — a call is analyzed once it has been recorded and
transcribed. It is not a telephony platform or CCaaS, and it does not capture calls itself; it
consumes recordings or transcripts that already exist. It is not a general-purpose document
chatbot pointed at a pile of files — the chat is deliberately scoped to one call at a time, backed
by a purpose-built health-insurance call taxonomy rather than a generic prompt. And it is not a
finished multi-tenant enterprise system: the MVP has no per-user authorization (anyone holding a
valid key can read every call in the Knowledge Box), no real-time calls, and runs as a single
tenant against a single Knowledge Box — see Competitive framing below for the honest version of
this list.

## Product name options

### Option 1 — AfterCall

**Rationale.** "After-call work" is an established contact-centre term (the QA and wrap-up
activity that happens once a call ends). The name says exactly what the product does and when it
does it, in language a contact-centre operations audience already uses.

**Tone.** Plain, operational, unpretentious — a tool that fits into an existing workflow rather
than a platform trying to replace one.

**Risks.** It is close to a generic industry term rather than a coined brand, which makes it
memorable to insiders but weaker as a trademark; it also undersells the dashboard/analytics side
of the product by anchoring on the single-call moment.

### Option 2 — CallLens

**Rationale.** "Lens" is an established metaphor for a tool that lets you see something more
clearly — apt for a product whose entire value is turning an unheard recording into something
inspectable, labeled, and searchable.

**Tone.** Analytical, BI-adjacent, confident.

**Risks.** Generic and collision-prone: "Lens" is already used as a product name across analytics
and BI tooling (dashboards, CRM add-ons, IDE features), so it competes for search visibility and
carries real trademark risk if pursued commercially. It also says nothing about the call-specific
or ARAG-native parts of the product.

### Option 3 — Verascribe

**Rationale.** A coined word from "vera" (truth) and "scribe" (to write/transcribe), aimed
squarely at the product's most defensible differentiator: answers that are grounded in a specific
transcript and cited back to a timestamp, not generated freely.

**Tone.** Premium, compliance-forward, trustworthy — suited to a QA/compliance buyer.

**Risks.** A coined word takes longer to learn and is harder to spell/say on a first hearing than
the other two options; it also reads more like a transcription or dictation product than a full
analytics and coaching tool, which could undersell the dashboard and coaching use cases.

### Recommendation

**AfterCall.** It is immediately legible to the buyer who actually uses this product (contact-centre
operations and QA), it carries the lowest naming risk of the three (no direct collision with a
well-known category term, unlike "Lens"), and it is honest about what the product is — a
post-call analysis layer, not a real-time or in-call system, which matches the "what it is not"
section above rather than overselling it.

## Personas

### Contact-centre operations leader

**Role.** Owns queue-level performance for a contact centre (e.g., VP/Director of Contact Centre
Operations).

**Cares about.** Trend lines across the whole queue: resolution rate, complaint rate, cross-sell
performance, which line of business is driving volume — numbers to bring to a weekly ops review.

**Pain today.** These numbers usually come from a manually coded sample of 1–2% of calls, or not
at all; nobody has time to listen to the other 98%.

**Answered by.** The dashboard (`GET /api/v1/dashboard`) aggregates every analyzed call's
AI-generated `call_metrics` — call reason, outcome, sentiment, line of business, complaint rate,
cross-sell rate, first-call-resolution rate — with no manual tagging step, plus category rails and
drill-through from any chart bar into the filtered call list.

### QA / compliance manager

**Role.** Runs quality assurance or compliance monitoring for the contact centre.

**Cares about.** Whether required disclosures were actually read, whether complaints were handled
correctly, and being able to prove it — an audit trail that traces a finding back to the exact
moment in a call.

**Pain today.** Manual QA sampling covers a tiny fraction of calls and a reviewer still has to
scrub through an entire recording to find the one relevant thirty seconds.

**Answered by.** The paragraph-level "moment" labels (`Compliance Disclosure`, `Sensitive / PII`,
`Complaint`, `Escalation`) tag the exact transcript block, the call-level `Compliance Risk` and
`Complaint Raised` disposition flags surface which calls need review first, and grounded chat
citations resolve to a specific paragraph and timestamp that scrubs the player straight to it —
so "did the agent read the disclosure" is answered by clicking, not re-listening.

### CX / insights analyst

**Role.** Analyzes customer experience and call-driver trends for the business.

**Cares about.** Why members are calling, which complaint categories are growing, whether
cross-sell offers land, and being able to slice all of that by segment (line of business, queue,
outcome).

**Pain today.** Coding calls into categories by hand in a spreadsheet is slow, inconsistent
between coders, and rarely covers enough volume to trust a trend.

**Answered by.** Every call carries a consistent, agent-generated `call_metrics` record (call
reason, outcome, sentiment, line of business, complaint category, cross-sell offered/accepted,
CSAT estimate) built from the same taxonomy on every call, filterable and searchable through
`GET /api/v1/calls` (facet filters plus full-text/semantic search over transcripts), so a trend is
a filter, not a re-coding project.

### Platform engineer / partner architect

**Role.** Deploys, integrates, or extends the product — an internal platform engineer or a systems
integrator scoping a client engagement.

**Cares about.** What the API surface actually is, whether the UI is doing anything the API can't,
how auth and rate limiting work, and whether they can evaluate the whole thing without provisioning
a live Knowledge Box first.

**Pain today.** Vendor demos are often a UI with no documented API behind it, or a "trust us" black
box that can't be evaluated without a signed contract and live credentials.

**Answered by.** A single OpenAPI 3.1 document (`lib/openapi.ts`) is the source of truth for every
route, served live with Redoc and Swagger UI; the demo and admin UIs call only `/api/v1`; the admin
panel exposes a real Knowledge Box connection test, configuration, usage, logs, and agent status;
and `make install && make dev` runs the entire product — dashboard, calls, chat, admin — against an
in-process mock ARAG with no credentials at all.

## Use cases

1. **Complaint detection and drill-down.** The `Complaint Raised` disposition flag and the
   `Complaint` paragraph moment surface every complaint call; the `call_analysis.complaint` field
   (present, category, severity, a supporting quote) lets a manager triage without opening every
   call, and the dashboard's "complaints by category" chart drills straight into the filtered list.

2. **Cross-sell coaching.** `Cross-sell Offered` / `Cross-sell Accepted` disposition flags and the
   `call_analysis.cross_sell` field (offered, product, accepted, objection) combine with the
   `Cross-sell Pitch` / `Objection` paragraph moments so a coach can pull up exactly where an offer
   was made and where it stalled, across every call in a queue.

3. **First-call-resolution measurement.** The `first_call_resolution` metric and the
   `First-Call Resolution` disposition flag are generated per call by the ask agent from the
   transcript itself, so an FCR rate appears on the dashboard without a post-call survey.

4. **Compliance disclosure spot checks.** The `Compliance Disclosure` paragraph label marks the
   exact transcript block where a required script or recording notice was read (or should have
   been); a reviewer filters to calls tagged `Compliance Risk` and jumps directly to the moment
   instead of listening from the start.

5. **"Find every call where X was said."** `GET /api/v1/calls?q=` is backed by ARAG's `/find`,
   full-text and semantic search across every call's transcript — not a keyword match on titles or
   metadata — so "every call where a member mentioned a competitor" or "every call about a denied
   MRI" is a search, not a project.

6. **Grounded Q&A over a single call, with citations that scrub the recording.**
   `POST /api/v1/calls/{id}/ask` streams an NDJSON answer scoped with `resource_filters` to just
   that call, with `citations:true`; each citation resolves to a transcript paragraph and its
   timestamp, and clicking it scrubs the audio or video player to that exact second.

7. **Agent scorecards.** The `call_analysis.agent_scorecard` field (empathy, compliance,
   resolution effectiveness, each 0–100) is generated per call from the transcript and shown in the
   AI Analysis panel — a starting point for a coaching conversation, not a replacement for one.

8. **Dashboard reporting without manual tagging.** The entire dashboard — call reason, outcome,
   sentiment, line of business, complaints by category — is built from labels and metrics the
   agents generate at ingest time; no analyst spends time coding calls before the numbers exist.

## Competitive framing

Call Analysis sits near four existing categories:

- **Conversation-intelligence suites** (e.g., full-featured call/meeting analytics platforms).
  These are mature, feature-rich products, but they typically bundle their own capture/telephony
  integration, their own model choices, and per-seat licensing built around a much larger
  organization than a single contact centre or a proof-of-concept.
- **Speech analytics bolted onto a CCaaS.** Convenient if a team is already committed to that
  contact-centre platform, but the analytics are locked to that vendor's pipeline and model
  choices, and rarely expose a documented, independent API.
- **Generic RAG chat over documents.** A chatbot pointed at a folder of transcripts can answer
  questions, but without a purpose-built taxonomy, a labeling pipeline, or per-call scoping, it
  cannot produce a dashboard, cannot guarantee an answer only ever comes from one specific call, and
  has no notion of a citation resolving to a media timestamp.
- **DIY LLM pipelines.** A team can wire together a transcription vendor, a labeling prompt, and a
  vector database themselves — and many do — but it takes months of engineering and typically ships
  without an admin panel, a documented API, contract tests, or an evaluatable demo mode.

**Honest differentiators:**

- One ARAG Knowledge Box does transcription (with paragraph-level timestamps), classification (two
  data-augmentation labeler agents, at the call and the paragraph level), structured generation (an
  ask agent writing narrative analysis and flat metrics JSON), and grounded retrieval (`/find` and
  `/ask` with citations) — a single system where most alternatives require stitching together a
  separate ASR vendor, a labeling pipeline, and a RAG stack.
- Citations map back to a timestamp. Clicking a citation marker in a chat answer does not just
  highlight a passage of text — it scrubs the actual recording to the second the cited statement
  was made and highlights the source transcript line.
- API-first by construction: the demo UI is a client of the same public, documented `/api/v1` that
  any external integration would call (OpenAPI 3.1, served with Redoc and Swagger UI); nothing the
  UI does is unavailable to the API.
- It runs with no credentials: `make install && make dev` seeds an in-process mock Knowledge Box
  with realistic calls and runs the product's own labeler and ask agents against it, so the whole
  product — dashboard, search, chat, admin — can be evaluated before a Knowledge Box is
  provisioned.

**Honest gaps** (true of this MVP, not overstated away):

- No per-user authorization. Any caller who can reach the service and satisfy the API-key
  requirement can read every call in the Knowledge Box; there is no "my team's calls only"
  concept. A deployment with real recordings needs an identity-aware proxy in front of it or a
  custom authorization layer.
- No real-time or streaming calls. This is a post-call analysis product, not an in-call assist or
  live-monitoring tool.
- Single-tenant MVP. One deployment serves one Knowledge Box; rate limiting and the response cache
  are per-process, so a multi-machine deployment limits and caches per machine, not globally.

## Proof points

Verified against the codebase and a live test run on 2026-09-12; nothing below is estimated.

- **Public API:** a single OpenAPI 3.1 document (`lib/openapi.ts`) describes every route; the same
  document drives request validation and the contract tests. It is served at
  `/api/v1/openapi.json`, with human-readable docs at `/api/v1/docs` (Redoc) and `/api/v1/swagger`
  (Swagger UI).
- **Admin panel** at `/admin`: sign-in, Knowledge Box connection test, redacted effective
  configuration, usage counters, data-augmentation agent status with one-click reprovisioning, job
  timeline, structured log inspector, and cache statistics with invalidation — eight admin API
  routes (`/api/v1/admin/*`) behind an admin token.
- **Test suite:** 11 test files (unit, in-process and over-HTTP integration, and OpenAPI contract
  tests) with 170 passing tests. A coverage run on 2026-09-12 (`vitest run --coverage`) measured
  96.7% statement coverage, 99.1% function coverage, and 82.3% branch coverage across `lib/` and
  `services/`.
- **No-credentials demo mode:** setting `ARAG_MOCK=1` seeds an in-process mock Knowledge Box with
  real call transcripts and runs the product's own labeler and ask agents against it at boot, so
  `make install && make dev` produces a fully working product with no ARAG account.
- **Taxonomy:** 5 call-level labelsets (call reason — 10 labels, outcome — 5, sentiment — 4, line
  of business — 6, disposition flags — 8) and 1 paragraph-level labelset (11 call-moment labels),
  applied automatically by two labeler agents, plus one two-operation ask agent that writes a
  structured `call_analysis` and `call_metrics` JSON field per call.
- **Grounded chat:** `POST /api/v1/calls/{id}/ask` streams an NDJSON answer scoped with
  `resource_filters` to a single call, with citations enabled, and appends a `/predict/remi`
  answer-quality score to the stream once the answer completes.
