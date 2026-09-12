# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses semantic versioning.

## [Unreleased]

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
