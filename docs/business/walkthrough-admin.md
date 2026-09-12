# Admin walkthrough

The operations console at `/admin` is a live view of the running service and its Knowledge Box —
every panel reads real data through `/api/v1/admin/*`, refreshed on an interval; nothing here is
a static screenshot of a healthy system.

## Sign in

Visit `/admin`. If no `ADMIN_TOKEN` is configured for this deployment, every admin route answers
403 by design — admin access is opt-in, not fail-open. With a token configured, you're redirected
to **`/admin/login`**: enter the token (it is never stored in the browser's `localStorage` and
never read back by client JavaScript — it is exchanged immediately for an `HttpOnly` session
cookie). In mock mode (`make dev` with no live credentials), the token is `dev-admin-token` unless
you overrode it.

## Overview (`/admin`)

The landing tile grid: Health, Configuration, Usage, Agents, Jobs, Logs, Cache — each a one-line
description and a link. Above the grid, an "at a glance" panel shows version, platform version,
mode (mock vs. live), Knowledge Box id, model, resource count and uptime, refreshed every 15
seconds, with a status pill confirming the Knowledge Box is currently reachable.

## Health (`/admin/health`)

Click **"Re-test connection"** to force a fresh check. This is not a cached status: it performs a
real catalog read plus a configuration read against the Knowledge Box on every load, and reports
the generative model in use, resource count, and round-trip time. A raw-JSON panel at the bottom
shows the exact response for anyone who wants to see everything the health check returns.

## Config (`/admin/config`)

The effective environment this process actually booted with — cache TTL, max question length, max
upload size, rate-limit settings, and the taxonomy's labelset/agent counts, followed by the full
redacted environment as JSON. Every secret-shaped variable (anything matching
`token`/`key`/`secret`/`password`) shows only as `•••(N chars)` — enough to confirm it's set,
never enough to see it.

## Usage (`/admin/usage`)

Counters since this process started: total requests, errors, asks, uploads, deletes, ARAG call
count and average latency, token counts (input/output), cache hit rate, and a full breakdown of
request volume by route. Useful for spotting which endpoint is driving traffic or cost.

## Agents (`/admin/agents`)

The three data-augmentation agents that do all the actual analysis — `resource-labeler`,
`paragraph-labeler`, and `call-insights` (the `ask` agent that writes the analysis and metrics
JSON) — each shown with its current state (running / completed / failed / configured / absent),
description, operation count, and a truncated task id.

Click **"Re-provision labelsets + agents"** to run the full taxonomy setup: every labelset is
created or replaced, then the three agents are stopped and restarted one at a time (ARAG allows
only one running task per operation type, so this genuinely cannot happen all at once). The page
opens a live progress bar fed by that job's own Server-Sent Events stream — no polling — showing
the current stage ("Creating 6 labelsets," "Starting resource-labeler," "Waiting for
resource-labeler to finish," ...) until it completes, then refreshes the agent list. Provisioning
is idempotent: safe to click again at any time, live or in the demo.

## Jobs (`/admin/jobs`)

Every ingestion and provisioning run, most recent state at the top: kind, status, current stage,
and start time. Click a row to see its full stage timeline (each stage's timestamp, status and
duration) and, for a failed job, the error message — plus a raw-JSON view of the complete job
record for deeper inspection.

## Logs (`/admin/logs`)

The last 500 structured log lines the process has produced, filterable by minimum level
(debug/info/warn/error) and a free-text "contains" search, refreshed every 5 seconds. This is an
in-memory ring buffer, not a persisted log store — restarting the process clears it. Secrets are
redacted the same way they are everywhere else in this product.

## Cache (`/admin/cache`)

Statistics for the read cache that keeps the dashboard and rails off an expensive per-call fetch
on every page view: entry count, TTL, hit/miss counts and rate, evictions, invalidations, and a
breakdown by namespace (catalog ids, per-call summaries, dashboard, labelsets, search results). A
list of every currently cached key follows. Two buttons let an operator intervene directly:
**"Invalidate summaries"** (drops only per-call summary entries — useful right after editing a
call outside the normal upload flow) and **"Invalidate all"** (a full cache clear, the same thing
an upload/delete/provision already does automatically).

## What's not covered by an admin e2e test today

The demo's Playwright suite (`make e2e`) currently exercises the dashboard, calls list, call
detail, ask-and-cite flow and the browsable API docs; there is no automated Playwright coverage
of the admin console specifically as of this writing, so the walkthrough above is currently the
best verification path for the admin surface end to end.
