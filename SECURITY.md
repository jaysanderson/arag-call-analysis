# Security policy

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than opening a public issue.
Include the affected version, reproduction steps and impact. We aim to acknowledge within three
working days.

## What this service protects

| Asset | Control |
|---|---|
| ARAG service-account token | Server-side only. Never sent to a browser, never logged (the platform logger redacts `*token*`, `*key*`, `*secret*`, `authorization`, `cookie`), redacted in `GET /api/v1/admin/config`. Media is proxied through `/api/v1/calls/{id}/media` so the browser never holds a credential. |
| Admin surface | `/api/v1/admin/*` requires `ADMIN_TOKEN` as a bearer token or the `arag_admin` HttpOnly cookie issued by `POST /api/v1/admin/login` (constant-time compare). With no `ADMIN_TOKEN` set, admin routes answer 403. |
| Public API (reads) | Open by default so the demo runs with one command; setting `API_KEYS` makes `X-API-Key` mandatory, and the demo UI uses a signed same-origin session cookie instead of holding a key. |
| Writes (`POST /api/v1/calls`, `DELETE /api/v1/calls/{id}`) | Always require the admin token or an API key — never the freely issued demo session. A deployment with neither `ADMIN_TOKEN` nor `API_KEYS` configured may still write, because that can only be a local mock run; with `NODE_ENV=production` it is refused with an explanatory 403. |
| Abuse | Per-IP token-bucket rate limiting (`RATE_LIMIT_RPS`, `RATE_LIMIT_BURST`). The client IP comes only from a proxy header the deployment trusts (`TRUST_PROXY=fly|xff|none`), so a caller cannot rotate `X-Forwarded-For` to escape the limiter. |
| Input | Every `/api/v1` request is validated against the OpenAPI document. The media `field` parameter is an allowlist (`media`, `transcript`) — a caller cannot name an arbitrary field. Question length, upload size and recording MIME type are bounded. |
| Errors | RFC 9457 problem documents. Upstream URLs, tokens and raw ARAG bodies are never echoed; a `requestId` links the response to the server log. |
| Transport | `force_https` on Fly; `Strict-Transport-Security` on every API response in production. |
| Browser | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` on every API response (`lib/api.ts`) and on every HTML page, plus a Content-Security-Policy on pages (`next.config.mjs`). |
| Cross-origin | No CORS headers at all unless `ALLOWED_ORIGINS` lists the requesting origin; every `/api/v1` route answers preflight with the same allowlist. |
| Dependencies | `make audit` (and CI) fail on any advisory at or above `high` that is not listed in `.audit-allowlist.json` with a reason and a review date. |

## Known limitations (MVP)

- There is no per-user authentication or per-call authorisation: anyone who can reach the service
  and satisfy `API_KEYS` can read every call in the Knowledge Box, and any holder of an API key can
  delete any call. Deployments with real recordings must put an identity-aware proxy in front, or
  extend `lib/api.ts` with a real authorisation check.
- Reads are open when `API_KEYS` is unset. That is deliberate for a demo; set `API_KEYS` (or front
  the service with an authenticating proxy) before pointing it at a Knowledge Box holding real
  recordings.
- Rate limiting and the response cache are per process and in memory; a multi-machine deployment
  limits per machine.
- Job state and the log ring buffer live in `DATA_DIR` / memory, not in an audited store.
- `GET /api/v1/calls/{id}/media` is deliberately exempt from the rate limiter: a media player issues
  many `Range` requests while scrubbing, and a 5 rps bucket would break playback. It is still
  bounded by the allowlisted `field`, by the size of the upstream object, and by `API_KEYS` when
  that is configured. Put a CDN or a reverse-proxy limit in front of it for a public deployment.
