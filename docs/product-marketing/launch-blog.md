# Introducing Call Analysis: every recorded call, actually looked at

Contact centres record almost everything and listen to almost none of it. A team might sample one
or two percent of calls for quality assurance, build a dashboard from whatever an agent typed into
a disposition field on the way out the door, and otherwise let recordings sit in cold storage until
someone needs to pull one for a specific complaint. The calls where a member got frustrated, where
a required disclosure got skipped, or where a cross-sell offer landed perfectly, are indistinguishable
from the routine ones unless a human happens to be listening at the time.

We built Call Analysis to close that gap using Progress Agentic RAG (ARAG). It is a working
application, not a proof of concept: a dashboard, a searchable call list, a per-call detail view
with a synced transcript and a grounded chat, and an admin panel — all sitting on top of a single
Knowledge Box that does the transcription, classification, and analysis work. The demo dataset is
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
`/api/v1` that any external integration would call, documented as a single OpenAPI 3.1 spec and
served with both Redoc and Swagger UI, so there is nothing the interface does that the API can't.

We are equally direct about what this is not. It is not a real-time or in-call product — there is
no live transcription or agent-assist during a call, only analysis of calls that have already
happened. It has no per-user authorization in this MVP: anyone who can reach the service and hold
a valid key can read every call in the Knowledge Box, so a deployment with real member data needs
an identity-aware proxy or a custom authorization layer in front of it, documented plainly in
`SECURITY.md`. And it is a single-tenant build — one Knowledge Box, one deployment, a per-process
cache and rate limiter — not a multi-tenant platform.

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

The full API is documented at `/api/v1/docs` once the app is running, and the admin panel at
`/admin` gives you a live connection test, usage counters, and agent status for whatever Knowledge
Box you've pointed it at. If you're evaluating this for a real contact centre, `docs/product-
marketing/partner-pitch.md` in the repository lays out where an integration typically needs to go
from here — authorization, ingestion, and taxonomy adaptation are the real work; the product
underneath them is already running.
