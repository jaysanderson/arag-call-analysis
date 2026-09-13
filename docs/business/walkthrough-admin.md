# Admin walkthrough

This is the operator's path through Call Analysis: every task someone has to be able to do to run
this product for a partner, in the order they usually come up, and where each one lives.

Two things shape it. First, operating this product is done **in the product** — there is no
configuration file to edit on a server, no redeploy to change a colour or a limit, and no
engineer needed to issue a partner an API key. Environment variables set what a deployment
*starts* with; after that the product is the authority, every change takes effect on the next
request, and every change is recorded. Second, the operator's surfaces live in the same
application shell as everyone else's: **Settings** carries the editable configuration and
**Operations → Admin** carries the live operational reads. Nothing is a separate console with its
own look.

## 1. Sign in

Visit `/admin`. If no `ADMIN_TOKEN` is configured for this deployment, every admin route answers
403 by design — operator access is opt-in, not fail-open, and the product says so rather than
showing an empty panel. With a token configured you are redirected to **`/admin/login`**: enter
the token. It is exchanged immediately for an `HttpOnly` cookie, is never written to the browser's
`localStorage`, and is never read back by client JavaScript. In sample mode (`make dev` with no
live credentials) the token is `dev-admin-token` unless you overrode it.

Signing in is what turns Settings from a read-only account of the deployment into an editor. A
visitor who is not signed in sees the same screens with the values shown read-only and a link to
sign in — never a form that fails when they press Save. Every write is checked again at the API,
so the read-only view is a courtesy, not the access control.

The operator console has nine sections: **Overview**, **Connection**, **Taxonomy & Agents**,
**Jobs**, **Logs**, **Audit**, **Usage**, **Branding** and **Security**.

## 2. Connect a Knowledge Box — Settings → Connection

The deployment's upstream connection, editable: Knowledge Box id, region or an explicit base URL,
generative model, reranker, and the request timeout (1–300 seconds). Save and the very next
request uses the new client; there is no restart and no redeploy.

The **service-account token** is the one value that behaves differently. It can be set and it can
be rotated, but it is never returned — the field shows "set · rotate", no read model contains it,
and the audit entry records only that it changed. Leaving it blank means "leave the stored
credential alone", not "clear it": clearing a deployment's credential from a form is how you take
it offline with no route back through the product.

Connection edits apply to a live deployment. On a sample-data deployment they are stored but not
applied, because re-pointing the in-process sample Knowledge Box would break the sample data with
no way back through the UI. The generative model and reranker still apply.

To confirm the connection is real rather than merely saved, go to **Admin → Connection**. Every
load performs an actual catalog read plus a configuration read against the Knowledge Box and
reports the generative model in use, the resource count and the round-trip time; **Re-test
connection** forces a fresh check. A raw-JSON panel shows the exact response. The second view on
that screen, **Configuration**, is the full effective environment this process booted with, with
every secret-shaped variable shown only as `•••(N chars)` — enough to confirm it is set, never
enough to see it. (`/admin/health` and `/admin/config` still work; they redirect here.)

## 3. Put the partner's identity on it — Settings → Branding

Product name, tagline, footer line, the primary and accent colours, the "powered by" credit, and
the docs and support links, with a preview that moves as you type rather than after you save.

**Upload a logo** by dropping it on the page — SVG, PNG, JPEG or WebP, up to 512 KB. The file is
written to the deployment's data volume, not baked into a container image, so it survives deploys;
a re-upload replaces it and is visible immediately rather than after a browser cache clear, and
**Remove logo** takes it away again. An uploaded SVG is served sandboxed, so a mark carrying script
cannot run it with this deployment's privileges.

Colours and URLs typed into this form go through exactly the same validation a value from the
environment gets. A colour that is not a colour is refused with an error, not rendered.

Each section carries **Reset to environment default**, which puts the whole section back to what
the deployment booted with. **Admin → Branding** shows the same identity read-only — useful for
confirming what a partner's customers will actually see — and links here to change it.

## 4. Set the limits — Settings → Limits

Four numbers and a cache policy, all editable and all in force on the next request:

| Setting | Range | What it bounds |
|---|---|---|
| Maximum upload size | 1 KiB – 2 GiB | The largest recording the upload endpoint accepts |
| Maximum question length | 40 – 4,000 characters | A question asked of a single call |
| Rate limit | 0 – 10,000 requests/second | Per caller, per IP or per API key |
| Rate-limit burst | 1 – 100,000 | How much of that budget can arrive at once |
| Read cache TTL | 0 – 60 minutes | How long a read is reused before it is refreshed |

Changing the cache TTL discards the entries already held, because they were admitted under a
policy that no longer applies. That is a deliberate, momentary cost, not a bug.

## 5. Decide how long calls are kept — Settings → Retention

Set a policy in days and whether it is enabled. Saving the policy **deletes nothing**.

Below the policy is a **preview**: exactly which calls that policy covers, how old each one is,
how many the policy would remove and how many it retains. The preview is available whether or not
the policy is enabled, and you can preview a number of days other than the saved one — so the
consequence of a policy is visible before it is committed to.

A **purge** is the separate, deliberate act that actually deletes. It is operator-only, and it
happens in two steps: the product first runs the purge as a dry run — the same code path, the same
scope, nothing deleted — and then asks you to type back the number of calls it reported before it
will run for real. A real run is irreversible: the Knowledge Box resource, its recording and every
label and analysis derived from it are removed, and any live share link pointing at a purged call
is revoked in the same pass so no URL is left resolving to nothing. One run removes at most 200
calls; run it again for more.

There is **no background sweeper**, by design. Nothing is ever deleted because a timer fired — a
person or a scheduler has to ask. A policy of 0 days means "no retention limit", not "delete
everything": the destructive reading of a default-valued field is never the right one. If you need
retention to happen unattended, point your own scheduler at the purge endpoint, which keeps the
property that every deletion was something that was asked for.

## 6. Give a system access — Settings → API keys

Issue a key with a name — the name is required, because a key nobody can identify is a key nobody
can safely revoke. The key material is shown **once**, at creation, with a copy control and a
warning. The product stores only a one-way digest of it and therefore physically cannot show it
again; a lost key is revoked and reissued.

The list shows each key's name, a recognisable preview (`ca_live_` plus eight characters), when it
was created, when it was last used, and whether it is revoked. Keys can be renamed. **Revoking
does not delete the row** — the record of a key that once had access, and when it was last used,
is exactly what an incident review needs.

If this deployment was configured with `API_KEYS` in its environment, those keys are already here,
imported once as managed keys named "Environment key N". Nothing your callers hold stops working;
you simply gain the ability to name, rotate and revoke without a redeploy.

A caller presents a key as `X-API-Key` or as a bearer token. Keys are for *using* the product's
data: a key cannot re-point the deployment at another Knowledge Box, mint another key, or purge
the corpus. Those change the deployment for everyone, so they are the operator's job and need the
operator's sign-in.

## 7. Review who was sent what — Settings → Share links

A share link is a revocable, expiring, read-only URL to one call, created by a reviewer from the
call workspace. This screen is the whole register across every call — filterable by state
(active, revoked, expired, or all), showing the call, the note the creator left, the creation and
expiry times, and a **Revoke** control.

Reviewing links from one place is the point: without it, the only way to find a link is to know
which call it points at. Revoking is immediate, and an unknown, revoked or expired token is
indistinguishable to a visitor — all three are a plain 404, so a dead link cannot confirm that a
call ever existed.

## 8. Shape what the product classifies — Agents & Taxonomy

`/taxonomy` in the product, or **Admin → Taxonomy & Agents** in the console: deliberately the same
screen, because an operator and a reviewer must never be looking at two different accounts of
what is actually live. The **Labelsets** tab lists every labelset with its level (whole call or
transcript block), its label count, how many calls currently carry each label, and whether the
Knowledge Box really holds it; the **Agents** tab shows each data-augmentation agent with its live
task state, description, operation count and task id. A banner appears whenever a labelset or an
agent is missing, so "my calls aren't being labelled" has one screen that tells you which of the
possible causes it actually is.

Signed in, it is an editor.

**Create a labelset.** An id, a title, a colour, whether several of its labels may apply to one
call, whether it classifies whole calls or transcript blocks, and its labels — each with a
description and optional examples. The description is not documentation: it is the instruction the
labeler agent reads when deciding whether to apply that label, which is why it is required.
Creating also writes the labelset to the Knowledge Box, so the agent can apply it on its next run.

**Edit one.** The id is fixed once created. Renaming it would orphan every label already applied
in the Knowledge Box under the old one, which is why the product will not do it. Saving
re-provisions the labelset, so the definition and the Knowledge Box cannot drift apart.

**Delete one.** The confirmation offers a second, separate choice: *also remove it from the
Knowledge Box*. Left unticked, the labelset leaves the product's vocabulary and analysed calls
keep the labels already applied with it. Ticked, those labels are destroyed upstream. They are
data, not configuration, which is why it is never the default and why it is a distinct decision on
the dialog rather than a side effect of deleting.

**Edit an agent.** Enable or disable it, change its model, and rewrite its instructions. For
`call-insights` those instructions are the prompts that produce the narrative analysis and the
flat metrics, shown as editable text — this is where you change what a "scorecard" means for a
particular partner. A labeler agent's operations are not editable, because they are *derived* from
the current labelsets on every read; that is what stops a labelset edit and the agent that applies
it from drifting apart.

**Start, stop and re-provision.** A Knowledge Box allows exactly one running task per operation
type, so the agents are started one at a time with a wait between them — which is why
re-provisioning is a job with a progress stream rather than a request that returns. Starting an
agent that already has a running task fails rather than quietly queueing a second. For the same
reason, an edited instruction takes effect on the **next provision**: rewriting an agent under a
task that is mid-run is how you get half a corpus labelled two different ways. Provisioning is
idempotent and safe to run again at any time.

Existing calls keep their old labels and analysis until re-provisioned agents pass over them
again; provisioning does not re-analyse already-processed calls on its own.

## 9. Watch the work — Admin → Jobs

Every ingestion, sample load, re-analysis and provisioning run, most recent first: kind, status,
current stage and start time. Click a row for its full stage timeline (each stage's timestamp,
status and duration), the error message on a failure, and the complete job record as JSON. This is
the same history the product's own **Ingest history** (`/upload/history`) shows a reviewer.

A queued or running job carries a **Cancel** control. The confirmation is explicit about what
cancelling does and does not do: the job stops at its current stage, and work already committed
upstream is not undone — a cancelled ingestion leaves the Knowledge Box resource it had already
created, which the calls list then shows as incomplete rather than pretending it never existed.
A job that has already finished cannot be cancelled, and says so.

A call that is still queued or transcribing can also be cancelled from its row in the calls list,
which is where a reviewer notices a stuck upload first.

## 10. Read the record of changes — Admin → Audit

Every configuration change this deployment has seen: when, who, what. Actions are dotted names —
`settings.branding`, `settings.connection`, `settings.logo.upload`, `apikey.create`,
`labelset.delete`, `agent.update`, `job.cancel` — and the list can be narrowed to a group, so
"everything about API keys" is one click.

The actor is how the request authenticated: `operator`, `api-key:<its name>`, `session` or
`anonymous`. The detail records the values that changed, with one deliberate exception — a secret
is recorded as a plain yes, never quoted. An audit trail that repeats the credential is simply a
second place to leak it.

The trail is capped at 5,000 records. It is operational evidence — enough to answer "who changed
the retention policy last Tuesday" — rather than a compliance-grade, tamper-evident store; if you
need the latter, ship these records into it.

## 11. Keep an eye on the service — Admin → Overview, Logs, Usage, Security

**Overview** answers the three questions an operator opens a console to ask: is it up, what is it
doing, and what has gone wrong lately. A stat strip shows mode (sample or live) with the
round-trip time, the resource count in the Knowledge Box, jobs running/queued/failed, and cache
entries with hit and miss counts; each tile links to the section with the detail. Below it, an "at
a glance" panel repeats the Knowledge Box, endpoint and generative model, and two panels list the
most recent jobs and the most recent error-level log lines.

**Logs** is the last structured log records the process has produced, filterable by minimum level
and a free-text search, refreshed every few seconds. It is an in-memory ring buffer, not a
persisted store — restarting clears it — and secrets are redacted the same way they are
everywhere else.

**Usage** has two views. *Counters*: requests and errors since this process started, questions
asked with their input and output token counts, Knowledge Box call count and average latency,
uploads, deletes, cache hit rate, and request volume by route. *Cache*: entry count, TTL,
hit/miss counts and rate, evictions and invalidations, a breakdown by namespace, and the keys
currently held, with buttons to invalidate one namespace or everything. (`/admin/cache` redirects
here.) The product's own **Settings → Usage** shows the counters view to a signed-in operator too.

**Security** is the auth posture in one place: whether the operator token is configured, how many
API keys exist, the environment name, the trusted-proxy header, the per-client rate limit and the
media and ask routes' own separate buckets, and the allowed cross-origin list. It links to
Settings → API keys for the key management itself. Nothing secret appears on the page: key
material is redacted server-side before it ever reaches the browser.

## 12. Exercise the API itself — `/api`

Not strictly an operator screen, but the fastest way to answer "can the product actually do X".
The **API** section lists every operation this deployment declares, with its parameters and
schemas, a form that calls the live endpoint using your operator session or a pasted key, the
response, and a copyable curl. It is generated from the deployment's own OpenAPI document, so it
cannot describe an API this deployment does not serve. A pasted key stays in the page's memory —
never in browser storage, never in the URL, never in the generated curl. Destructive operations
ask twice, because the form calls the real API against the real Knowledge Box.

## What an operator cannot do from here

Stated plainly, because a console that implies more control than it has is worse than one that
admits the limit:

- **Create a Knowledge Box, or change its plan, quota or zone.** Settings → Connection points at
  one that already exists.
- **Choose from a list of generative models.** The model name is passed through to ARAG; an
  unrecognised one fails upstream, not here.
- **Queue or prioritise an agent run.** ARAG owns the running task; the product can start one,
  stop one and read its state.
- **Re-label existing calls on demand.** An agent runs over whatever is in the Knowledge Box when
  it starts; re-analysis of a specific call is available per call and in bulk from the calls list,
  but a taxonomy change does not retroactively re-classify a corpus on its own.
- **Undo a purge, or a labelset deleted from the Knowledge Box.** Both are irreversible, which is
  why both take an explicit second decision.
- **Grant one reviewer access to a subset of calls.** There is no per-user identity or per-call
  authorization in this MVP — everyone who can reach the deployment can read every call in it. See
  [Security model](../architecture/security-model.md#known-mvp-limitations).

## One more operational fact worth knowing

Everything an operator changes here — settings, API keys, the taxonomy, saved views, share links,
the audit trail — is stored on the deployment's own data volume (`DATA_DIR`), not in the Knowledge
Box and not in the container image. Two consequences follow, and both matter:

- **Back that volume up.** Losing it reverts the deployment to its environment defaults and stops
  every product-issued API key from authenticating.
- **Run one machine, unless the volume is shared.** A second machine with its own volume keeps its
  own settings, its own keys and its own taxonomy, so a change made on one does not reach the
  other. See [Deployment topologies](../architecture/deployment-topologies.md) and
  [Scaling](../architecture/scaling.md).

## How this walkthrough is verified

`make e2e` runs the operator Playwright suite alongside the demo suite: the API refuses
`/api/v1/admin/health` without a token, a signed-out visit shows an error rather than data, a
wrong token is rejected, a correct one signs in and runs a live Knowledge Box connection test, the
configuration view is asserted to contain neither the operator token nor the service-account key,
the usage counters and log inspector return real records, the agents are listed, the cache view
reports statistics and invalidates, the job history is inspectable, and the legacy
`/admin/health`, `/admin/config`, `/admin/agents` and `/admin/cache` routes redirect to their new
homes. Every settings edit is covered by a journey that saves a value, reloads, asserts it
persisted and asserts the effect is visible.

Against a real Knowledge Box, `make smoke-write` (opt-in, `CALLS_ALLOW_LIVE_WRITE=1`) exercises
the same operator paths end to end — a settings write and its effect on a second reader, issuing
and revoking a key, creating, editing and deleting a labelset upstream, editing an agent's
instructions, uploading and deleting a call, creating and resolving a share link, and a retention
preview — and removes everything it created, leaving the seeded demo corpus untouched.
