# Call Analysis

A call-intelligence application built **entirely on top of Progress Agentic RAG (ARAG / Nuclia)**.
It ingests call recordings (MP3 / MP4) and transcripts, lets ARAG transcribe, auto-label, and
analyze them with **data augmentation agents**, and presents the results in a Next.js UI:

- **Dashboard** — KPIs and charts aggregated from each call's AI-generated metrics JSON.
- **Calls** — filterable, searchable list driven by ARAG classification labels + full-text search.
- **Call detail** — media player with a **synced, searchable transcript**, paragraph-level
  "moment" labels, an **AI analysis** panel, and a **chat** grounded only in that call. Clicking a
  chat citation (or a transcript line) **scrubs the audio/video** to that moment.

The demo dataset is ~24 realistic **health-insurance** calls (complaints, cross-sells, claims,
prior-auth denials, retention saves, …) but the app itself is domain-agnostic.

---

## How it maps onto ARAG

Everything is ARAG-native — the app stores nothing of its own. See
[`docs/ARAG_NOTES.md`](docs/ARAG_NOTES.md) for the exact endpoints and hard-won gotchas.

| Capability | ARAG mechanism |
|---|---|
| Transcription + timestamps | Upload MP3/MP4 → ARAG transcribes into `TRANSCRIPT` paragraphs with `start_seconds`/`end_seconds` |
| Resource labels (call_reason, outcome, sentiment, line_of_business, disposition_flags) | **Labeler agent** (`on=1`) → `computedmetadata.field_classifications` |
| Paragraph "moment" labels (Complaint, Cross-sell Pitch, Escalation, PII, …) | **Labeler agent** (`on=0`) → per-paragraph `classifications` |
| AI analysis JSON (summary, scorecard, complaint, cross-sell, quotes) | **Ask agent** → generated field `da-call_analysis-*` |
| Aggregatable metrics JSON (drives the dashboard) | **Ask agent** → generated field `da-call_metrics-*` |
| Scoped chat + citations | KB `/ask` with `resource_filters:[id]` + `citations` |

The service-account key is **server-side only** — the browser talks to Next.js API routes
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
ARAG_API_KEY=<service-account-key>     # manager key — never shipped to the browser
ARAG_GENERATIVE_MODEL=chatgpt-azure-4o # optional; KB's managed model
```

## Seed the knowledge box

One command: create labelsets → render 24 calls (TTS + ffmpeg) → ingest → wait for transcription →
run the augmentation agents.

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
  calls/page.tsx         Filterable call list
  calls/[id]/page.tsx    Call detail (player + transcript + chat + analysis)
  api/                   Key-safe ARAG proxies (calls, detail, ask-stream, media, dashboard)
lib/
  arag.ts                Server-only ARAG client
  calls.ts               List / detail / dashboard data layer
  parse.ts               ARAG resource JSON → typed view models
  types.ts, format.ts
components/               Dashboard charts, calls explorer, detail view, chat, analysis
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
