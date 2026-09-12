# Showcase script — Call Analysis (2:30)

Recorded against the in-process mock ARAG (`make showcase`, `ARAG_MOCK=1`) over the shipped
synthetic health-insurance calls. No real member, agent or call data appears anywhere in this
recording. Narration is written to be read aloud at a natural pace while
`showcase/record.spec.ts` performs the actions; the timings below match the pauses in that spec.

The whole recording runs through the real product. There is no demo-only route, no scripted
overlay and no seeded UI state — everything on screen is the same code a partner would deploy.

| Time | On-screen action | Narration |
|---|---|---|
| 0:00–0:08 | `/welcome`. The four first-run steps, each with its real state. | "This is Call Analysis, an open-source reference product built entirely on Progress Agentic RAG. On first run it tells you exactly what still has to be true before a call is categorised, summarised and searchable — connect a Knowledge Box, provision the taxonomy, add calls, review the analysis. Each of those is checked live, not ticked off a list. This deployment is already connected to a sample Knowledge Box, so let us look at the analysis." |
| 0:08–0:22 | Click **See the analysis**. The dashboard loads: stat strip, charts, the agent breakdown. | "Every number here is aggregated from each call's own generated metrics. First-call resolution, complaint rate, cross-sell acceptance, compliance, satisfaction — nobody tagged any of it by hand. Underneath, the same data broken down by reason, sentiment and outcome, and then by agent, which is the question a supervisor actually arrives with: who is driving this?" |
| 0:22–0:32 | Click the **Complaint rate** tile. It navigates to `/calls` filtered to complaint-flagged calls. | "No number here is a dead end. Click the complaint rate and you land on the calls behind it, with the filter already applied and removable." |
| 0:32–0:42 | On `/calls`: open the **Sentiment** facet and tick **Negative**. Counts and chips update. | "This is a real data table — search, facets with live counts, sortable columns, pagination, and a state for every call. Add a second filter and the set narrows without the page blanking." |
| 0:42–0:50 | Clear filters, type `double charged` into the search box. | "Search is not a title match. It is full-text and semantic search across every transcript, so a phrase from the middle of a conversation finds the call." |
| 0:50–0:58 | Switch to **Browse**. The category rails appear with live counts. | "For discovery rather than work, the same calls as category rails — top sentiment, top reasons, and the two flags a compliance lead comes for." |
| 0:58–1:06 | Back to **Table**. Tick three rows; the bulk bar appears. | "Select rows and the bulk actions are there: export the selection, re-run the analysis, delete with a confirmation that names exactly what goes." |
| 1:06–1:18 | Open a call. The workspace: player, moments track, transcript, inspector on **Analysis**. | "Open one call and you get a workspace. The recording, the transcript ARAG produced from it, and underneath the scrub bar the moments track — one segment per block of the call, coloured by what a second agent tagged it as. Complaint, escalation, cross-sell pitch, compliance disclosure. That is the shape of the call at a glance." |
| 1:18–1:26 | Click a coloured segment on the moments track. The player scrubs; the transcript block highlights. | "Click a moment and the recording moves to it and the transcript follows. Finding the complaint in an hour-long call is one click, not a scrub." |
| 1:26–1:32 | Inspector → **Ask**. Ask "Was the member satisfied, and did they accept the offer?" | "Now the part this product is built for. Ask the call a question." |
| 1:32–1:44 | The answer streams with inline superscript markers; the confidence badge and citation chips land underneath. | "The answer streams, grounded only in this call's own transcript — never another conversation, never general knowledge. It arrives with a confidence reading and a numbered citation for each claim." |
| 1:44–1:54 | Click a citation chip. The recording scrubs to that second; the cited block flashes. | "And this is the moment that matters. Click the citation and the recording jumps to the exact second that statement was made, with the transcript line highlighted. 'Show me where' is a click, not an afternoon." |
| 1:54–2:02 | Ask something the transcript cannot answer. An honest decline: no badge, no citations. | "Ask it something the call does not answer and it says so. No confidence badge on a refusal, no citations invented to fill the gap. The decline is the feature." |
| 2:02–2:08 | Click **Share**, create a link with an expiry. | "Hand the evidence to someone without an account: a read-only link that expires on its own and can be revoked." |
| 2:08–2:14 | Sidebar → **Upload**. Dropzone, metadata, the stepper. | "Bringing your own calls is a drop and a form. The progress you watch is the ingest job's own stages, not a spinner." |
| 2:14–2:20 | Sidebar → **Agents & Taxonomy**. Labelsets, applied counts, the three agents and their state. | "The categories are configuration, not a fixed list — these are the labelsets every call is classified against, how many calls carry each label, and the three data-augmentation agents doing the work, with their live state." |
| 2:20–2:24 | **Settings → Branding**. The live white-label preview. | "A partner ships this under their own identity with no fork: product name, colours, logo, and the Progress credit off entirely." |
| 2:24–2:29 | **Admin** → Overview, then Jobs and a job's stage timeline. | "Operators get the same shell and their own product: a live Knowledge Box connection test, usage, logs, security posture, and the job history that is the provenance of everything you just watched." |
| 2:29–2:30 | `/api/v1/docs` (Redoc). | "And every screen in this recording was a client of one documented, versioned API — which runs with no credentials at all against a mock Knowledge Box." |

## Notes for the recording

- The mock Knowledge Box seeds and augments itself once per process, so the onboarding screen
  genuinely offers **See the analysis** rather than a seeding run. That is recorded as it is
  rather than reset and staged.
- `CALLS_MOCK_STREAM_DELAY_MS` is raised for the showcase run only, so the ask answer streams at a
  readable pace instead of appearing at once.
- The spine is 1:06–1:54 — workspace, moments track, ask, citation scrub. If the recording has to
  be shortened, cut the bulk-selection beat, then share, then branding. Never the spine.
