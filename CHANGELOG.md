# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses semantic versioning.

## [Unreleased]

### Added

- **White-labelling.** `BRAND_PRODUCT_NAME`, `BRAND_TAGLINE`, `BRAND_LOGO_URL`,
  `BRAND_PRIMARY_COLOR`, `BRAND_ACCENT_COLOR`, `BRAND_POWERED_BY`, `BRAND_FOOTER_TEXT`,
  `BRAND_DOCS_URL` and `BRAND_SUPPORT_URL` rebrand a deployment without a fork: wordmark or logo,
  page titles, favicon, colours, the Progress credit, the footer line and the docs/support links.
- `GET /api/v1/branding` (public, in the OpenAPI document) and a branding panel in the admin
  Config page.
- `/branding/*` serves partner logos from `DATA_DIR/branding/` — image types only, path-traversal
  safe, `nosniff` and a restrictive CSP on the response.
- `docs/developer/white-label.md` and `docs/developer/build-your-own.md`.
- **New application shell and information architecture.** A persistent left sidebar (Dashboard,
  Calls, Upload, Agents & Taxonomy, Settings, and an Operations group holding Admin) replaces the
  previous per-page chrome, collapsible to a 64px rail and dropping into a drawer under 1024px.
- **`/welcome`** — first-run onboarding: four steps computed live from the system, plus "Try with
  sample calls" (a real seeding job) and "Upload my own." An empty dashboard now redirects here
  instead of rendering empty.
- **Calls table.** `/calls` gained a Table mode alongside the existing Browse rails: search,
  facet dropdowns with live counts, sortable columns, a lifecycle status chip per call, row
  selection with a bulk bar (export, re-run analysis, delete), and pagination. Every filter lives
  in the URL.
- **Call lifecycle.** Every call now carries a derived lifecycle state — queued, transcribing,
  labelling, partly analysed, analysed, failed — shown as a chip everywhere a call is listed
  (`lib/lifecycle.ts`).
- **Call workspace.** `/calls/[id]` gained a moments track under the media scrub bar, a
  three-tab inspector (Analysis, Ask, Details), and header actions for Share, Export and a kebab
  (re-run analysis, export transcript/captions, copy call id, copy API URL, delete).
- **Share links.** `GET|POST /api/v1/calls/{id}/shares` and `GET|DELETE /api/v1/shares/{token}`
  issue and revoke expiring, read-only links, served at `/s/[token]`.
- **`/upload`** — a dropzone/paste-transcript flow with a metadata form and a live progress
  stepper driven by the ingest job's own SSE stage stream. **`/upload/history`** lists every
  ingest, sample load, re-analysis and provisioning run.
- **`/taxonomy`** (Agents & Taxonomy) — labelsets with their level, label count, calls carrying
  each label and Knowledge Box provisioning state, the three agents with their live task state,
  and a re-provision action.
- **`/settings`** — Connection, Branding (a live white-label preview plus the exact `BRAND_*`
  block to copy), Usage, API keys and About.
- New endpoints: `GET /api/v1/calls/export`, `POST /api/v1/calls/bulk`,
  `POST /api/v1/calls/{id}/reanalyze`, `GET /api/v1/calls/{id}/export`,
  `GET|POST /api/v1/calls/{id}/shares`, `GET|DELETE /api/v1/shares/{token}`,
  `GET /api/v1/settings`, `GET /api/v1/taxonomy`, `GET /api/v1/onboarding` and
  `POST /api/v1/samples`. `GET /api/v1/calls` gained `sort`, `order`, `agent`, `queue`,
  `media_type`, `from`, `to`, `min_duration`, `max_duration`, `complaint`, `fcr`, `escalated` and
  `lifecycle`, and its response gained `facets`, `agents` and `queues`. `GET /api/v1/dashboard`
  gained `byAgent` and `byQueue` roll-ups.
- The official Progress Agentic RAG wordmark (`public/brand/arag-logo.svg`,
  `arag-logo-alt.svg`) is now the default identity in the band and the sidebar, replacing the
  previous placeholder mark.

### Changed

- Vendored `arag-platform` 0.1.4: mock fixtures are re-exported from the platform index (the local
  deep import is gone), secret lengths in the admin config view are bucketed rather than exact, the
  mock labeler assigns fewer labels per paragraph (so demo transcripts read plausibly), and the UI
  kit ships a `[hidden]` rule.
- Per-route rate limits: the media route gets 20x the configured bucket, the ask route 0.25x, each
  in its own bucket (DECISIONS D-CA-15).
- Deliberate 5xx responses log at `warn` without a stack; only unexpected throws log at `error`.
- Tests, Playwright and the build run with `ENV_FILE=/dev/null` and blanked ARAG variables on a
  product-specific port, so a developer `.env` can never leak into a mock-backed run — Next.js
  loads `.env` itself, so the platform's `ENV_FILE` alone is not sufficient (DECISIONS D-CA-16).
- `make test`/`make coverage` build first, and the integration harness rebuilds when sources are
  newer than the last build (DECISIONS D-CA-17).
- The admin config view reports the Knowledge Box the client is actually using rather than the raw
  environment variable, which is empty in mock mode.
- **Admin restructured into eight sections**: Overview, Connection, Taxonomy & Agents, Jobs, Logs,
  Usage, Branding, Security. `/admin/health` and `/admin/config` redirect to `/admin/connection`
  (`/admin/config` opens directly on its Configuration view), `/admin/agents` to `/admin/taxonomy`,
  and `/admin/cache` to `/admin/usage`. Overview gained a stat strip plus recent-jobs and
  recent-errors panels. Security is new: the auth posture, rate limits and cross-origin policy,
  with nothing secret on the page.
- `CallSummary` and `CallDetail` gained `lifecycle`.

### Removed

- `components/AppChrome.tsx`, replaced by `components/shell/AppShell.tsx`.

## [0.1.0] — 2026-09-12

First API-first MVP. The prototype became a product: a versioned public API, an admin panel, a
caching service layer and a full test suite, all on the shared ARAG platform.

### Added

- **Versioned API** `/api/v1` described by `lib/openapi.ts` (OpenAPI 3.1), served at
  `/api/v1/openapi.json` with Redoc (`/api/v1/docs`) and Swagger UI (`/api/v1/swagger`):
  calls list/detail/media/ask/upload/delete, dashboard, labelsets, jobs (+ SSE events), session,
  and admin health/config/usage/logs/agents/provision/cache.
- **Admin panel** at `/admin`: sign-in, Knowledge Box connection test, redacted configuration,
  usage counters, agent status with one-click re-provisioning, job timeline, log inspector and
  cache control.
- **Caching service** (`services/cache.ts`): catalog ids and per-call summaries with a 60 s TTL and
  single-flight loading, invalidated on upload, delete and provisioning. Removes the N+1 ARAG fetch
  the dashboard, rails and list previously paid on every view.
- **Mock ARAG demo mode** (`ARAG_MOCK=1`): seeds call transcripts and runs the taxonomy's labeler
  and ask agents at boot, so the whole product works with no credentials.
- **Tests**: unit (`lib/`, `services/`), in-process and over-HTTP integration, OpenAPI contract
  tests, and Playwright e2e for the demo and admin journeys, plus a showcase recording.
- Apache-2.0 `LICENSE`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, issue/PR templates and a CI
  workflow.

### Changed

- Package manager is **bun** with exact pins; `package-lock.json` and every npm reference removed.
  The Dockerfile installs and builds on `oven/bun:1` and runs the standalone output on
  `node:22-slim` as a non-root user.
- ARAG access goes through the vendored platform `AragClient`; `lib/arag.ts` and
  `scripts/lib/arag-admin.ts` are gone.
- Server components call the same `services/*` layer as the API instead of their own ARAG code.
- The UI is restyled onto the shared UI-kit tokens (`vendor/arag-platform/ui/arag-ui.css`).
- Seeding scripts are thin CLIs over the public API (`provision`, `ingest`, `reset`, `gen-media`);
  macOS `say` rendering is optional and degrades to transcript-only ingestion.
- `ARAG_BASE` was renamed `ARAG_BASE_URL` (the old name is still read as a fallback).

### Security

- Admin authentication, optional API keys, per-IP rate limiting, OpenAPI request validation, an
  allowlist on the media `field` parameter, bounded question length and upload size, RFC 9457
  errors that never leak upstream URLs or tokens, and security headers on every API response.
- Uploads and deletions require the admin token or an API key in every configured deployment and
  are refused outright in production when neither is set (`auth: "write"`, DECISIONS D-CA-13).
- The markdown renderer allowlists link schemes, so model-generated text cannot produce a
  `javascript:` or `data:` link.
- CORS is implemented against `ALLOWED_ORIGINS` (previously read but never used) with preflight on
  every `/api/v1` route; HSTS in production; a Content-Security-Policy on HTML pages.
- Multipart uploads are validated against the OpenAPI schema rather than only by hand, and a
  malformed multipart body returns 400 instead of 500.
- The media route has its own generous rate-limit bucket rather than being exempt from the limiter.
- `make audit` / CI fail on un-waived high or critical advisories (`.audit-allowlist.json`).
