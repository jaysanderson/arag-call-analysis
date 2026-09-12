# Quickstart

Two paths: a fully working demo with **no credentials** in under five minutes, or the same app
against your own Progress Agentic RAG (ARAG) Knowledge Box.

## 1. Zero credentials — mock ARAG

Requires [bun](https://bun.sh) (this repo never uses npm) and Node 22.18+.

```bash
git clone <this-repo>
cd call-analysis
make install     # bun install --frozen-lockfile
make dev         # starts Next.js on :3000
```

`make dev` checks `.env` for `ARAG_API_KEY`. If it isn't set, it starts the app with
`ARAG_MOCK=1` against an **in-process mock ARAG server** — no network calls, no external
Knowledge Box. On first request the mock is seeded with real call transcripts
(`CALLS_MOCK_SEED`, default 12, plus one platform sample call) and the product's own labeler and
`ask` data-augmentation agents are run against them synchronously, so the dashboard, category
rails, filters, transcript moment labels and the chat all render real, non-empty data.

Open:

- **http://localhost:3000** — the dashboard (KPIs and charts aggregated from generated call
  metrics).
- **http://localhost:3000/calls** — category rails, search and label filters.
- **http://localhost:3000/calls/{id}** — pick any call: media player, synced transcript, AI
  analysis panel, and "Ask this call" chat.
- **http://localhost:3000/admin** — sign in with the dev admin token. `make dev` sets
  `ADMIN_TOKEN=dev-admin-token` automatically when it falls back to mock mode (override with
  `ADMIN_TOKEN=... make dev`).

Total time from `git clone` to a browsable dashboard: under five minutes on a typical machine —
`bun install` is the only step that touches the network.

## 2. With live ARAG credentials

Copy the example env file and fill in your Knowledge Box:

```bash
cp .env.example .env
```

Set at minimum:

```
ARAG_KB_ID=<your-knowledge-box-id>
ARAG_API_KEY=<your-service-account-key>
ARAG_REGION=aws-us-east-2-1        # or set ARAG_BASE_URL directly
ADMIN_TOKEN=$(openssl rand -hex 24)
```

Leave `ARAG_MOCK` unset (or `0`). Then:

```bash
make dev
```

Because `ARAG_API_KEY` is now present, `make dev` runs the real Next.js dev server against your
live Knowledge Box instead of the mock. A freshly created Knowledge Box has no calls yet, so
provision the taxonomy and load some calls:

```bash
ADMIN_TOKEN=<your token> node scripts/provision.ts      # labelsets + the 3 data-augmentation agents
node scripts/gen-media.ts                                # optional: render demo audio/video (macOS)
node scripts/ingest.ts                                    # ingest scripts/output/manifest.json
```

`scripts/gen-media.ts` needs macOS `say` and `ffmpeg`; without them (or with
`--transcripts-only`) it still writes a manifest of plain-text transcripts, which
`scripts/ingest.ts` ingests as text calls — the pipeline works everywhere, media rendering is a
nicety. See [Local development](local-dev.md) for the full script list.

## First API call

Every route is under `/api/v1`. With the app running (mock or live):

```bash
curl -s http://localhost:3000/api/v1/dashboard | jq
curl -s http://localhost:3000/api/v1/calls?page_size=5 | jq '.items[] | {id, title, mediaType}'
```

Public GET routes need no credentials. Writes (`POST /api/v1/calls`, `DELETE /api/v1/calls/{id}`)
always need the admin token or an API key — the demo session cookie is deliberately not enough —
unless the deployment has neither `ADMIN_TOKEN` nor `API_KEYS` configured, which can only be a
local mock run:

```bash
curl -s -X POST "$BASE/api/v1/calls" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F title="Uploaded from curl" -F transcript="Agent: Hello. Member: Hello."
```

The demo UI itself never needs a key: it exchanges a session cookie via `POST /api/v1/session`,
which is enough for reads. See
[Examples](examples.md) for a full walkthrough of every endpoint.

## Interactive API docs

- `GET /api/v1/openapi.json` — the OpenAPI 3.1 document (the single source of truth; authored in
  `lib/openapi.ts`).
- `GET /api/v1/docs` — Redoc, read-only reference.
- `GET /api/v1/swagger` — Swagger UI with try-it-out.

All three are public and unauthenticated even when `API_KEYS`/`ADMIN_TOKEN` are set.

## Next

- [Examples](examples.md) — curl and TypeScript for every endpoint.
- [Extension points](extension-points.md) — add a route, change the taxonomy, swap the cache.
- [Local development](local-dev.md) — repo layout, `make` targets, running the test suite.
- [Architecture](../architecture/architecture.md) — how the pieces fit together.
