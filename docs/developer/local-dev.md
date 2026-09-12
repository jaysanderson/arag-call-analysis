# Local development

## Repo layout

```
app/                     Next.js App Router
  page.tsx                Dashboard (server component, calls services/dashboard.ts directly)
  calls/page.tsx           Category rails + filterable call list (client component over /api/v1)
  calls/[id]/page.tsx      Call detail (server component over services/calls.ts)
  admin/                   Admin panel pages (client components over /api/v1/admin/*)
  api/v1/                  Every public route handler (one route.ts per resource)
  healthz/, readyz/        Liveness / readiness (used by Fly and Playwright's webServer probe)
lib/
  openapi.ts               The OpenAPI 3.1 document — the API's single source of truth
  api.ts                   Next.js route-handler adapter (auth, rate limit, validation, problem+json)
  runtime.ts                Process-wide Runtime (env, logger, AragClient, Store, JobManager, cache)
  mock.ts                   In-process mock ARAG bootstrap for ARAG_MOCK=1
  parse.ts                  Raw ARAG resource -> CallSummary/CallDetail view models
  confidence.ts              Citation-coverage and REMi-derived confidence badges
  types.ts, format.ts, version.ts
  domain/taxonomy.ts         Labelsets + the three data-augmentation agent definitions
  domain/scenarios.ts        The 24 synthetic demo call scripts
services/                  Domain logic — the one place both the API and server components call
  calls.ts, ask.ts, dashboard.ts, jobs.ts, admin.ts, agents.ts, labelsets.ts, cache.ts
components/               React components (client, except where noted above)
scripts/                  Thin CLIs over the public API (provision, ingest, reset, gen-media, smoke)
vendor/arag-platform/     Vendored platform (App, AragClient, JobManager, Store, Logger, ...) — never edited in place
test/                     unit/, integration/, contract/, e2e/
docs/                     This documentation tree
data/                     DATA_DIR default — job records (gitignored)
```

## bun, never npm

This repo installs and runs everything with [bun](https://bun.sh); `npm` is never invoked (see
`TEAM-BRIEF.md` hard rule 1 and `AUDIT.md`'s finding that the prototype violated it).
Dependencies are pinned to exact versions in `package.json` with a committed `bun.lock`. If a
transitive dependency is blocked by a corporate registry policy, pin an older version with
`overrides` (two are already there: `nanoid`, `baseline-browser-mapping`).

`node` is used directly (not through bun) only for the standalone CLI scripts under `scripts/`,
because they run with `node --experimental-strip-types` against plain TypeScript with no bundler
step (`package.json`'s `provision`/`ingest`/`reset`/`gen-media` scripts). Local Node must be
26.7+; erasable-syntax TypeScript only (no enums, parameter properties, namespaces) so `node
file.ts` runs it unmodified. `engines.node >= 22.18` in `package.json`; the Dockerfile builds on
`oven/bun:1` and runs the standalone output on `node:22-slim`.

## `make` targets

Run `make help` for the live list. The full set, from the `Makefile`:

| Target | What it does |
|---|---|
| `make install` | `bun install --frozen-lockfile` |
| `make dev` | Next.js dev server on `:3000` — mock ARAG unless `.env` has `ARAG_API_KEY` |
| `make build` | Production build (`next build`, standalone output) |
| `make start` | Run the production build (`NODE_ENV=production next start`) |
| `make test` | Unit + integration + contract tests (`vitest run`) against the mock ARAG |
| `make coverage` | Same tests with the 80% line/statement coverage gate on `lib/` + `services/` |
| `make e2e` | Playwright: dashboard -> calls -> detail -> ask -> citation, and admin |
| `make lint` | `biome check .` |
| `make format` | `biome format --write .` |
| `make typecheck` | `tsc --noEmit -p tsconfig.json` |
| `make check` | lint + typecheck + coverage |
| `make docs` | Regenerate `docs/developer/api-reference.md` from `lib/openapi.ts` |
| `make showcase` | Record the showcase walkthrough into `showcase/out` |
| `make smoke` | Opt-in, read-only live check against the real Knowledge Box |
| `make docker` | `docker build` the container image |
| `make fly-validate` | `fly config validate -c fly.toml` |
| `make provision` | Create labelsets + (re)start agents on a running server |
| `make gen-media` | Render demo call media (optional, macOS `say` + `ffmpeg`) + manifest |
| `make ingest` | Ingest `scripts/output/manifest.json` into a running server |
| `make reset` | **Destructive** — delete every call from the KB the server points at (`--yes-i-know`) |
| `make clean` | Remove `.next`, `data`, `test-results`, `showcase/out`, `coverage` |

## Mock mode vs live

Set by `ARAG_MOCK` (`.env` / environment). `make dev` picks it automatically: mock unless
`ARAG_API_KEY` is present in `.env`. In mock mode, `lib/mock.ts` starts an in-process ARAG server
(the platform's `startMockArag()`), seeds it with `CALLS_MOCK_SEED` demo calls, and runs the
product's own labeler/`ask` agents against it — see
[Extension points](extension-points.md#how-the-mock-is-seeded) for the seeding sequence. Every
route, service and UI path is identical between mock and live; only `lib/runtime.ts`'s
`buildRuntime()` differs in where `kbId`/`apiKey`/`baseUrl` come from.

## Environment variables

Every variable is documented with a comment in [`.env.example`](../../.env.example) — copy it to
`.env` rather than duplicating the list here. Notable ones for local dev:

- `ARAG_MOCK=1` — skip credentials entirely (see above).
- `ADMIN_TOKEN` — required to reach `/admin` and `/api/v1/admin/*`; `make dev` defaults it to
  `dev-admin-token` in mock mode if unset.
- `CALLS_MOCK_SEED`, `CALLS_MOCK_STREAM_DELAY_MS` — mock-only: corpus size and per-chunk answer
  stream pacing (the latter is used by the showcase recording to make streaming visible on video).
- `DATA_DIR` — where job records are written (default `./data`); the e2e config points this at
  `./data/e2e` so test runs don't collide with a dev server's job history.

## Running tests

```bash
make test        # vitest run — unit + integration + contract, against the mock ARAG
make coverage     # same, with the 80% line/statement / 70% function/branch gate (lib/, services/)
make e2e          # Playwright — requires a production build first (make e2e runs `build` for you)
```

Test layout (`vitest.config.ts` includes `test/unit/**`, `test/integration/**`,
`test/contract/**`; Playwright owns `test/e2e/**` separately):

- **Unit** (`test/unit/`) — pure logic: `lib/parse.ts`, `lib/confidence.ts`, `lib/format.ts`,
  `services/cache.ts`, `services/dashboard.ts`, the `lib/api.ts` adapter, `services/ask.ts`'s REMi
  reduction.
- **Integration** (`test/integration/`) — routes exercised in-process and over real HTTP against
  the mock ARAG (`test/helpers/server.ts` boots the app on an ephemeral port).
- **Contract** (`test/contract/openapi.test.ts`) — `lintSpec()` on the OpenAPI document,
  `API_ROUTES` cross-checked against both the spec and a filesystem walk of `app/api/v1`, and
  `checkResponse()` assertions that success responses actually validate against their schema.
- **E2E** (`test/e2e/demo.spec.ts`) — Playwright against a production build (`next start`) with
  `ARAG_MOCK=1`, covering the dashboard, filtering by label, full-text search, transcript moment
  chips, the ask-and-cite "wow moment," and the browsable API docs.

Playwright needs `PW_DISABLE_TS_ESM=1` set (see the `e2e`/`showcase` Makefile targets — Next's
TypeScript ESM loader and Playwright's own test-file loader otherwise conflict) and, locally,
Chrome rather than the bundled Chromium: `playwright.config.ts` sets `channel:
process.env.PW_CHANNEL ?? (process.env.CI ? undefined : "chrome")`, so a local run uses your
installed Chrome and CI uses Chromium. Install Chrome once with `bunx playwright install chrome`
if it isn't already on the machine, or set `PW_CHANNEL=chromium` to use Playwright's own browser
instead.

## Optional macOS media generation

`scripts/gen-media.ts` renders the 24 scenarios in `lib/domain/scenarios.ts` into real MP3/MP4
files using macOS `say` (text-to-speech) piped through `ffmpeg`, then writes
`scripts/output/manifest.json` for `scripts/ingest.ts`. This only works on a Mac with `ffmpeg`
installed (`brew install ffmpeg`); everywhere else — and with `--transcripts-only` — it detects the
missing tools and writes the same manifest with plain-text `transcript` bodies instead of
`filePath`s, which `scripts/ingest.ts` ingests as text calls. The product never depends on
rendered media: the mock ARAG server synthesizes its own timestamped transcripts regardless
(D-CA-07).

## Troubleshooting

- **`make dev` says "Missing required ARAG configuration"** — you set `ARAG_API_KEY` (or
  `ARAG_KB_ID`) without the other, and mock mode wasn't triggered. Either fill in both or unset
  both and let it fall back to `ARAG_MOCK=1`.
- **`tsc --noEmit` fails on `scripts/*`** — make sure `tsconfig.json` includes `"types": ["node"]`;
  the CLI scripts use `node:fs`/`node:child_process` which need the Node type declarations (this
  was AUDIT.md finding #7 against the pre-MVP prototype).
- **Playwright can't find Chrome** — run `bunx playwright install chrome`, or set
  `PW_CHANNEL=chromium` to use Playwright's bundled browser instead.
- **`/admin` returns 403** — `ADMIN_TOKEN` is unset for this process; admin routes are disabled by
  design with no token configured (see [Security model](../architecture/security-model.md)).
- **A live `make dev`/`make ingest` run has stale filters or an empty rail after an upload** — the
  read cache is TTL'd at `CALLS_CACHE_TTL_MS` (default 60 s); uploads/deletes/provisioning
  invalidate it immediately, but a page rendered from a request that started just before an
  upload can still show the old catalog. Use `/admin/cache` to invalidate manually if needed.
- **`node scripts/reset.ts` refuses to run** — it requires `--yes-i-know` and, against anything
  that isn't the mock (`admin/health` reporting `mock:false`), also `CALLS_ALLOW_DESTRUCTIVE=1`.
  This is deliberate: the demo Knowledge Box holds the seeded calls the showcase depends on.
