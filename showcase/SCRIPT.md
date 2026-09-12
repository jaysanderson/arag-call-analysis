# Showcase script — Call Analysis (2:24)

Recorded by `showcase/record.spec.ts` (`SHOWCASE=1`) against the in-process mock ARAG
(`ARAG_MOCK=1`). The Knowledge Box in this environment seeds and provisions itself once per
process — see `lib/mock.ts` — so it already holds 13 of the product's 24 synthetic
health-insurance calls before the recording starts. Nothing here is real member, agent or call
data. Narration is written to be read aloud at a natural pace alongside the actions; timestamps
are approximate, taken from the recorded video
(`showcase/out/record-showcase-walkthrough/video.webm`, 2:24).

One deliberate departure from a from-empty demo: because the box is already seeded, `/welcome`
genuinely offers "See the analysis" rather than "Try with sample calls". That is recorded
honestly rather than reset and faked.

| Time | On-screen action | Narration | Endpoint behind it |
|---|---|---|---|
| 0:00–0:09 | Land on `/welcome`. Four onboarding steps, each already marked done. | "This is Call Analysis, built on Progress Agentic RAG. In this deployment the Knowledge Box is already connected, taxonomy provisioned and calls loaded — so the honest next step isn't to seed sample data, it's to see the analysis." | `GET /api/v1/onboarding` |
| 0:09–0:20 | Click "See the analysis". The dashboard loads: a six-tile stat strip, four charts, the by-agent/by-queue breakdown. | "Every number here — thirteen calls, seventy-seven per cent first-call resolution, a twenty-three per cent complaint rate — comes from one aggregation call. Nothing on this screen is hand-typed." | `GET /api/v1/dashboard` |
| 0:20–0:28 | Click the "Complaint rate" tile. | "Every stat tile is a drill-through, not a dead end. This one filters straight into the calls behind the complaint rate, with the filter chip already applied." | `GET /api/v1/calls?label=disposition_flags/Complaint Raised` |
| 0:28–0:35 | On `/calls` in Table mode, open "Filter by Sentiment", tick Negative. | "The table is fully faceted. Ticking Negative narrows the rows in place and leaves a removable chip behind — no page reload, no lost place." | `GET /api/v1/calls?label=sentiment/Negative` |
| 0:35–0:43 | Clear filters, search "double charged". | "Search here isn't a title match, it's full text over the transcripts — 'double charged' finds the one call about a duplicate premium charge, by what was actually said." | `GET /api/v1/calls?q=double+charged` |
| 0:43–0:50 | Switch to Browse mode: category rails — Positive, Benefits & Coverage, and more — each with real cards and a moment-map thumbnail. | "Browse mode keeps the original category rails for discovery. Typing in search switches straight back to Table." | `GET /api/v1/dashboard` |
| 0:50–0:57 | Back to Table, tick three rows. | "Selecting rows reveals the bulk bar — export, re-run analysis, delete. This recording shows the affordance is real without running it." | `POST /api/v1/calls/bulk` (not invoked here) |
| 0:57–1:08 | Open "Billing complaint - double-charged premium" — the call the search just found. The workspace: header and actions, player, moments track, transcript, inspector on Analysis. | "One page for the whole call: the recording, the transcript, a moments track along the top, and an inspector with the generated scorecard on the right." | `GET /api/v1/calls/{id}` |
| 1:08–1:16 | Click the Complaint segment on the moments track. | "The moments track is a timeline, not a chart. Clicking the Complaint segment scrubs the player and scrolls the transcript straight to that block." | client-side; timestamps come from the same call record |
| 1:16 | Inspector switches to Ask; click "Summarise this call". | "Now the ask panel." | `POST /api/v1/calls/{id}/ask` |
| 1:16–1:25 | The answer streams in; it finishes with a confidence badge and a "[1] source" citation. | "The answer streams from this call's own transcript and lands with a confidence read and a numbered citation, not just prose." | `POST /api/v1/calls/{id}/ask` |
| 1:25–1:35 | Click "[1] source". | "The citation is the point: clicking it flashes the exact transcript block the answer was drawn from and scrubs the player to that second. It is provably traceable, not decorative." | client-side citation resolution against the same call record |
| 1:35–1:43 | Ask "What is the customer's shoe size?" — a question this transcript cannot answer. | "Ask something the transcript has no basis for, and the product declines rather than guessing: 'Not enough data to answer this,' with no confidence badge and no citations. The refusal is the feature." | `POST /api/v1/calls/{id}/ask` |
| 1:43–1:51 | Click Share, create a link. | "Share creates a read-only, time-limited link to this exact call — transcript, moments and analysis — for anyone who has it, no account required." | `POST /api/v1/calls/{id}/shares` |
| 1:51–1:57 | Sidebar to Upload: dropzone, metadata form, ingest-history link. | "Every one of these calls arrived through this same screen — drop a recording or transcript, fill in the metadata, and the ingest stepper runs live." | `POST /api/v1/calls` (not invoked here) |
| 1:57–2:03 | Sidebar to Agents & Taxonomy, switch to the Agents tab. | "The taxonomy is editable, not fixed — six labelsets, and the three agents that actually apply them: resource-labeler, paragraph-labeler, call-insights, each with their live state." | `GET /api/v1/taxonomy` |
| 2:03–2:09 | Settings, Branding tab. Change the product name. | "White-labelling is a live preview, not a support ticket. Change the name here and the shell preview re-renders immediately — nothing is saved until the environment is." | `GET /api/v1/settings` |
| 2:09–2:14 | Admin sign-in, Overview. | "Operators get the same shell with its own section: a live Knowledge Box connection check and a running count of jobs." | `GET /api/v1/admin/health` |
| 2:14–2:19 | Admin, Jobs tab. | "Every ingest and provisioning run is auditable here. This Knowledge Box was seeded when the process started rather than through a job, so honestly there is nothing queued to show." | `GET /api/v1/jobs` |
| 2:19–2:24 | `/api/v1/docs` (Redoc). | "Every screen in this recording is a client of one documented API, `/api/v1` — and the whole thing just ran with no credentials at all, against a mock Knowledge Box." | `GET /api/v1/openapi.json` |
