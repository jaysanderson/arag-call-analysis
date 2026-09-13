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
Taxonomy**, **API**, **Settings**, and an **Operations** group holding **Admin**. The sidebar
collapses to a 64px icon rail, and drops into a drawer under 1024px wide. Nothing about the shell
changes between a reviewer's screen and an operator's — Admin is just another item in the same
navigation.

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

A **date-range control** sits at the top: 7 days, 30 days, 90 days, 12 months, All time, or a
custom from/to pair. The window is resolved on the server and snapped to whole days, so a link you
send someone reproduces the dashboard you were looking at rather than theirs — and the window is
carried into every drill-through, so the calls list you land on always agrees with the chart you
clicked. A note reports how many calls the window excluded, so an empty dashboard is never
mistaken for no data. Switching range is instant: it re-aggregates rows already in memory rather
than going back to the Knowledge Box.

A six-tile stat strip — Calls, First-call resolution, Complaint rate, Cross-sell accepted, Avg
compliance, Avg CSAT — sits below it; every tile is a link into the calls table pre-filtered (or
pre-sorted) to that segment, so clicking "Complaint rate" lands on every complaint-flagged call.
Below that, the charts break the same data down by call reason, sentiment, outcome, line of
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
- **Columns** — Call, Date, Duration, Agent/Queue, Reason, Outcome, Sentiment and Status by
  default — sort by clicking the header; clicking again reverses the order.
- **Columns**, next to the filter bar, opens a picker with every available column: Queue, CSAT,
  Compliance, Line of business, Media type, Complaint and Escalated on top of the defaults. Call
  cannot be hidden — a table of rows you cannot open is not a shorter table. A **density** toggle
  switches between comfortable and compact rows. Both are *your* preferences: they are kept in
  your browser and deliberately never in the URL, because a link you send a colleague should carry
  the question, not your taste in row heights.
- **Saved views** turn the current filter stack into a named view — "Escalated complaints",
  "Agent: Dana, negative sentiment". Unlike columns and density, a view is stored on the server and
  seen by everyone who uses the deployment, because a rota of supervisors reviewing the same queue
  should be looking at the same definition of it. Views can be renamed, updated to the current
  filters, and deleted, from the calls list or from Settings → Saved views.
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
links can be copied again or revoked from the same dialog — and **Settings → Share links** lists
the whole register across every call, filterable by state, so links can be reviewed and revoked
from one place rather than only from the call they point at.

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

This screen is an **editor**, not a report. A visitor sees it read-only with a route to sign in;
an operator (or any caller with the product's write credential) can:

- **Create a labelset** — an id, a title, a colour, whether several of its labels may apply to one
  call, whether it classifies whole calls or transcript blocks, and its labels. Every label needs a
  description, because the description is the instruction the agent actually reads. Saving writes
  the labelset to the Knowledge Box in the same action.
- **Edit one** — the id is fixed once created, because renaming it would orphan every label
  already applied under the old one. Saving re-provisions it, so the screen and the Knowledge Box
  cannot disagree.
- **Delete one** — the confirmation offers a second, separate choice: *also remove it from the
  Knowledge Box*. Leaving that unticked removes it from the product's vocabulary only, and
  analysed calls keep the labels already applied with it. Ticking it destroys those labels. They
  are data, not configuration, which is why it is never the default.
- **Edit an agent** — enable or disable it, change the model, and rewrite the instructions. For
  `call-insights` those instructions are the prompts that produce the narrative analysis and the
  metrics, shown as editable text. A labeler agent's operations are not editable, because they are
  *derived* from the current labelsets — which is what stops a labelset edit and the agent that
  applies it from drifting apart.
- **Start or stop an agent**, and re-provision everything. A Knowledge Box allows exactly one
  running task per operation type, so starting an agent that already has one fails rather than
  quietly queueing a second, and an edited instruction takes effect on the next provision rather
  than mid-run.

## 9. API (`/api`)

Every operation this deployment declares, grouped by tag, with its description, its parameters and
its request and response schemas — and a **try-it** form that calls the live endpoint, either with
your session or with an API key you paste, showing the status, the timing, the headers and the
response body. Each operation also offers a copyable curl command.

The list is not hand-maintained: the page fetches `/api/v1/openapi.json` from the running
deployment, so what you see is provably what this deployment serves, and an operation added to the
contract appears here on its own. A pasted key lives only in the page's memory — never in browser
storage, never in the URL, and never in the generated curl, which emits a placeholder. Destructive
operations take a second click, because the form calls the real API against the real Knowledge
Box.

## 10. Settings (`/settings`)

Nine tabs, each one a linkable address (`/settings?tab=…`):

- **Connection** — mode (sample or live), Knowledge Box, generative model, reranker and timeout.
  Editable by an operator; the service-account credential can be set or rotated but is shown only
  as "set · rotate" and is never returned to the browser.
- **Branding** — the white-label identity with a preview that moves as you type: product name,
  tagline, footer line, the "powered by" credit, primary and accent colours, the docs and support
  links, and a logo you drop onto the page (SVG, PNG, JPEG or WebP, up to 512 KB) with a
  **Remove logo** control beside it.
- **Limits** — maximum upload size, maximum question length, the rate limit and the read-cache TTL.
- **Retention** — a policy in days, a preview of exactly which calls it covers, and the purge.
- **API keys** — issue, rename and revoke. A new key's material is shown once, at creation.
- **Share links** — every link this deployment has ever issued, across every call, filterable by
  state and revocable from one place.
- **Saved views** — the shared views from the calls list, renameable and deletable.
- **Usage** — operator counters (a signed-out or non-operator visitor sees an explanation instead
  of the numbers).
- **About** — versions, licence, the agents in the taxonomy, and links to the API documentation.

Every value here is editable and persists: environment variables are what the deployment *started*
with, and once a section is edited the product is the authority. Each section carries a **Reset to
environment default**. A change is in force for the very next page, with no restart — change the
primary colour and the shell you are looking at is repainted on the next navigation. Everything
you change is recorded in the audit trail.

A visitor who is not signed in as an operator sees the same screens with the values shown
read-only and a link to sign in, rather than a form that fails when they press Save.

## 11. "How this works" (every page)

Top-right of the dark Progress Agentic RAG band is a **How this works** button (it moves to the
sidebar foot on a white-labelled deployment that has hidden the band). Open it on the Calls page,
then again on a call workspace, to see two genuinely different real flows side by side:
classification-and-search versus transcription-and-scoped-ask. Each step names the actual ARAG
mechanism this page's own server code calls, and it changes per route.

## Resetting a demo run

Everything you clicked above — chat history, active filters, table selection, the search query,
your chosen columns and row density — lives only in your browser and in the URL. A hard reload or
a fresh incognito tab resets it instantly. The underlying data (the mock's seeded calls, or a live
Knowledge Box's real calls) is untouched by browsing; use the calls table's bulk delete, or the
operator console, to actually remove calls.

Three things you may have created above are *not* browser-local, because they are shared state:
saved views, share links, and anything you changed in Settings or in Agents & Taxonomy. Remove a
saved view from Settings → Saved views, revoke a share link from Settings → Share links, and put a
settings section back with its **Reset to environment default** control.
