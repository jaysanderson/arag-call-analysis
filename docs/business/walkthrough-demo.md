# Demo walkthrough

A click-by-click tour of the demo application. Start it with no credentials at all:

```bash
make install
make dev
```

Open **http://localhost:3000**. Everything below works immediately — the mock ARAG server has
already been seeded with real transcripts and run through the same labeling and analysis agents a
live Knowledge Box would use, so nothing on screen is a static mockup.

## 1. Dashboard (`/`)

The landing page is the aggregated view across every analyzed call. At the top: total call count,
first-call-resolution rate, complaint rate, cross-sell acceptance (with the offer rate as a
sub-metric), average compliance score, and average CSAT — each tile is a link into the calls list
pre-filtered to that segment (click "Complaint rate," land on every complaint-flagged call).
Below the tiles, charts break the same data down by call reason, sentiment, outcome, line of
business and complaint category, plus a cross-sell funnel. At the bottom, a strip of the most
recent calls as cards. Every number here is a live aggregation of each call's own
AI-generated `call_metrics` field — nothing is hand-entered (see
[How this works](#how-this-works-every-page) below).

## 2. Calls (`/calls`)

Click **"Browse calls"** or the **Calls** nav item. Two things happen above the fold: a set of
horizontal **category rails** (Netflix-style) — the top sentiment category and the top one-or-two
call-reason categories, each with a live count and "See all" link — followed by the full,
filterable catalogue.

- **Filters** (left column): facet chips for call reason, outcome, sentiment, line of business and
  disposition flags, each showing a live count. Click one or several — filters AND together — and
  the results update. Click "Clear N filters" to reset.
- **Search** (top of the filter column): type into "Search transcripts…" — this is real full-text
  and semantic search across every transcript, not a title match. Try "duplicate charge" or
  "denied" and watch the results narrow to calls that actually discuss it.
- Every result renders as a card: a colored "moment map" thumbnail (a strip showing where in the
  call complaints, escalations, cross-sell pitches and resolutions occurred), a media-type badge
  (audio/video/transcript), sentiment and call-reason chips, the date, and "Agent: <name> (queue)."

## 3. A call detail page

Click any card with a **video** or **audio** icon (transcript-only calls skip the player). You'll
see:

- **The media player** at top, with native browser controls.
- **The transcript**, synced to playback — as the recording plays, the current line highlights
  automatically. Each transcript block that ARAG's paragraph labeler tagged carries small colored
  chips (Complaint, Escalation, Cross-sell Pitch, Compliance Disclosure, Sensitive/PII, ...).
  Click a chip to filter the transcript down to only blocks with that moment; click a timestamp or
  any transcript line to seek the player there.
- **The AI Analysis panel** (right side, below the chat): the executive summary, key topics, an
  agent scorecard (empathy/compliance/resolution as progress bars), a complaint callout if one was
  raised (with severity and a supporting quote), a cross-sell callout (offered/accepted, with any
  objection), action items, risk flags, and notable quotes attributed to Agent or Member.

## 4. The wow moment — "Ask this call"

Above the analysis panel is the chat box. Click one of the suggested questions ("Summarize this
call," "Was the member satisfied?," "What did the agent offer?") or type your own — questions are
limited to 500 characters and are answered **only from this call's own transcript**, never from
any other call or outside knowledge.

Watch the answer stream in token by token, with numbered **`[1]` `[2]`** citation markers spliced
directly into the prose at the point they support. Click a citation marker or the source chip
beneath the answer: the media player scrubs to that exact moment and the corresponding transcript
line highlights and scrolls into view. Ask a follow-up ("What was the resolution?") and the same
grounding and citation behavior applies to every turn.

Next to each answer, a **confidence badge** — "High confidence," "Moderate confidence," "Low
confidence," or "No grounded citations" — reflects how well the answer is actually supported by
the retrieved transcript (backed by a real ARAG relevance/groundedness score once it resolves,
with an instant citation-coverage estimate shown while it does). Ask something the transcript
genuinely doesn't cover ("What insurance company does the member work for?") and the honest
answer is a decline — deliberately shown with **no** confidence badge at all, since a confidence
reading next to "not enough data to answer this" would be self-contradicting.

## 5. "How this works" (every page)

Top-right of the dark Progress Agentic RAG band on every route is a **"How this works"** button.
Open it on the Calls page, then again on a call detail page, to see two genuinely different real
flows side by side: classification-and-search (labeler agents → catalog/find) versus
transcription-and-scoped-ask (paragraph timestamps → citation resolution → REMi scoring). Each
step names the actual ARAG mechanism this page's own server code calls — it is not a generic
marketing diagram, and it changes per route (there's a distinct one for the dashboard, the calls
list, a call detail page, and the admin console).

## Resetting a demo run

Everything you clicked above — chat history, active filters, the search query — lives only in
your browser. A hard reload or a fresh incognito tab resets it instantly with no server-side
action needed. The underlying data (the mock's seeded calls, or a live Knowledge Box's real calls)
is untouched by browsing.
