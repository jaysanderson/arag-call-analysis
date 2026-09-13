# Introducing Call Analysis: every recorded call, actually looked at

Contact centres record almost everything and listen to almost none of it. A team might sample one
or two percent of calls for quality assurance, build a dashboard from whatever an agent typed into
a disposition field on the way out the door, and otherwise let recordings sit in cold storage until
someone needs to pull one for a specific complaint. The calls where a member got frustrated, where
a required disclosure got skipped, or where a cross-sell offer landed perfectly, are indistinguishable
from the routine ones unless a human happens to be listening at the time.

We built Call Analysis to close that gap using Progress Agentic RAG (ARAG). It is a working
application, not a proof of concept: a dashboard, a searchable call list, a per-call detail view
with a synced transcript and a grounded chat, an editor for the categories it classifies against,
a settings area where everything the product reads from configuration is edited, and an operator
console — all sitting on top of a single Knowledge Box that does the transcription,
classification, and analysis work. The demo dataset is
24 synthetic health-insurance contact-centre calls — complaints, claim status checks, prior-
authorization denials, cross-sell conversations, retention saves — invented for this build and
carrying no real member data, chosen because health insurance is a domain with genuine compliance
stakes and a rich mix of call types. The taxonomy and the product itself are not specific to
insurance; the domain is a demonstration, not a limitation.

## What we built

Upload a call recording (MP3 or MP4) or a transcript through the API and three things happen.
ARAG transcribes the audio into paragraphs, each carrying a start and end timestamp. Two
data-augmentation labeler agents classify the call: one at the call level (call reason, outcome,
sentiment, line of business, and a set of disposition flags like "Complaint Raised" or
"Cross-sell Accepted"), and one at the paragraph level (call moments like "Compliance Disclosure,"
"Escalation," or "Sensitive / PII"). A third agent — an "ask" task with two operations — writes two
structured JSON fields per call: a narrative analysis (an executive summary, an agent scorecard
across empathy/compliance/resolution effectiveness, complaint and cross-sell detail, notable
quotes) and a flat metrics object built for aggregation (call reason, outcome, sentiment,
first-call resolution, CSAT estimate, and more).

None of that requires a person to tag anything. The dashboard is just an aggregation of fields
every call already has: complaint rate, resolution rate, cross-sell performance, broken down by
line of business, all generated at ingest time. The call list is filterable by every label the
agents assigned, and searchable — not by title, but by full-text and semantic search across the
actual transcripts, so "every call where a member mentioned canceling" is a query, not a project.

## Configuration is a screen, not a file

The thing we got wrong in the first version, and fixed in this one, was treating configuration as
something you do to a deployment rather than something you do in it. Everything the product reads
from configuration is now editable inside it: the branding a partner ships under, including a
logo you drop onto the page; the Knowledge Box it points at, the generative model and the
timeout; the upload size, question length, rate limit and cache policy; the retention period; the
API keys other systems authenticate with; and — the one that matters most — the categories every
call is classified against.

That last one used to be a source file. The shipped taxonomy is health-insurance-shaped because
the demo corpus is, but a contact centre handling utility billing or IT support needs different
reasons, different outcomes and different compliance moments. Asking them to fork a repository for
that is the difference between a product and a sample. So labelsets are now created and edited in
the product: an id, a title, and a list of labels each carrying the description the labeling agent
actually reads when it decides whether to apply one. Saving writes the labelset to the Knowledge
Box in the same action, and the labeler agent's instructions are *derived* from the current
labelsets rather than stored separately — so a taxonomy edit and the agent that applies it cannot
drift apart. The prompts behind the narrative analysis and the metrics are editable text on the
same screen.

The rule underneath all of it is that environment variables are **defaults** and the settings
store is the **authority**. A value edited in the product persists and takes effect on the very
next request — no restart, no redeploy — and every section has a "Reset to environment default"
that puts it back to what the deployment booted with. Two details we would defend in a review:
secrets are write-only, so the service-account credential can be set or rotated but is never
returned to a browser and never written into the audit trail as anything but a yes; and there is
no background sweeper behind retention, so nothing is ever deleted because a timer fired — a
person or a scheduler has to ask, and the product shows exactly which calls a policy covers before
anyone commits to it.

Every change is recorded with who made it, what changed and when.

## The API, inside the product

The API was always the point — the UI has only ever been a client of the same public `/api/v1` any
integration would call. What was missing was a way to *see* that without leaving the product and
reading a spec. So there is now an API section in the application itself: all 60 operations
grouped by tag, each with its parameters, its request and response schemas, a form that calls the
live deployment and shows you the real response, and a copyable curl command.

It is generated from the deployment's own OpenAPI document at runtime rather than hand-maintained,
which is the part that makes it honest: it cannot list an operation this deployment does not
implement, and it cannot omit one it does. An operation added to the contract tomorrow appears
there with no further work. A key you paste into the try-it form lives in the page's memory and
nowhere else — not in browser storage, not in the URL, and not in the curl it generates, which
emits a placeholder instead.

The part we think is most worth trying is the per-call chat. Open any call and ask it a question —
"did the agent explain the appeal process?" — and the answer comes back scoped only to that call's
own transcript, with citations. Click a citation, and the recording scrubs to the exact second the
cited statement was made, with the source transcript line highlighted. It is a small interaction,
but it replaces "re-listen to twelve minutes of audio to check one thing" with "click and confirm
in two seconds," which is the actual job a QA reviewer does dozens of times a day.

## What is genuinely novel here

The honest claim is narrower than "AI understands your calls." What is real: a single ARAG
Knowledge Box handles transcription, two levels of classification, structured generation, and
grounded retrieval for the same data, which normally means stitching together a transcription
vendor, a separate labeling pipeline, and a RAG stack as three different systems with three
different failure modes. The citations resolving to a media timestamp — not just a passage of text
— is a detail that is easy to describe and unusually satisfying to actually use. And the whole
thing is API-first by construction: the demo UI you'd click through is a client of the same
`/api/v1` that any external integration would call, documented as a single OpenAPI 3.1 spec,
served with both Redoc and Swagger UI, and rendered as a working explorer inside the product — so
"there is nothing the interface does that the API can't" is something you can check in a browser
rather than something we assert. And adapting the product to a different kind of contact centre is
configuration rather than a fork, which is an unusual claim for a product this specific to make.

We are equally direct about what this is not. It is not a real-time or in-call product — there is
no live transcription or agent-assist during a call, only analysis of calls that have already
happened. It has no per-user authorization in this MVP: anyone who can reach the service and hold
a valid key can read every call in the Knowledge Box, so a deployment with real member data needs
an identity-aware proxy or a custom authorization layer in front of it, documented plainly in
`SECURITY.md`. And it is a single-tenant build — one Knowledge Box, one deployment, a per-process
cache and rate limiter — not a multi-tenant platform. Being configurable is not the same as being
multi-tenant: an operator configures one deployment for one customer, and that configuration lives
on that deployment's own data volume, which is why the shipped topology is a single machine with a
single volume rather than a fleet.

## Under the hood: what actually happens when you ask a call a question

When you type a question into the chat panel on a call's detail page, here is the real request
path, not a simplified version of it:

1. The browser posts to this app's own `POST /api/v1/calls/{id}/ask` — never directly to ARAG.
2. That route calls the Knowledge Box's `/ask` endpoint, scoped with `resource_filters` to just
   this one call, with `citations:true`, and streams the response back as NDJSON.
3. As tokens arrive, the server also receives a `citations` payload: a map of character ranges in
   the answer to character ranges in the call's transcript field.
4. This app resolves each citation range against the paragraphs it already fetched for this call
   (each of which carries a start/end timestamp from transcription), turning a raw character offset
   into "paragraph 14, starting at 4:32."
5. Once the answer finishes streaming, the server makes one more call — `/predict/remi` — to score
   the answer's groundedness against the full set of retrieved transcript passages, and appends
   that as a final item in the stream, shown as a confidence indicator.
6. In the browser, clicking a citation marker calls `mediaRef.current.currentTime = seconds` on the
   audio or video element and highlights the corresponding transcript line — no separate lookup, no
   guesswork, just the range ARAG already gave us mapped through the timestamps ARAG already
   produced.

Every step in that list is a real call this application's server code makes; there is no
simplification for the sake of the story.

## Try it yourself

You do not need an ARAG account to see this working. Clone the repository and run:

```
make install
make dev
```

With no `ARAG_API_KEY` set, the app starts against an in-process mock ARAG server, seeds it with
real call transcripts, and runs its own labeler and ask agents against them — the dashboard,
search, filters, per-call analysis, and grounded chat all work exactly as they would against a
live Knowledge Box, because it's the same code path. When you're ready to point it at a real
Knowledge Box, the same `.env` file that would otherwise stay empty takes `ARAG_KB_ID`,
`ARAG_API_KEY`, and `ARAG_REGION`, and nothing else changes.

The full API is browsable at `/api` once the app is running — every operation with a form that
calls it — and also at `/api/v1/docs` as Redoc. The operator console at `/admin` gives you a live
connection test, usage counters, agent status, a job history with cancellation and an audit trail
for whatever Knowledge Box you've pointed it at, and `/settings` lets you change anything the
product reads from configuration without touching the environment you started it with. If you're evaluating this for a real contact centre, `docs/product-
marketing/partner-pitch.md` in the repository lays out where an integration typically needs to go
from here — authorization, ingestion, and taxonomy adaptation are the real work; the product
underneath them is already running.
