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
| Public API | Open by default for reads; setting `API_KEYS` makes `X-API-Key` mandatory for writes, and the demo UI uses a signed same-origin session cookie instead of a key. |
| Abuse | Per-IP token-bucket rate limiting (`RATE_LIMIT_RPS`, `RATE_LIMIT_BURST`). The client IP comes only from a proxy header the deployment trusts (`TRUST_PROXY=fly|xff|none`), so a caller cannot rotate `X-Forwarded-For` to escape the limiter. |
| Input | Every `/api/v1` request is validated against the OpenAPI document. The media `field` parameter is an allowlist (`media`, `transcript`) — a caller cannot name an arbitrary field. Question length, upload size and recording MIME type are bounded. |
| Errors | RFC 9457 problem documents. Upstream URLs, tokens and raw ARAG bodies are never echoed; a `requestId` links the response to the server log. |
| Transport | `force_https` on Fly; security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) on every API response. |

## Known limitations (MVP)

- There is no per-user authentication or per-call authorisation: anyone who can reach the service
  and satisfy `API_KEYS` can read every call in the Knowledge Box. Deployments with real recordings
  must put an identity-aware proxy in front, or extend `lib/api.ts` with a real authorisation check.
- Rate limiting and the response cache are per process and in memory; a multi-machine deployment
  limits per machine.
- Job state and the log ring buffer live in `DATA_DIR` / memory, not in an audited store.
