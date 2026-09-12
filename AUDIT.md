# AUDIT — Call Analysis (`call-analysis`)

Audited 2026-09-12. Repo HEAD `2b3a3aa` (3 Sep 2026) matches the deployed Fly machine (`call-analysis-arag`, updated 2026-09-03).

## Stack

| Item | Value |
|---|---|
| Runtime | Node 20+, **Next.js 16.1 (App Router) + React 19.2**, TypeScript 5.7, Tailwind CSS 4 |
| Package manager | npm (`package-lock.json`, `npm install` in Dockerfile) — **violates the no-npm constraint** |
| Tests | **None** |
| Deploy | Multi-stage `Dockerfile` (standalone output), `fly.toml`, region `iad`, 1 GB |
| Config | `ARAG_BASE`, `ARAG_KB_ID`, `ARAG_API_KEY`, `ARAG_GENERATIVE_MODEL` (`.env.local`) |
| Seeding | `scripts/` (tsx): labelsets, 24 synthetic calls rendered with macOS `say` + `ffmpeg`, ingest, run DA agents |

## ARAG features used (verified)

- Resource create `POST /resources` (text field transcripts, `origin`, `extra.metadata`), file field upload `POST /resource/{rid}/file/{field}/upload` (MP3/MP4 → ARAG transcription with `start_seconds`/`end_seconds` paragraphs).
- `GET /resource/{rid}?show=basic,values,extracted,origin,extra&extracted=text,metadata` — transcript, paragraphs, paragraph classifications, generated DA fields.
- `POST /catalog` (listing), `POST /find` (full-text + semantic search across transcripts), `GET /labelsets`, `POST /labelset/{id}`.
- **Data Augmentation agents** via `GET /tasks`, `POST /task/start`, `DELETE /task/{id}`: two `labeler` tasks (resource-level `on=1`, paragraph-level `on=0`) and one `ask` task with two operations writing `da-call_analysis-*` and `da-call_metrics-*` text fields (JSON emitted as text because KV schema registration returned 404/500).
- `POST /ask` scoped with `resource_filters:[id]`, `citations:true`, streamed NDJSON straight to the browser; citation keys `<rid>/f/media/<start>-<end>` mapped to paragraphs → timestamps.
- `POST /predict/remi` (REMi answer-quality scoring) appended to the stream as a synthetic `quality` item.
- `GET /resource/{rid}/file/{field}/download/field` with `Range` passthrough (media proxy).

## Architecture

Server components (`app/page.tsx`, `app/calls/[id]/page.tsx`) call `lib/calls.ts` directly; client components call `app/api/*` route handlers which call `lib/arag.ts`. `lib/parse.ts` turns raw ARAG resources into `CallSummary`/`CallDetail` view models (labels, moment track, generated JSON fields, paragraphs). `lib/calls.ts` builds the dashboard by fetching **every resource individually** (`Promise.all` over up to 200 ids) on every request.

## What works

- Rich, genuinely ARAG-native feature set: transcription with timestamps, DA-agent labelling at two granularities, generated analysis + metrics JSON, scoped grounded chat with clickable citations that scrub media, REMi confidence.
- Live deployment healthy: dashboard aggregates 24 calls, all with metrics.
- Good defensive parsing (`sanitizeMetrics`, code-fence stripping, OCR paragraph filtering, hydration-safe date formatting).
- Well-documented ARAG gotchas in `docs/ARAG_NOTES.md` (one running task per operation type, `llm` block required, `/resource/{id}/ask` returns no retrieval on this KB).
- Brand tokens for Progress ARAG already encoded in `app/globals.css` (reused by the shared UI kit).

## What is broken or weak

1. **No tests of any kind**, no lint, no CI.
2. **npm everywhere** (lockfile, Dockerfile, README). Build must move to bun with pinned versions; the corporate registry also blocks `next@16.3.5` (the version `^16.1.6` resolves to), so exact pins are mandatory.
3. **Not API-first.** `app/api/*` are thin UI proxies (unversioned, no OpenAPI, no validation); server components bypass the API entirely and call `lib/` directly; the media route trusts a caller-supplied `field` name.
4. **Performance:** `dashboard()` and `listCalls()` do N+1 resource fetches on every page view with no caching; `CategoryRails` issues one `/api/calls` per rail (each again N+1). At 200 calls this is ~600 ARAG calls per page.
5. **Security:** no auth (anyone can stream any resource's media by id), no rate limiting, `String(e)` error bodies leak ARAG URLs/KB ids to the browser (500 handlers), `/api/calls/[id]/ask` accepts unbounded question length, service-account key is a *manager*-scope key per README.
6. **Seeding is macOS-only** (`say`) and lives outside the product: no API to add a call, no visibility into agent task status, no way to (re)provision labelsets/agents from the app.
7. `tsconfig` lacks `types:["node"]` so `tsc --noEmit` fails on `scripts/*` (8 errors).
8. README is a changelog of demo-polish passes rather than product documentation; no `LICENSE`, `CONTRIBUTING`, `SECURITY`, changelog.

## Security review

| Area | Finding | Action |
|---|---|---|
| Secrets | Server-only; media proxied | Keep; document key scope (reader + DA tasks) |
| Input validation | `q`, `label`, `id`, `field`, `question` unchecked | OpenAPI-driven validation; `field` allowlist (`media`,`transcript`) |
| Auth | None | Admin token; optional API keys |
| Error handling | Raw exceptions returned | RFC 9457 problem details, no upstream URLs |
| Rate limiting | None | Platform token bucket |
| Dependencies | 8 packages, npm | bun, exact pins, `bun audit` in CI |

## Keep vs rewrite

| Keep | Rewrite |
|---|---|
| Next.js 16 / React 19 / Tailwind 4 stack (documented reason to keep: mature app, server-side rendering suits the dashboard; no audit reason to change runtime) | Package management → bun with exact pins + overrides; Dockerfile → bun |
| `lib/parse.ts`, `lib/confidence.ts`, `lib/format.ts` (pure, testable) | `lib/arag.ts` → shared platform client |
| Taxonomy, agent definitions, scenario scripts | Seed pipeline → product API + admin jobs (upload call, provision labelsets/agents, task status), TTS rendering optional/off-platform |
| Components (chrome, cards, rails, charts, chat, markdown) restyled onto the UI kit | `app/api/*` → `/api/v1/*` from OpenAPI spec; server pages consume the same service layer the API uses |
| ARAG_NOTES gotchas → docs | Add caching layer (catalog + summaries, TTL, invalidation on upload) |
