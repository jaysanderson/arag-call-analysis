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

The product is also **configurable in itself**, not in a config file. The labelsets it classifies
against, the prompts its analysis agent runs, the branding it wears, the Knowledge Box it points
at, its limits, its retention policy and its API keys are all edited in the product by an
operator, persist, and take effect on the next request — no redeploy, no engineer. Environment
variables set what a deployment starts with; after that the product is the authority, every
section can be reset to those defaults, and every change is audited. And the API is not merely
documented but **browsable and callable from inside the product**: an API section lists every
operation this deployment declares, with a form that calls it live and a copyable curl, generated
from the deployment's own OpenAPI document rather than hand-maintained.

## What it is not

Call Analysis is not a real-time or in-call product: there is no live transcription, no
whisper-coaching, no streaming call feed — a call is analyzed once it has been recorded and
transcribed. It is not a telephony platform or CCaaS, and it does not capture calls itself; it
consumes recordings or transcripts that already exist. It is not a general-purpose document
chatbot pointed at a pile of files — the chat is deliberately scoped to one call at a time, backed
by a purpose-built call taxonomy — shipped for health insurance, edited in the product for any
other domain — rather than a generic prompt. And it is not a finished multi-tenant enterprise
system: the MVP has no per-user authorization (anyone holding a valid key can read every call in
the Knowledge Box), no real-time calls, and runs as a single tenant against a single Knowledge
Box. Configurability is not multi-tenancy: an operator configures one deployment for one
customer, and a second customer needs a second deployment. See Competitive framing below for the
honest version of this list.

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
how auth and rate limiting work, how much of a client engagement is configuration rather than
code, and whether they can evaluate the whole thing without provisioning a live Knowledge Box
first.

**Pain today.** Vendor demos are often a UI with no documented API behind it, or a "trust us" black
box that can't be evaluated without a signed contract and live credentials.

**Answered by.** A single OpenAPI 3.1 document (`lib/openapi.ts`) is the source of truth for all 60
operations, served live with Redoc and Swagger UI *and* rendered as an in-product API explorer at
`/api` with a try-it form against the running deployment; the demo and operator UIs call only
`/api/v1`; the operator console exposes a real Knowledge Box connection test, configuration,
usage, logs, agent status and an audit trail; and `make install && make dev` runs the entire
product — dashboard, calls, chat, settings, taxonomy editing, operator console — against an
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
  UI does is unavailable to the API. The claim is checkable rather than asserted, because the
  in-product API explorer is *generated* from the served document — it cannot list an operation
  the deployment does not implement, or omit one it does.
- Adaptation is configuration, not a fork. The call taxonomy — the labelsets, the label
  descriptions the agent actually reads, and the prompts behind the narrative analysis and the
  metrics — is created and edited in the product and written to the Knowledge Box as it is saved.
  So is the identity a partner ships under, the Knowledge Box the deployment points at, its limits
  and its retention policy. Most comparable tools make a taxonomy change a vendor request or a
  code change; here it is a screen, it takes effect on the next request, and it is audited.
- API keys are a product feature rather than a deployment variable: issued, named, rotated and
  revoked in the product, stored as one-way digests, shown once, with a last-used time. A partner
  onboarding a caller does not need an engineer or a redeploy.
- It runs with no credentials: `make install && make dev` seeds an in-process mock Knowledge Box
  with realistic calls and runs the product's own labeler and ask agents against it, so the whole
  product — dashboard, search, chat, settings, taxonomy editing, operator console — can be
  evaluated before a Knowledge Box is provisioned.

**Honest gaps** (true of this MVP, not overstated away):

- No per-user authorization. Any caller who can reach the service and satisfy the API-key
  requirement can read every call in the Knowledge Box; there is no "my team's calls only"
  concept. A deployment with real recordings needs an identity-aware proxy in front of it or a
  custom authorization layer.
- No real-time or streaming calls. This is a post-call analysis product, not an in-call assist or
  live-monitoring tool.
- Single-tenant MVP. One deployment serves one Knowledge Box; rate limiting and the response cache
  are per-process, so a multi-machine deployment limits and caches per machine, not globally.
  Configurability does not change that: an operator configures one deployment for one customer.
- The configuration itself is per-machine. Settings, API keys, the taxonomy, saved views, share
  links and the audit trail live in the deployment's own data volume, so a horizontally scaled
  deployment would need that volume shared *and* a way to tell the other machines to re-apply —
  today a change made on one machine reaches one machine. This is why the shipped topology is a
  single machine with a single volume.
- Retention is deliberate, not automatic. There is a policy, a preview and a purge; there is no
  background sweeper, so "delete everything older than 90 days without anyone doing anything"
  needs an external scheduler calling the purge endpoint.

## Proof points

Verified against the codebase on 2026-09-13, except the coverage figures, which are from the test
run of 2026-09-12 and are labelled as such. Nothing below is estimated.

- **Public API:** a single OpenAPI 3.1 document (`lib/openapi.ts`) describes 60 operations across
  45 paths; the same document drives request validation and the contract tests. It is served at
  `/api/v1/openapi.json`, with human-readable docs at `/api/v1/docs` (Redoc) and `/api/v1/swagger`
  (Swagger UI).
- **In-product API explorer** at `/api`: every operation grouped by tag, with its parameters,
  schemas, a try-it form that calls the live deployment, the response and a copyable curl —
  rendered from `/api/v1/openapi.json` at runtime, so it cannot drift from what the deployment
  serves. A unit test walks every operation in the real document through the explorer's indexing
  and form generation.
- **Configuration in the product:** `PUT`/`DELETE /api/v1/settings/{section}` over four sections
  (branding, connection, limits, retention) persist to a JSON store and apply to the running
  process without a restart; environment variables are the defaults each section resets to. The
  service-account credential is write-only — accepted by the write, returned by no read model.
  Every change is written to an audit trail (`GET /api/v1/admin/audit`) with actor, action and the
  values that changed, secrets reduced to a boolean.
- **Editable taxonomy and agents:** `POST /api/v1/labelsets`, `GET/PUT/DELETE
  /api/v1/labelsets/{id}` and `POST /api/v1/labelsets/{id}/provision` make the vocabulary a
  product feature; `GET /api/v1/agents`, `PUT/DELETE /api/v1/agents/{key}` and
  `POST /api/v1/agents/{key}/start` enable, re-instruct, start and stop the data-augmentation
  agents. A labeler's operations are derived from the current labelsets on every read rather than
  stored, so the two cannot drift apart.
- **Real API-key store:** keys are SHA-256 digests, shown once on creation, carry a name and a
  last-used time, and are revoked rather than deleted. `API_KEYS` is a one-time seed, so an
  environment-configured deployment keeps working and gains management.
- **Retention:** `GET /api/v1/retention/preview` and `POST /api/v1/retention/purge` (operator-only,
  irreversible, `dryRun` supported, 200 calls per run). No background sweeper: nothing is deleted
  until someone asks.
- **Operator console** at `/admin`: sign-in, Knowledge Box connection test, redacted effective
  configuration, usage counters, data-augmentation agent status with one-click reprovisioning, job
  timeline with cancellation, structured log inspector, audit trail, and cache statistics with
  invalidation — ten admin API routes (`/api/v1/admin/*`) behind an admin token.
- **Test suite:** 21 vitest files (unit, in-process and over-HTTP integration, and OpenAPI contract
  tests) plus 7 Playwright journeys covering the dashboard and calls, the operator console,
  branding, saved views and the column picker, settings edits, taxonomy editing and the API
  explorer. The last published coverage run, on 2026-09-12 (`vitest run --coverage`), measured
  96.7% statement coverage, 99.1% function coverage and 82.3% branch coverage across `lib/` and
  `services/`; `make check` gates every run at 80% line and statement coverage.
- **No-credentials demo mode:** setting `ARAG_MOCK=1` seeds an in-process mock Knowledge Box with
  real call transcripts and runs the product's own labeler and ask agents against it at boot, so
  `make install && make dev` produces a fully working product with no ARAG account.
- **Taxonomy:** 5 call-level labelsets (call reason — 10 labels, outcome — 5, sentiment — 4, line
  of business — 6, disposition flags — 8) and 1 paragraph-level labelset (11 call-moment labels),
  applied automatically by two labeler agents, plus one two-operation ask agent that writes a
  structured `call_analysis` and `call_metrics` JSON field per call. Those are the *seeded*
  definitions: the store they seed is editable in the product, and a labelset may hold up to 60
  labels.
- **Grounded chat:** `POST /api/v1/calls/{id}/ask` streams an NDJSON answer scoped with
  `resource_filters` to a single call, with citations enabled, and appends a `/predict/remi`
  answer-quality score to the stream once the answer completes.
- **Live write verification:** `make smoke-write` (opt-in, `CALLS_ALLOW_LIVE_WRITE=1`) exercises
  every write path against a real Knowledge Box through the product's own HTTP API — settings,
  keys, labelsets, agents, upload, share links, retention preview and deletion — and removes
  everything it created, leaving the seeded corpus untouched.
