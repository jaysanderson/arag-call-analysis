# FAQ

**Does this work without any credentials?**
Yes. `make dev` with no `ARAG_API_KEY` configured starts the app against an in-process mock ARAG
server, seeded with real transcripts and run through the same labeling and analysis agents a live
Knowledge Box would use. Every screen — dashboard, filters, transcript moments, the "Ask this
call" chat — works identically to a live deployment, just against synthetic data on your own
machine with zero network egress. See [Quickstart](../developer/quickstart.md).

**What data is synthetic, and what's real?**
The demo dataset is 24 fictional health-insurance contact-centre calls (`lib/domain/scenarios.ts`)
plus one sample call from the underlying platform — no real customer, member or call data. A
banner in the app footer says as much on every page. A production deployment pointed at your own
Knowledge Box uses your own recordings; nothing about the product itself is specific to the demo
scenario or to health insurance — the taxonomy is fully configurable (see "Can it use my own
taxonomy?" below).

**What does ARAG do, and what does this app do?**
ARAG (Progress Agentic RAG) does every piece of actual intelligence: transcription with
timestamps, classification (via its data-augmentation "labeler" agents), the generated analysis
and metrics JSON (via its "ask" agent), semantic and keyword search, and the grounded
question-answering with citations. This app does not run its own transcription or its own
language model. What this app *does* do: define the taxonomy of labels and prompts, orchestrate
when agents run, cache and aggregate the results into a dashboard, map citation offsets back to
transcript timestamps for the click-to-scrub behavior, present everything in a usable UI, and add
an honest, qualitative confidence read on top of ARAG's own answer-quality score. See
[ARAG integration](../architecture/arag-integration.md) for the full technical breakdown.

**What data privacy or handling controls exist?**
The service-account credential that talks to ARAG never reaches the browser — media streams and
the answer chat both proxy through the server. The admin token is exchanged for an `HttpOnly`
cookie, never held in readable browser storage. That said, the MVP has no per-user or per-call
access control: anyone who can reach the deployment (and hold a valid API key, if one is
configured) can see every call in it. A deployment handling sensitive real recordings should add
an identity-aware access layer in front. See
[Security model](../architecture/security-model.md) for the full threat model, including its
explicitly stated limitations.

**What drives cost?**
Every ARAG call — transcription, the two classification agents, the analysis/metrics generation,
each question asked in the chat, and the per-answer REMi quality score — is a billable operation
against your Knowledge Box, governed by your ARAG plan, not by this app. This app's own additions
(the read cache, and skipping the REMi call entirely on a declined answer) exist specifically to
reduce redundant ARAG round-trips rather than add cost of its own; see
[Scaling](../architecture/scaling.md) for how the caching changed the ARAG-call profile.

**Can it use my own taxonomy — different labels, different industry?**
Yes. The entire label set and the analysis/metrics prompts live in one file,
`lib/domain/taxonomy.ts` — nothing about the labeling or analysis pipeline is hardcoded to health
insurance. Change the labelsets, the prompts, or add an entirely new data-augmentation agent, then
re-provision (`POST /api/v1/admin/provision` or the "Re-provision" button in `/admin/agents`) to
apply it. See [Extension points](../developer/extension-points.md#change-the-taxonomy).

**What languages does it support?**
Transcription and language support are governed by ARAG's own transcription and generative
models, not by this app. The demo taxonomy's prompts and labels are written in English; adapting
them to another language is the same taxonomy-editing process described above.

**How accurate are the generated labels and summaries?**
As accurate as the underlying generative model's read of the transcript — this app does not layer
any additional accuracy guarantee on top beyond validating that generated *values* actually match
the taxonomy's allowed set before they ever reach a chart (a model can occasionally return a
malformed or off-taxonomy value; that value is dropped rather than displayed, never shown as if it
were real). Narrative fields (the executive summary, quotes, action items) are not validated
beyond that — they should be read as an AI-generated first draft a reviewer can act on quickly,
not an infallible record.

**What happens when the model can't answer a question?**
It says so honestly — "Not enough data to answer this." — rather than guessing. The UI treats a
decline specially: no citation markers are spliced into it even if the platform still returned a
citation map, and no confidence badge is shown at all, because a confidence reading next to an
admitted non-answer would be self-contradicting. This was found and fixed live during testing: the
underlying answer-quality model initially scored a decline as "high confidence" because it
measures topical relevance rather than whether an answer was actually given.

**Can the chat answer questions using other calls, or general knowledge?**
No. Every question is scoped to exactly one call (`resource_filters` limited to that call's own
resource id) — it cannot see, and will not answer from, any other call in the Knowledge Box, and
it does not draw on general knowledge outside what ARAG retrieved from that specific transcript.

**Is the confidence badge a raw AI score?**
No, deliberately. It's a qualitative bucket — High / Moderate / Low / No grounded citations —
derived from a real relevance-and-groundedness score once it resolves (with an instant
citation-coverage estimate shown while it's in flight), never a bare number presented as if it
were precise. See [Data flow](../architecture/data-flow.md) for exactly how it's computed.

**What happens to an uploaded recording that never finishes transcribing?**
The upload endpoint returns immediately with the call's id and a job id; the job tracks
transcription and searchability separately with generous timeouts (10 minutes for transcription,
60 seconds for the searchability check) and marks itself failed rather than hanging forever if
ARAG genuinely can't process the file. The call resource itself still exists in the Knowledge Box
either way — a stuck job doesn't roll anything back.

**Does deleting a call from this app delete it from the Knowledge Box?**
Yes — `DELETE /api/v1/calls/{id}` deletes the underlying ARAG resource, not just a local
reference. There is no undo; a deployment that needs a "soft delete" would need to add one.

**Can I run this against my own existing Knowledge Box that already has other kinds of content in
it?**
Provisioning creates labelsets and agents scoped by the identifiers in this product's own taxonomy
(`call_reason`, `call_outcome`, `sentiment`, `line_of_business`, `disposition_flags`, `moment`); if
those ids don't already exist for another purpose in your Knowledge Box, this product's agents run
alongside whatever else is there without conflict. It's still recommended to use a dedicated
Knowledge Box for a production deployment, both for this reason and because agent runs and catalog
walks operate over every resource in the box, not just this product's calls.

**Where do I go to actually try it, or to see everything the admin console exposes?**
[Demo walkthrough](walkthrough-demo.md) and [Admin walkthrough](walkthrough-admin.md) are
click-by-click tours of both surfaces; [Quickstart](../developer/quickstart.md) gets a local
instance running in under five minutes with no credentials at all.
