# Call Analysis

Contact-centre call intelligence built entirely on **Progress Agentic RAG (ARAG)**.

Upload a call recording. ARAG transcribes it into timestamped paragraphs, data-augmentation agents
classify the whole call and every individual moment in it, and a second agent writes a structured
analysis and a flat set of metrics. The app is a single shell around that pipeline:

- **Dashboard** (`/`) — a stat strip, charts and a sortable breakdown by agent or by queue, every
  tile and row drilling through into the filtered calls underneath it.
- **Calls** (`/calls`) — a searchable, filterable, sortable table with bulk export/re-analyse/
  delete, plus a category-rail browse mode for discovery; every call carries a lifecycle status
  (queued, transcribing, labelling, partly analysed, analysed, failed).
- **A call workspace** (`/calls/[id]`) — a media player with a moments track under the scrub bar,
  a synced transcript, and an inspector with Analysis, Ask and Details tabs. Ask answers a
  question only from that call's own transcript, with citations you can click to scrub the
  recording to the exact second the answer came from, and it can be shared as a revocable,
  expiring read-only link.
- **Upload** (`/upload`) — drop a recording or paste a transcript and watch the ingest job's own
  progress stream; an ingest history lists every run this deployment has made.
- **Agents & Taxonomy** (`/taxonomy`) — the labelsets and the data-augmentation agents, editable:
  create, edit, delete and provision a labelset; enable, disable, re-instruct, start and stop an
  agent. The shipped health-insurance vocabulary is a starting point, not a constraint.
- **API** (`/api`) — an in-product explorer generated from the served OpenAPI document: every
  operation with its parameters and schemas, a try-it form against the live deployment, the
  response, and a copyable curl.
- **Settings** (`/settings`) — connection, branding (including a logo upload), limits, retention
  and purge, API keys, share links, saved views, usage and about. Everything here is editable and
  persists; environment variables are defaults the store overrides.
- **Admin** (`/admin`) — the same live-read operator console, in the same shell, with jobs (and
  job cancellation), logs, usage, security and an audit trail of every configuration change.

First run lands on **Get started** (`/welcome`) instead of an empty dashboard, with a real sample
dataset one click away.

Everything the UI does, it does through the public API. There is no private back channel.

```
┌──────────────┐   /api/v1   ┌────────────────┐   AragClient   ┌───────────────────┐
│ demo app /   │────────────▶│ services/ +    │───────────────▶│ Progress Agentic  │
│ admin /admin │             │ 60 s TTL cache │                │ RAG Knowledge Box │
└──────────────┘             └────────────────┘                └───────────────────┘
```

## Run it in two minutes, with no credentials

```bash
make install
make dev          # http://localhost:3000
```

With no `ARAG_API_KEY` in `.env`, the app starts an **in-process mock ARAG server**, seeds it with
synthetic health-insurance call transcripts, and runs this product's own labeler and ask agents over
them. The dashboard, the filters, the transcript moment chips, the analysis panel and the grounded
chat all work immediately — the demo is real, only the Knowledge Box is simulated.

The admin panel is at <http://localhost:3000/admin> (token `dev-admin-token` in mock mode).
The API contract is at <http://localhost:3000/api/v1/docs> (Redoc) and
<http://localhost:3000/api/v1/swagger> (try-it-out).

### Against a real Knowledge Box

```bash
cp .env.example .env     # fill in ARAG_KB_ID, ARAG_API_KEY, ARAG_REGION, ADMIN_TOKEN
make dev
make provision           # create the labelsets and start the augmentation agents
```

## The API

| | |
|---|---|
| `GET /api/v1/calls` | list, search (`q`) and facet-filter (`label=labelset/label`), paginated |
| `GET /api/v1/calls/{id}` | transcript, paragraph moments, labels, metrics and the generated analysis |
| `GET /api/v1/calls/{id}/media` | streams the recording through the server (Range → 206, so the player can scrub) |
| `POST /api/v1/calls/{id}/ask` | NDJSON answer stream scoped to one call: retrieval, answer, citations, and a REMi answer-quality item |
| `POST /api/v1/calls` | multipart upload of a recording or a transcript → `202` with a job (admin token or API key) |
| `DELETE /api/v1/calls/{id}` | remove the call and its Knowledge Box resource (admin token or API key) |
| `GET /api/v1/dashboard` | aggregated metrics over a date window (`range=7d\|30d\|90d\|12m\|all`, or `from`/`to`) |
| `GET /api/v1/labelsets`, `POST`, `GET/PUT/DELETE /{id}`, `POST /{id}/provision` | the editable labelset taxonomy, provisioned into the Knowledge Box |
| `GET /api/v1/agents`, `PUT/DELETE /{key}`, `POST /{key}/start` | the data-augmentation agents: enable, re-instruct, start, stop |
| `GET /api/v1/settings`, `PUT/DELETE /{section}`, `POST/DELETE /settings/logo` | every deployment setting, editable and persisted |
| `GET/POST /api/v1/api-keys`, `PUT/DELETE /{id}` | issue, name and revoke API keys (stored hashed; shown once) |
| `GET/POST /api/v1/views`, `PUT/DELETE /{id}` | saved, shared filter sets on the calls list |
| `GET /api/v1/shares` | every share link this deployment has issued |
| `GET /api/v1/retention/preview`, `POST /api/v1/retention/purge` | what the retention policy would remove, and removing it |
| `GET /api/v1/branding` | the deployment's white-label identity (name, logo, colours, credits) |
| `GET /api/v1/jobs`, `/jobs/{id}`, `/jobs/{id}/events`, `DELETE /jobs/{id}` | background work, with SSE progress and cancellation |
| `POST /api/v1/session` | same-origin session cookie for the demo UI when `API_KEYS` is set |
| `/api/v1/admin/*` | health, config, usage, logs, agents, provision, cache, audit (admin token required) |

All 60 operations are listed, described and callable in the product itself at `/api`.

Full reference: [`docs/developer/api-reference.md`](docs/developer/api-reference.md), generated from
the spec by `make docs`. The spec itself is authored in [`lib/openapi.ts`](lib/openapi.ts) and is the
single source of truth: it drives request validation, the served documentation and the contract
tests.

## How it works

1. **Ingest.** A recording is uploaded to a `media` file field on an ARAG resource; ARAG transcribes
   it into paragraphs carrying `start_seconds`/`end_seconds`. A transcript can be uploaded directly
   as a text field instead.
2. **Augment.** Three data-augmentation agents run over the Knowledge Box: a resource-level labeler
   (call reason, outcome, sentiment, line of business, disposition flags), a paragraph-level labeler
   (the call *moments* — complaint, cross-sell pitch, resolution, escalation, compliance disclosure,
   PII), and an `ask` agent that writes `call_analysis` (executive summary, scorecard, complaint and
   cross-sell detail, notable quotes) and `call_metrics` (the flat fields the dashboard aggregates).
3. **Serve.** `services/` turns those resources into view models behind a 60-second cache, so a
   dashboard render costs one upstream fetch per call per window instead of one per call per view.
4. **Ask.** The chat calls `/ask` scoped with `resource_filters: [callId]` and `citations: true`, so
   the model can only answer from that call. Each citation key carries a character range that maps
   back to a transcript paragraph and therefore to a timestamp — which is why clicking `[1] source`
   scrubs the audio. When the stream ends the server scores the answer with `/predict/remi` against
   the full retrieved context and appends one extra `quality` item; the confidence badge is that
   genuine score, shown qualitatively. A refusal is never badged.

Every claim above is visible in the app: the **How this works** button in the Progress band opens
the real request path for the page you are on.

## Configuration is editable, not baked in

Every value this product reads from configuration — branding, Knowledge Box connection, limits,
retention — is editable in **Settings**, persists in `DATA_DIR/settings.json`, and takes effect on
the next request without a restart. Environment variables are *defaults*: once a section is edited
the store wins, and "Reset to environment default" restores what the deployment booted with.
Secrets are the exception, and are write-only — set once, then shown as "set · rotate", never
returned by any read model. Every change is recorded in the audit trail with who, what and when.

## White-labelling

A partner ships this under their own identity by configuration alone — no fork, no rebuild:

```bash
BRAND_PRODUCT_NAME="Northwind Call IQ" \
BRAND_TAGLINE="Conversation intelligence for insurers" \
BRAND_PRIMARY_COLOR="#7c3aed" \
BRAND_POWERED_BY=0 \
make dev
```

Name, tagline, logo, primary and accent colour, the Progress credit, the footer line and the
docs/support links all come from `BRAND_*` variables, are served from `GET /api/v1/branding`, and
are shown in the admin console under **Config**. See
[`docs/developer/white-label.md`](docs/developer/white-label.md); to change what the product *does*
rather than how it looks, see [`docs/developer/build-your-own.md`](docs/developer/build-your-own.md).

## Project layout

```
app/            Next.js App Router — demo pages, /admin pages, /api/v1 route handlers
components/     UI, restyled onto the shared ARAG UI-kit tokens
lib/            openapi.ts (the contract), api.ts (the route adapter), runtime.ts, parse.ts,
                confidence.ts, format.ts, mock.ts, domain/ (taxonomy + demo scenarios)
services/       calls, dashboard, ask, labelsets, agents, jobs, admin, cache, config (the
                settings store), apikeys, taxonomy-store, views, retention, shares
scripts/        thin CLIs over the public API: provision, ingest, reset, gen-media, smoke,
                smoke-write (opt-in live write check)
test/           unit, integration (in-process and over HTTP), contract, e2e
vendor/         the vendored arag-platform (never edited here)
docs/           developer, architecture, business, product-marketing
enablement/     developer and architect tracks
showcase/       recorded walkthrough
```

## Commands

```bash
make check        # biome + tsc + dependency audit + tests with the coverage gate
make test         # unit + integration + contract against the mock
make e2e          # Playwright: dashboard → calls → detail → ask → citation, and admin
make showcase     # record the walkthrough into showcase/out
make docs         # regenerate docs/developer/api-reference.md from lib/openapi.ts
make docker       # build the container image
make fly-validate # validate fly.toml
make smoke        # OPT-IN read-only check against a real Knowledge Box
make smoke-write  # OPT-IN live WRITE check (CALLS_ALLOW_LIVE_WRITE=1); removes everything it creates
```

`make help` lists them all.

## Deploying

The image installs and builds on `oven/bun:1` and runs Next.js' standalone output on
`node:22-slim` as a non-root user. `fly.toml` declares a `data` volume mounted at `/data` for
`DATA_DIR`, which holds the job history, the settings store, the API-key store, the taxonomy, saved
views, share links, the audit trail and any uploaded partner logo.

```bash
fly secrets set ARAG_KB_ID=… ARAG_API_KEY=… ARAG_REGION=aws-us-east-2-1 ADMIN_TOKEN=…
fly deploy
```

See [`docs/architecture/deployment-topologies.md`](docs/architecture/deployment-topologies.md).

## Documentation

[`docs/README.md`](docs/README.md) is the index: developer quickstart and examples, architecture and
ARAG integration, the security model, business walkthroughs, product marketing, enablement tracks
and the showcase script. Product decisions are in [`DECISIONS.md`](DECISIONS.md); the pre-MVP audit
of the prototype is in [`AUDIT.md`](AUDIT.md).

## Data

The demo corpus is **synthetic**: 24 scripted health-insurance calls in
[`lib/domain/scenarios.ts`](lib/domain/scenarios.ts). No real member, agent or call data is in this
repository.

## Licence

Apache-2.0 — see [`LICENSE`](LICENSE). Built on Progress Agentic RAG.
