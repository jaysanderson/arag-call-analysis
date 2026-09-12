# Demo walkthrough

A click-by-click tour of the application. Start it with no credentials at all:

```bash
make install
make dev
```

Open **http://localhost:3000**. Everything below works immediately — the mock ARAG server has
already been seeded with real transcripts and run through the same labelling and analysis agents a
live Knowledge Box would use, so nothing on screen is a static mock-up.

## The shell

Every screen sits inside the same application shell: a dark Progress Agentic RAG band across the
top (carrying a "Sample data" pill while you're on the mock, a **How this works** button, and a
**Docs** link), and a left sidebar with **Dashboard**, **Calls**, **Upload**, **Agents &
Taxonomy**, **Settings**, and an **Operations** group holding **Admin**. The sidebar collapses to a
64px icon rail, and drops into a drawer under 1024px wide. Nothing about the shell changes between
a reviewer's screen and an operator's — Admin is just another item in the same navigation.

## 1. First run (`/welcome`)

On a Knowledge Box with no calls in it, the dashboard sends you straight to **Get started**
instead of showing an empty page. It lists four things that have to be true before a call is
categorised, summarised and searchable — connect a Knowledge Box, provision the taxonomy, add
calls, review the analysis — each computed live from the system (`GET /api/v1/onboarding`), not a
fixed script. Click **"Try with sample calls"** and it runs a real seeding job
(`POST /api/v1/samples`): the taxonomy is provisioned, a batch of synthetic calls is ingested, and
a progress bar follows the job to completion. There is no separate demo mode — this is the same
job an operator runs to load the sample dataset, and the showcase recording is simply someone
doing this. "Upload my own" goes straight to Upload instead.

## 2. Dashboard (`/`)

The landing page is the aggregated view across every analysed call, fed by `GET /api/v1/dashboard`.
A six-tile stat strip — Calls, First-call resolution, Complaint rate, Cross-sell accepted, Avg
compliance, Avg CSAT — sits at the top; every tile is a link into the calls table pre-filtered (or
pre-sorted) to that segment, so clicking "Complaint rate" lands on every complaint-flagged call.
Below it, the existing charts break the same data down by call reason, sentiment, outcome, line of
business and complaint category, plus a cross-sell funnel.

Under the charts is the **Breakdown** table: a sortable roll-up by agent or by queue (a segmented
control switches between them), with columns for calls, first-call resolution, complaint,
escalation, CSAT and compliance. Every row is a link into the calls table filtered to that agent or
queue — a group with calls but no analysis yet still appears, showing its call count and "Not
analysed yet" rather than a row of zeroes. A strip of recent-call cards closes out the page.

## 3. Calls (`/calls`)

A segmented control at the top switches between two modes; the choice, like every other filter, is
kept in the URL, so a link to a specific view is shareable and survives a back-navigation.

**Table** (the default) is a real data table, fed by `GET /api/v1/calls`:

- **Search** ("Search transcripts") runs ARAG's full-text and semantic search across every
  transcript, debounced as you type.
- **Facet dropdowns** for call reason, outcome, sentiment, line of business, disposition flags,
  agent and lifecycle status each show a live count next to every option, taken from the response's
  `facets`.
- **Columns** — Call, Date, Duration, Agent/Queue, Reason, Outcome, Sentiment, Status — sort by
  clicking the header; clicking again reverses the order.
- Every row carries the **lifecycle chip** described below, a per-row kebab menu (open the call,
  export it, re-run its analysis, copy a link), and a checkbox.
- Ticking one or more rows opens a **bulk bar**: Export, Re-run analysis, and Delete — the delete
  confirmation names exactly how many calls will be removed before anything happens
  (`POST /api/v1/calls/bulk`). Selection is deliberately not kept in the URL: a link you send
  someone should carry the filter, not a set of ticked boxes that mean nothing to them.
- **Pagination** reads "1–25 of 24" and controls page size.

**Browse** keeps the previous category-rail experience — the top sentiment and call-reason
categories as horizontal rails with live counts — for discovery rather than work. Typing into
search while in Browse switches you to Table automatically, since a search result is a worklist.

### The lifecycle chip

Every call carries a **lifecycle** state, shown as a chip wherever a call is listed: **Queued**,
**Transcribing**, **Labelling**, **Partly analysed**, **Analysed**, or **Failed**. It's derived
from three independent signals the Knowledge Box reports at different times — the resource's
processing status, the labels actually applied, and whether the generated analysis fields have
arrived — collapsed into one word and a plain-language hint about what to do next (a "Partly
analysed" call, for instance, suggests re-running analysis if it stays that way).

## 4. A call workspace (`/calls/[id]`)

Click any call to open its workspace. Everything on the page seeks the same position in the
recording: a citation, a moments-track segment and a transcript block are three views of one
timestamp, and clicking any of them moves the other two.

- **The media player** at the top has a **moments track** beneath its scrub bar: one segment per
  transcript block, coloured by the moment the paragraph labeller assigned it (Complaint,
  Escalation, Cross-sell Pitch, Resolution, Compliance Disclosure, ...). Click a segment to seek.
  A transcript-only call shows the same track as a standalone strip instead, since there's no
  player to attach it to.
- **The transcript**, synced to playback, with a per-block timestamp and moment chips. Clicking a
  chip filters the transcript down to that moment; a search box narrows it by text.
- **The inspector** on the right has three tabs: **Analysis** (the executive summary, agent
  scorecard, complaint and cross-sell callouts, action items, risk flags and notable quotes),
  **Ask** (the grounded chat, below), and **Details** (the raw record, including the exact
  `/api/v1/calls/{id}` response as JSON).
- **Header actions**: **Ask** (jumps straight to that tab), **Share**, **Export**, and a kebab
  menu with Re-run analysis, export transcript (`.txt`) or captions (`.vtt`), copy call id, copy
  API URL, and delete.

## 5. The wow moment — "Ask this call"

Open the **Ask** tab (or click the header's **Ask** button). Type a question — questions are
limited to 500 characters and are answered **only from this call's own transcript**, never from
any other call or outside knowledge (`POST /api/v1/calls/{id}/ask`).

Watch the answer stream in token by token, with numbered `[1]` `[2]` citation markers spliced
directly into the prose. Click a citation: the media player scrubs to that exact moment, and the
corresponding transcript block highlights and scrolls into view — the same mechanism that drives
the moments track and the transcript's own click-to-seek. Ask a follow-up and the same grounding
and citation behaviour applies to every turn.

Next to each answer, a **confidence badge** — "High confidence," "Moderate confidence," "Low
confidence," or "No grounded citations" — reflects how well the answer is actually supported by the
retrieved transcript, backed by a real ARAG relevance/groundedness score once it resolves. Ask
something the transcript genuinely doesn't cover and the honest answer is a decline, shown with
**no** confidence badge at all.

## 6. Sharing a call

**Share**, in the call workspace header, opens a dialog that creates a revocable, expiring link
(`POST /api/v1/calls/{id}/shares`) — 1, 7, 30 or 90 days — and copies it to the clipboard. Anyone
with the link sees the same workspace at `/s/{token}`, read-only: no Ask tab, no header actions, a
banner naming the expiry date. An unknown, revoked or expired token is a plain 404 — the three are
indistinguishable to a visitor by design, so a dead link can't confirm a call ever existed. Active
links can be copied again or revoked from the same dialog.

## 7. Uploading a call (`/upload`)

Drop a recording (MP3, M4A, WAV, MP4, MOV) or paste a transcript, fill in the metadata form
(title, call time, agent, queue, member reference), and submit. Progress is driven by the ingest
job's own stage stream (`GET /api/v1/jobs/{id}/events`, with a polling fallback if the stream is
interrupted) — the labels and percentage on screen are exactly what the server emitted, never
invented client-side. **Ingest history** (`/upload/history`) lists every ingest, sample load,
re-analysis and provisioning run this deployment has made, each with its stage timeline and
duration.

## 8. Agents & Taxonomy (`/taxonomy`)

The categories every call is classified against, and the agents that apply them
(`GET /api/v1/taxonomy`). A **Labelsets** tab lists each labelset's level (whole call or transcript
block), label count, how many calls currently carry each label, and whether the Knowledge Box
actually holds it — click one to open a drawer with its full label definitions. An **Agents** tab
shows the three data-augmentation agents with their live task state. A banner (with a
**Re-provision** action, where the deployment allows it) appears whenever a labelset or agent is
missing, so "my calls aren't being labelled" has one screen that tells you which of the three
possible causes it actually is.

## 9. Settings (`/settings`)

Tabs across **Connection** (mode, Knowledge Box, what this deployment allows, and its limits),
**Branding** (a live white-label preview plus the exact `BRAND_*` block to copy), **Usage**
(operator counters — a signed-out or non-operator visitor sees an explanation instead of the
numbers), **API keys** (a read-only placeholder — keys come from `API_KEYS`), and **About**
(versions, licence, the agents in the taxonomy, and links to the interactive API docs).

## 10. "How this works" (every page)

Top-right of the dark Progress Agentic RAG band is a **How this works** button (it moves to the
sidebar foot on a white-labelled deployment that has hidden the band). Open it on the Calls page,
then again on a call workspace, to see two genuinely different real flows side by side:
classification-and-search versus transcription-and-scoped-ask. Each step names the actual ARAG
mechanism this page's own server code calls, and it changes per route.

## Resetting a demo run

Everything you clicked above — chat history, active filters, table selection, the search query —
lives only in your browser and in the URL. A hard reload or a fresh incognito tab resets it
instantly. The underlying data (the mock's seeded calls, or a live Knowledge Box's real calls) is
untouched by browsing; use the calls table's bulk delete, or `/admin`, to actually remove calls.
