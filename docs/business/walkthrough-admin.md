# Admin walkthrough

Admin is an operator product living in the same application shell as the rest of Call Analysis —
same sidebar, same page scaffold, same components — reached from **Operations → Admin** or
`/admin`. What differs is the navigation and the fact that every panel here is a live read of the
running service and its Knowledge Box, refreshed on an interval; nothing here is a static
screenshot of a healthy system.

## Sign in

Visit `/admin`. If no `ADMIN_TOKEN` is configured for this deployment, every admin route answers
403 by design — admin access is opt-in, not fail-open. With a token configured, you're redirected
to **`/admin/login`**: enter the token (it is never stored in the browser's `localStorage` and
never read back by client JavaScript — it is exchanged immediately for an `HttpOnly` session
cookie). In mock mode (`make dev` with no live credentials), the token is `dev-admin-token` unless
you overrode it.

The operator console has eight sections, each a tab across the top: **Overview**, **Connection**,
**Taxonomy & Agents**, **Jobs**, **Logs**, **Usage**, **Branding**, **Security**.

## Overview (`/admin`)

The three questions an operator opens this panel to answer — is it up, what is it doing, and what
has gone wrong lately — on one screen. A stat strip shows mode (sample/live) with the round-trip
time, resource count in the Knowledge Box, jobs running/queued/failed, and cache entries with hit
and miss counts; each tile links to the section with the detail. Below it, an "at a glance" panel
repeats the Knowledge Box id, endpoint and generative model, and two panels list the most recent
jobs and the most recent error-level log lines, each linking to its full section. A status pill
next to the page title confirms whether the Knowledge Box is currently reachable.

## Connection (`/admin/connection`)

A segmented control switches between two views:

- **Connection test** — not a cached status: every load performs a real catalog read plus a
  configuration read against the Knowledge Box, reporting the generative model in use, resource
  count and round-trip time. Click **"Re-test connection"** to force a fresh check. A raw-JSON
  panel at the bottom shows the exact response.
- **Configuration** — the effective environment this process actually booted with: cache TTL, max
  question length, max upload size, rate-limit settings, and the taxonomy's labelset/agent counts,
  followed by the full redacted environment as JSON. Every secret-shaped variable (anything
  matching `token`/`key`/`secret`/`password`) shows only as `•••(N chars)` — enough to confirm
  it's set, never enough to see it.

`/admin/health` and `/admin/config` still work — they redirect here (`/admin/config` opens
directly on the Configuration view) so existing links and bookmarks don't break.

## Taxonomy & Agents (`/admin/taxonomy`)

The same screen the product shows at `/taxonomy`, with provisioning enabled — an operator and a
reviewer must never be looking at two different accounts of what's actually live. A **Labelsets**
tab lists every labelset with its level, label count, how many calls carry each label, and whether
it's actually in the Knowledge Box; an **Agents** tab shows `resource-labeler`, `paragraph-labeler`
and `call-insights` with their current state (running / completed / failed / configured / absent),
description, operation count and task id.

Click **"Re-provision"** to run the full taxonomy setup: every labelset is created or replaced,
then the three agents are stopped and restarted one at a time (a Knowledge Box allows only one
running task per operation type, so this genuinely cannot happen all at once). Progress follows the
job's own Server-Sent Events stream until it completes, then the list refreshes. Provisioning is
idempotent — safe to click again at any time. `/admin/agents` redirects here.

## Jobs (`/admin/jobs`)

Every ingestion and provisioning run, most recent first: kind, status, current stage, and start
time. Click a row to see its full stage timeline (each stage's timestamp, status and duration)
and, for a failed job, the error message, plus a raw-JSON view of the complete job record. This is
the same job history the product's own **Ingest history** page (`/upload/history`) shows a
reviewer.

## Logs (`/admin/logs`)

The last structured log records the process has produced, filterable by minimum level
(debug/info/warn/error) and a free-text "contains" search, refreshed every 5 seconds. This is an
in-memory ring buffer, not a persisted log store — restarting the process clears it. Secrets are
redacted the same way they are everywhere else in this product.

## Usage (`/admin/usage`)

A segmented control switches between two views:

- **Counters** — since this process started: total requests and errors, questions asked with their
  input/output token counts, Knowledge Box call count and average latency, uploads, deletes, cache
  hit rate, and a full breakdown of request volume by route.
- **Cache** — entry count, TTL, hit/miss counts and rate, evictions and invalidations, a
  breakdown by namespace, and the list of currently cached keys. Buttons invalidate a single
  namespace (catalog, summary, detail, find) or everything at once — the same clear an
  upload/delete/provision already triggers automatically.

`/admin/cache` redirects here, opening on the Cache view.

The product's own **Settings → Usage** tab shows the counters view to a signed-in operator too; a
non-operator sees an explanation instead of the numbers, since they describe the whole deployment
rather than any one reviewer's work.

## Branding (`/admin/branding`)

The white-label identity this process actually booted with — product name, tagline, logo,
primary/accent colour swatches, whether the Progress credit is shown, the footer line, and the
docs/support links — read from the `BRAND_*` environment variables, so an operator can confirm what
a partner's customers will actually see. The live, editable preview (and the exact `BRAND_*` block
to copy for a change) lives on the product's **Settings → Branding** tab; this page links to it.

## Security (`/admin/security`)

New in this restructure. The auth posture in one place: whether the operator token is configured
(and therefore whether the operator panel is reachable at all), how many API keys are configured,
the environment name, and the trusted-proxy header — plus the per-client rate limit and the
media/ask routes' own separate buckets, and the allowed cross-origin list. Nothing secret appears
on the page: key material is redacted server-side before it ever reaches the browser, the same way
it is on Connection's Configuration view.

## How this walkthrough is verified

`make e2e` runs the admin Playwright suite (`test/e2e/admin.spec.ts`) in addition to the demo
suite: the API refuses `/api/v1/admin/health` without a token, a signed-out visit shows an error
rather than data, a wrong token is rejected, a correct one signs in and runs a live Knowledge Box
connection test, the configuration view is asserted to contain neither the admin token nor the
service-account key, the usage counters and log inspector return real records, all three agents are
listed, the cache view reports statistics and invalidates, the job history is inspectable, and the
legacy `/admin/health`, `/admin/config`, `/admin/agents` and `/admin/cache` routes redirect to their
new homes.

Not yet automated: a full provisioning run driven through the UI (the job itself is covered by the
integration suite, which runs it end to end against the mock Knowledge Box).
