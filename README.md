# Call Analysis

A call-intelligence application built **entirely on top of Progress Agentic RAG (ARAG / Nuclia)**.
It ingests call recordings (MP3 / MP4) and transcripts, lets ARAG transcribe, auto-label, and
analyze them with **data augmentation agents**, and presents the results in a Next.js UI:

- **Dashboard** - KPIs and charts aggregated from each call's AI-generated metrics JSON.
- **Calls** - Netflix-style category rails (by sentiment, by call reason) plus a filterable,
  searchable full list driven by ARAG classification labels and full-text search.
- **Call detail** - media player with a **synced, searchable transcript**, paragraph-level
  "moment" labels, an **AI analysis** panel, and a **chat** grounded only in that call. Clicking a
  chat citation (inline `[1][2]` markers in the answer, or the source chip under it) **scrubs the
  audio/video** to that moment and highlights the transcript line it came from.

The demo dataset is ~24 realistic **health-insurance** calls (complaints, cross-sells, claims,
prior-auth denials, retention saves, ...) but the app itself is domain-agnostic - this build is
shipped as a **generic Progress demo** (no named-customer branding), field-usable for any
contact-centre / call-analysis conversation.

---

## 3 September 2026 - defect fix pass (this revision)

Redevelop against the 3 Sep 2026 demo-estate audit, which graded this app **B** and named
three defects (plus a data-hygiene finding it flagged separately): flat gradient+icon card
thumbnails (standard B10 FAIL), the cold-refusal string leaking into the Line of Business
chart as a category, and agent names shown without a role (standard B14). This pass also
brings the confidence badge up to the newer B34/B39 bar (a genuine REMi-derived read, not a
citation-coverage proxy) and replaces the icon-in-a-box logo with a crafted wordmark
(standard B41). **The KB and every ARAG call shape are still unchanged**, with one addition:
`lib/calls.ts`'s `SUMMARY_SHOW` now includes `"extracted"` (it was missing entirely, which is
why the card thumbnails below rendered empty until this was found and fixed the same pass),
and the ask route now taps its own streaming response server-side to fire one additional
`/predict/remi` call after each answer finishes.

What changed:
- `lib/parse.ts` - `sanitizeMetrics()` validates every generated metrics field against its
  known taxonomy enum before it reaches a chart; `extractMomentTrack()` derives a per-call
  paragraph-moment sequence from data already fetched (no extra ARAG cost).
- `components/ui.tsx` - `CallThumb` renders that moment sequence as a real per-call "moment
  map" (coloured bars) instead of a flat gradient+icon tile; falls back to the plain tile only
  when a call genuinely has no moment data yet.
- `components/CallCard.tsx` - agent names on cards now read "Agent: <name>".
- `lib/arag.ts` / `app/api/calls/[id]/ask/route.ts` / `lib/confidence.ts` /
  `components/ChatPanel.tsx` - the confidence badge is now backed by a real `/predict/remi`
  call scored against the FULL retrieved context (not just cited excerpts), with the existing
  citation-coverage heuristic as an instant floor shown while REMi resolves. Model/cost: this
  is one query-time `/predict/remi` call per chat turn (Nuclia-managed predict model, not a
  choice this app makes) - not a corpus-wide operation, so hard rule 15's cost-safety gate
  doesn't bind it, but it is genuinely bounded (one call per question asked, never per
  paragraph, never per corpus).
- `components/AppChrome.tsx` - a crafted five-bar "pulse" wordmark replaces the letter-in-a-
  rounded-square glyph.
- `components/HowThisWorks.tsx` - the dashboard and call-detail flows now describe the
  metrics/analysis fields accurately (parsed server-side from the model's plain-text response,
  since ARAG's native DA JSON-schema output isn't available on this platform yet - hard rule
  3's corollary), and the call-detail flow gained a sixth step naming the REMi scoring call.

Verified live post-deploy: the Line of Business chart no longer shows the refusal string (23
of 24 calls now chart cleanly, the one call whose generated value failed validation is simply
excluded rather than mis-rendered); all 24 calls carry real per-call moment tracks; a live ask
round-trip returned a genuine REMi `quality` event (`answerRelevance:4, groundedness:4,
contextRelevance:1.6` on this probe) driving a "High confidence" badge.

---

## 2 September 2026 - front-end re-polish

Redeveloped to the factory's current demo polish bar. **Hard constraint honoured throughout:
the Knowledge Box and every ARAG call are unchanged** - same `/ask` scoping, same Labeler/Ask
data-augmentation agents, same routes, same data layer (`lib/arag.ts`, `lib/calls.ts`,
`lib/parse.ts` are untouched). This was a presentation-layer rebuild only.

What changed (all in `app/`, `components/`, `lib/format.ts`, `lib/confidence.ts` and
`app/globals.css` - the frontend files):

- **Two-layer brand chrome** - a compliant Progress Agentic RAG header band on every route
  (real logo, correct palette), the Call Analysis product's own identity beneath it, and a
  discreet "Built on Progress Agentic RAG" footer credit. ARAG's own mechanics are never shown
  in the default view - only inside the opt-in reveal below.
- **"How this works" reveal** (top-right, every route) - a real, page-specific, animated flow
  diagram of what THIS page's own code does (which ARAG mechanism, in what order), what the
  page is doing in plain terms, and why it matters. Not a generic marketing diagram.
- **Inline citation markers** - the chat answer now splices numbered `[1] [2]` superscript
  markers into the answer prose at the exact character offset ARAG's own `/ask` citations map
  already returns for the answer text, instead of a plain source-chip row underneath.
- **A qualitative confidence badge** on every chat answer, derived from real citation coverage
  of that answer (never a raw score, never hidden behind a click) - "High confidence" /
  "Moderate confidence" / "Low confidence" / "No grounded citations".
- **A real markdown renderer** (`components/Markdown.tsx`, dependency-free) for every
  AI-generated text surface (chat answers, the executive summary) - including the documented
  "loose list" case where ARAG returns a blank line between every list item.
- **Category rails on the Calls page** (`components/CategoryRails.tsx`) - live-count rows by
  sentiment and call reason, Netflix-pattern, above the existing filter sidebar + full list.
- **One consistent card system** (`components/CallCard.tsx`, `components/ui.tsx`) used on the
  dashboard, the rails and the full list - a consistent branded placeholder thumbnail per media
  type (a phone call has no natural cover image, so this is deliberate, not a stand-in stock
  icon), metadata chips, date and agent line on every card.
- Full responsive pass, including a real mobile drawer nav with a solid backdrop, and a branded
  404 / not-found page.

Nothing in this revision touches `lib/arag.ts`, `lib/calls.ts`, `lib/parse.ts`, any `app/api/*`
route's ARAG call shape, or `scripts/*` (KB provisioning/seeding). The KB id, service-account
key and generative model are exactly as they were.

### Demo narrative - what to click, what to ask

1. **Dashboard** (`/`) - land on the KPI strip (first-call resolution, complaint rate,
   cross-sell accept rate, avg compliance, avg CSAT) and the charts below. Everything here is a
   real aggregate over the seeded calls' AI-generated metrics, not a static mock. Click any KPI
   or chart segment to drill into the filtered call list.
2. **Calls** (`/calls`) - the category rails up top ("Positive" sentiment, top call reasons)
   show live counts and real cards; scroll a rail or hit "See all". Below, the facet sidebar
   (call reason, outcome, sentiment, line of business, disposition flags) filters the full
   catalogue live, and the search box does real full-text search across every transcript.
3. **A call detail page** - open any call with a **video** or **audio** icon. Play it, watch
   the transcript auto-scroll and highlight in sync. Try the transcript's own moment filters
   (Complaint, Escalation, Cross-sell Pitch, ...).
4. **The wow moment - Ask this call.** Click a suggested question ("Summarize this call", "Was
   the member satisfied?") or type a follow-up. Watch the numbered `[1] [2]` citation markers
   land inline in the answer as it streams, then click one - it scrubs the player to that exact
   moment and highlights the transcript line it came from. Note the confidence badge next to
   the answer.
5. **"How this works"** (top-right, every page) - open it on the Calls list and again on a call
   detail page to see the two different real flows (classification + search vs. transcription +
   scoped `/ask`) side by side.

### 30-second reset

The KB is frozen for this revision - nothing here re-provisions or re-ingests it. If a live
demo run needs a clean slate (an ask conversation was left mid-thread, filters were left
applied), the fastest reset is simply a hard reload / fresh incognito tab, since all app state
(chat history, active filters, search query) lives only in the browser, never server-side. A
full data reset (only if the underlying demo content itself needs to change) is still the
original pipeline: `npm run kb:reset -- --labelsets && npm run seed` (see below) - this was not
run as part of this revision and is unchanged from before it.

---

## How it maps onto ARAG

Everything is ARAG-native - the app stores nothing of its own. See
[`docs/ARAG_NOTES.md`](docs/ARAG_NOTES.md) for the exact endpoints and hard-won gotchas.

| Capability | ARAG mechanism |
|---|---|
| Transcription + timestamps | Upload MP3/MP4 -> ARAG transcribes into `TRANSCRIPT` paragraphs with `start_seconds`/`end_seconds` |
| Resource labels (call_reason, outcome, sentiment, line_of_business, disposition_flags) | **Labeler agent** (`on=1`) -> `computedmetadata.field_classifications` |
| Paragraph "moment" labels (Complaint, Cross-sell Pitch, Escalation, PII, ...) | **Labeler agent** (`on=0`) -> per-paragraph `classifications` |
| AI analysis JSON (summary, scorecard, complaint, cross-sell, quotes) | **Ask agent** -> generated field `da-call_analysis-*` |
| Aggregatable metrics JSON (drives the dashboard) | **Ask agent** -> generated field `da-call_metrics-*` |
| Scoped chat + citations | KB `/ask` with `resource_filters:[id]` + `citations` |

The service-account key is **server-side only** - the browser talks to Next.js API routes
(`app/api/*`) which proxy ARAG, including a range-aware media proxy so the player can stream and
seek without ever seeing the key.

---

## Setup

Requires Node 20+, plus `ffmpeg` and macOS `say` for generating the demo media.

```bash
npm install
```

Configure `.env.local` (already present for the demo KB):

```
ARAG_BASE=https://aws-us-east-2-1.dp.progress.cloud/api/v1
ARAG_KB_ID=<knowledge-box-id>
ARAG_API_KEY=<service-account-key>     # manager key - never shipped to the browser
ARAG_GENERATIVE_MODEL=chatgpt-azure-4o # optional; KB's managed model
```

## Seed the knowledge box

One command: create labelsets -> render 24 calls (TTS + ffmpeg) -> ingest -> wait for
transcription -> run the augmentation agents. **Not run for the 2 September 2026 revision** -
the KB was left exactly as it was; this is unchanged reference documentation.

```bash
npm run seed            # add --reset to wipe the KB first
```

Useful sub-steps and utilities:

```bash
npm run kb:setup        # (re)create labelsets only
npm run data:gen        # render media to scripts/output/ + manifest
npm run data:ingest     # ingest the manifest, then run agents
npm run kb:reset        # delete all resources + tasks (add --labelsets to drop labelsets too)
```

## Run the app

```bash
npm run dev             # http://localhost:3000
```

---

## Project layout

```
app/                     Next.js App Router
  page.tsx               Dashboard (aggregates call_metrics)
  calls/page.tsx         Category rails + filterable call list
  calls/[id]/page.tsx    Call detail (player + transcript + chat + analysis)
  api/                   Key-safe ARAG proxies (calls, detail, ask-stream, media, dashboard)
  not-found.tsx          Branded 404
  loading.tsx            Route-level loading skeleton
lib/
  arag.ts                Server-only ARAG client (unchanged this revision)
  calls.ts               List / detail / dashboard data layer (unchanged this revision)
  parse.ts               ARAG resource JSON -> typed view models (unchanged this revision)
  confidence.ts           Qualitative confidence label from real citation coverage (new)
  types.ts, format.ts
components/
  AppChrome.tsx           Two-layer brand chrome + mobile nav drawer (new)
  HowThisWorks.tsx        Per-route solution-architecture reveal (new)
  Markdown.tsx             Dependency-free markdown + inline-citation renderer (new)
  CallCard.tsx, CategoryRails.tsx   Card system + Netflix-pattern rails (new)
  DashboardCharts.tsx, CallsExplorer.tsx, CallDetailView.tsx, ChatPanel.tsx, AnalysisPanel.tsx, ui.tsx
scripts/
  config/taxonomy.ts     Labelsets + augmentation-agent definitions
  config/scenarios.ts    The 24 demo call scripts
  lib/                    Media generation (say+ffmpeg), ingest, KB ops
  seed.ts                End-to-end seed pipeline
docs/ARAG_NOTES.md       Confirmed ARAG API mechanics
```

> Note: the augmentation agents require an LLM block (`{model, provider:"openai"}`) and can only
> run one task per operation type at a time, so the seed runs them **sequentially**. Details in
> `docs/ARAG_NOTES.md`.
