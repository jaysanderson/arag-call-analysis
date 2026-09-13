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

- **http://localhost:3000** — the dashboard (a stat strip, charts and a sortable agent/queue
  breakdown, all aggregated from generated call metrics).
- **http://localhost:3000/calls** — a searchable, filterable, sortable table by default (facet
  dropdowns, bulk export/re-analyse/delete), with the previous category-rail browse kept as a
  second mode.
- **http://localhost:3000/calls/{id}** — pick any call: media player with a moments track, synced
  transcript, and an inspector with Analysis, Ask and Details tabs.
- **http://localhost:3000/upload** — drop a recording or paste a transcript and watch the ingest
  job's own progress stream.
- **http://localhost:3000/taxonomy** — the labelsets and the three data-augmentation agents, with
  their live provisioning state, and editable: create, edit, delete and provision a labelset;
  enable, disable, re-instruct, start and stop an agent.
- **http://localhost:3000/api** — the in-product API explorer: every operation in the served
  OpenAPI document, grouped by tag, with its parameters, schemas, a try-it form against this
  deployment and a copyable curl.
- **http://localhost:3000/settings** — connection, branding, limits, retention, API keys, share
  links, saved views, usage and about. Every value here is editable and persists (see
  [Configuration is editable](#configuration-is-editable), below).
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

## Configuration is editable

Environment variables are **defaults**; the settings store is the **authority**. Every value this
product reads from configuration — branding, Knowledge Box connection, limits, retention — is
editable at `PUT /api/v1/settings/{section}` and in **Settings**, is persisted to
`DATA_DIR/settings.json`, and is in force for the very next request with no restart. Once a
section has been edited the store wins over the environment; `DELETE /api/v1/settings/{section}`
("Reset to environment default" in the UI) restores the values the deployment booted with.

The four sections are `branding`, `connection`, `limits` and `retention`. The body is a *patch*:
only the keys present are changed, and an unrecognised key is rejected rather than silently
ignored. Both writes require the admin token (`auth: "admin"`); the read, `GET /api/v1/settings`,
is public and carries no secrets.

```bash
# What this deployment is running with
curl -s "$BASE/api/v1/settings" | jq '{limits, retention, overridden}'

# Edit one field of one section — the response is the full settings view after the edit
curl -s -X PUT "$BASE/api/v1/settings/limits" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxQuestionChars":800}' | jq '.limits'

# The next request already sees it; no restart, no redeploy
curl -s "$BASE/api/v1/settings" | jq '.limits.maxQuestionChars, .overridden'

# Put the whole section back to what the environment supplied
curl -s -X DELETE "$BASE/api/v1/settings/limits" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.limits.maxQuestionChars'
```

Secrets are the exception and are **write-only**. `connection.apiKey` (the ARAG service-account
token) is accepted by the write and never returned by any read model — the UI shows "set ·
rotate", and an empty string means "leave it alone", not "clear it". The audit trail
(`GET /api/v1/admin/audit`) records the change with the value reduced to `true`.

The full mechanism, including why "no restart" is true, is in
[White-labelling](white-label.md#the-settings-model), [Extension
points](extension-points.md#the-settings-model-environment-defaults-store-authority) and
[Architecture](../architecture/architecture.md).

## API keys

`API_KEYS` is a one-time **seed**, not the mechanism. On first boot each comma-separated value is
imported into the key store as a managed key named "Environment key N"; from then on keys are
issued, named and revoked in the product. Keys are stored as SHA-256 digests and the material is
returned exactly once, on creation.

```bash
curl -s -X POST "$BASE/api/v1/api-keys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Reporting pipeline"}' | jq
```

```json
{
  "key": {
    "id": "3f0b…",
    "name": "Reporting pipeline",
    "preview": "ca_live_Qx7mB2Zt…",
    "createdISO": "2026-09-13T09:14:22.031Z",
    "revoked": false,
    "fromEnv": false
  },
  "secret": "ca_live_Qx7mB2Zt9f…"
}
```

Copy `secret` now — it cannot be recovered. A caller presents it as either header:

```bash
curl -s -H "X-API-Key: $KEY" "$BASE/api/v1/calls?page_size=1"
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/calls?page_size=1"
```

`GET/POST /api/v1/api-keys` and `PUT/DELETE /api/v1/api-keys/{id}` are operator-only. Revoking
(`DELETE`) marks the row revoked rather than deleting it, so the record of what a key could reach
and when it was last used survives.

## Interactive API docs

- **`/api`** — the in-product API explorer. It fetches `/api/v1/openapi.json` from the running
  deployment and renders every operation grouped by tag, with parameters, schemas, a try-it form
  that calls the live endpoint with your session or a pasted key, the response, and a copyable
  curl. Because it is generated from the served document, an operation added to the spec appears
  here with no further code change. Destructive operations take a second click.
- `GET /api/v1/openapi.json` — the OpenAPI 3.1 document (the single source of truth; authored in
  `lib/openapi.ts`).
- `GET /api/v1/docs` — Redoc, read-only reference.
- `GET /api/v1/swagger` — Swagger UI with try-it-out.

The three documents are public and unauthenticated even when `API_KEYS`/`ADMIN_TOKEN` are set.

## Next

- [Examples](examples.md) — curl and TypeScript for every endpoint.
- [Extension points](extension-points.md) — add a route, change the taxonomy, swap the cache.
- [Local development](local-dev.md) — repo layout, `make` targets, running the test suite.
- [Architecture](../architecture/architecture.md) — how the pieces fit together.
