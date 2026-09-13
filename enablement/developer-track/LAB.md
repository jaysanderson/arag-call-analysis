# Call Analysis — Developer Lab

**Format:** half day, hands-on, self-paced or instructor-led. **Prerequisites:** [bun](https://bun.sh),
Node ≥ 22.18, a terminal, a browser. **No ARAG credentials required** — everything runs against the
in-process mock ARAG server, which seeds a Knowledge Box with real transcripts and runs this
product's own agents against them at boot. Everything you see is real data produced by the real
taxonomy, not fixtures.

Work from a clone of this repo on branch `mvp`. Exercises 1 and 2 change product source; 3 to 7
change a running deployment through its API. Each exercise tells you how to put things back.

| # | Section | Time | You will have |
|---|---|---|---|
| 0 | Start the deployment, tour the shell | 20 min | The product open, sample data live, the API explorer bookmarked |
| 1 | Read the contract | 15 min | Pointed at the file that validates every request and the one that turns a throw into a problem document |
| 2 | **Exercise 1** — add a read endpoint | 25 min | `GET /api/v1/calls/{id}/moments`, spec-first, contract-tested |
| — | *break* | 10 min | |
| 3 | **Exercise 2** — extend the shipped taxonomy | 15 min | A new labelset in source, and an understanding of the seam it has to cross |
| 4 | **Exercise 3** — cache: TTL, single-flight, stale-while-revalidate | 20 min | A measured miss / hit / stale sequence, and the reason `dashboard:all` no longer exists |
| 5 | **Exercise 4** — edit a labelset, re-provision, re-run the labeler | 25 min | Calls reclassified by a description you wrote, live |
| — | *break* | 10 min | |
| 6 | **Exercise 5** — change a setting live, prove it through the API | 20 min | The same request answered 200, then 400, then 200, with no restart |
| 7 | **Exercise 6** — issue, use and revoke an API key | 20 min | A key minted, used, revoked, purged — and the sticky-enforcement trap sprung on purpose |
| 8 | **Exercise 7** — scope the dashboard, drill through, save the view | 20 min | A shared saved view, and a real defect you found by checking the numbers |
| 9 | Wrap-up and further reading | 10 min | Where to go next |
| 10 | [Knowledge check](knowledge-check.md) | 20 min | 18 questions, answers included |

**Total: 3 h 40 including two breaks.** Exercises 1–3 are the "how is this built" half; 4–7 are the
"how is this operated" half. If you only have two hours, do 0, 1, 2 and 5.

---

## 0. Start the deployment and tour the shell (20 min)

```bash
make install
```

### Starting in sample mode

`make dev` starts against the in-process mock **only when `.env` has no `ARAG_API_KEY`**. This
repo's `.env` may well have live credentials in it, so be explicit — put the deployment in sample
mode and give it a lab-local store you can throw away:

```bash
ARAG_MOCK=1 ADMIN_TOKEN=dev-admin-token DATA_DIR=./data/lab make dev
```

`ARAG_MOCK=1` in the real environment always wins: the platform's `.env` loader never overwrites a
variable that is already set. `DATA_DIR=./data/lab` keeps every setting, API key, saved view, share
link and taxonomy edit you make today in one throwaway directory (`data/` is gitignored) — so
"start again" is `rm -rf ./data/lab`, which Exercise 2 needs and the others benefit from.

Confirm it:

```bash
curl -s http://localhost:3000/api/v1/admin/health -H "Authorization: Bearer dev-admin-token" \
  | python3 -m json.tool
```

`"mock": true`, `"ok": true`, and `arag.resources` around 13. The first request is the slow one —
it boots the mock, seeds the transcripts, provisions the taxonomy and runs the labeler and ask
agents synchronously.

> **Only one dev server per checkout.** Next refuses a second one in the same directory. Stop the
> first before starting another on a different port.

### The shell

Every screen — product and operator alike — lives in one application shell with one left-hand rail
(`DECISIONS.md` **D-CA-21**: an operator is not a different species of user). Walk it in this order:

| Screen | What to look at |
|---|---|
| **Dashboard** <http://localhost:3000> | The range picker (`?range=7d…all`), the stat strip, and the fact that every tile and every chart bar is a link |
| **Calls** <http://localhost:3000/calls> | Facets, sortable columns, the column picker, row density, saved views, bulk actions on selection, and the **Browse** toggle (`?mode=browse`) for the category rails |
| **A call** click any row | Moments track over the transcript, the inspector's Analysis / Ask / Details tabs, **Share**, **Export** |
| **Upload** <http://localhost:3000/upload> | Dropzone, metadata form, live pipeline stepper fed by an SSE job stream; **Ingest history** for what ran before |
| **Agents & Taxonomy** <http://localhost:3000/taxonomy> | Six labelsets and three agents with live state. Read-only until you sign in |
| **Settings** <http://localhost:3000/settings> | Nine tabs, each its own route (`?tab=`), each naming the endpoint that fed it |
| **API** <http://localhost:3000/api> | **60 operations across 13 tags**, read from `/api/v1/openapi.json` at runtime, filterable, deep-linkable (`?op=listCalls`), with a try-it panel and a copyable curl |
| **Admin** <http://localhost:3000/admin> | Sign in with `dev-admin-token`. Overview, Connection, Taxonomy & Agents, Jobs, Logs, Audit, Usage, Branding, Security |

Then two things from the terminal, because the rest of the lab lives there:

```bash
curl -s "http://localhost:3000/api/v1/calls?page_size=3" | head -c 400; echo
curl -s -i "http://localhost:3000/api/v1/calls/does-not-exist" | head -5
```

A page of JSON, then a `404` with `Content-Type: application/problem+json` — RFC 9457, the shape
every error in this product has.

**Checkpoint:** dashboard renders with non-zero KPIs; `/api` reports 60 operations; admin health is
green and says `mock: true`; you have run one successful and one failing `curl`.

---

## 1. Read the contract (15 min)

Two files carry almost everything.

**`lib/openapi.ts`** is the single source of truth for the API. It is served at
`/api/v1/openapi.json`, rendered by Redoc (`/api/v1/docs`), Swagger UI (`/api/v1/swagger`) and the
in-product explorer (`/api`), used to **validate every request**, and used by the contract tests.
Read it in three passes:

- **Schemas** — plain JSON Schema objects referenced by the local `ref()` helper. Find
  `LabelsetDefinition`, `AgentUpdateRequest`, `ApiKeyCreated`, `ShareLink`, `PurgePreview`.
- **Paths** — each operation carries an `operationId`, `tags`, parameters/body, and spreads
  `...problemResponses` so every operation documents 400/401/403/404/429/502 without repeating it.
- **`API_ROUTES`** at the bottom — 60 entries of `{ method, path, auth, file }`. The contract tests
  assert this against both the spec and the filesystem, in both directions.

The `auth` field is worth ten minutes on its own. Four modes, enforced by `enforceAuth()` in
`lib/api.ts`:

| Mode | Meaning |
|---|---|
| `none` | Public. `GET /api/v1/calls`, `GET /api/v1/dashboard`, `GET /api/v1/settings` |
| `api` | Open **until this deployment has ever had an API key**, then needs one (or the operator token, or a session cookie). Saved views, share links |
| `write` | Operator token or a real API key, always. The session cookie never suffices. Uploads, deletes, taxonomy edits, agent control, job cancellation (**D-CA-13**) |
| `admin` | The operator token specifically. Settings, API keys, retention purge, everything under `/api/v1/admin/*` (**D-CA-42**) |

**`lib/api.ts`**'s `route()` is the function every handler wraps itself in, and the only place that:

1. assigns and propagates `X-Request-Id`;
2. authenticates (`Authorization: Bearer <admin token | api key>`, `X-API-Key`, or cookie) and
   enforces the route's mode;
3. applies the per-IP token-bucket rate limiter, with per-route multipliers (**D-CA-15**);
4. looks up the operation's schemas and validates path params, query and body against them,
   coercing types as it goes;
5. builds the `ApiContext` the handler receives;
6. converts anything thrown into an RFC 9457 problem document — including ARAG failures, mapped to
   generic messages so a KB URL or token can never reach a client.

That is why a handler is three or four lines. Open `app/api/v1/calls/[id]/route.ts` and confirm it.

**Checkpoint:** you can name the file and function that (a) validates a query parameter, (b) turns
a thrown error into `application/problem+json`, and (c) decides whether an API key is enough.

---

## 2–8. The exercises

Each links to its own file, and each has a worked solution with the results actually observed when
it was written. Try the exercise before opening the solution.

| # | Exercise | Solution |
|---|---|---|
| 1 | [Add a read endpoint](exercises/01-add-endpoint.md) — `GET /api/v1/calls/{id}/moments`, spec first | [solution](solutions/01-add-endpoint.md) |
| 2 | [Extend the shipped taxonomy](exercises/02-extend-taxonomy.md) — source, and the seed-once seam | [solution](solutions/02-extend-taxonomy.md) |
| 3 | [Cache behaviour](exercises/03-cache.md) — TTL, single-flight, stale-while-revalidate | [solution](solutions/03-cache.md) |
| 4 | [Edit a labelset live](exercises/04-edit-labelset.md) — edit, provision, re-run the labeler | [solution](solutions/04-edit-labelset.md) |
| 5 | [Change a setting live](exercises/05-settings-live.md) — and prove the effect through the API | [solution](solutions/05-settings-live.md) |
| 6 | [API keys](exercises/06-api-keys.md) — issue, use, revoke, and the sticky-enforcement trap | [solution](solutions/06-api-keys.md) |
| 7 | [Dashboard drill-through](exercises/07-dashboard-drill-through.md) — scope, drill, save a view | [solution](solutions/07-dashboard-drill-through.md) |

Starter scaffolding for Exercise 1 is in [`starter/`](starter/README.md). Exercises 2 to 7 need
none — they are edits to real files and calls against a running deployment.

---

## 9. Wrap-up and further reading (10 min)

You have now touched every layer this product has: the OpenAPI contract, the `route()` adapter, a
service function, the taxonomy that drives ARAG's agents, the cache that keeps read cost bounded,
the settings store that makes the deployment configurable without a restart, the credential store,
and the shared state (views, shares) that turns a screen into a team's tool.

- `docs/developer/extension-points.md` — the supported extension seams, including the settings
  inventory, "adding a setting" in five steps, and the interface to implement if you want to swap
  `TtlCache` for Redis.
- `docs/developer/build-your-own.md` and `docs/developer/white-label.md` — shipping this product as
  something else.
- `docs/architecture/arag-integration.md`, `docs/ARAG_NOTES.md` — labelers, ask agents, citations,
  one-running-task-per-type.
- `docs/architecture/security-model.md` — the threat model behind the auth modes you read in §1.
- `DECISIONS.md` — 48 entries. The ones this lab leaned on: **D-CA-04** and **D-CA-40** (cache),
  **D-CA-13** and **D-CA-42** (auth split), **D-CA-27** (share links), **D-CA-34/35/45** (settings
  as a store, write-only secrets), **D-CA-36/46** (API keys), **D-CA-37** (taxonomy store),
  **D-CA-38** (retention), **D-CA-39** (views vs furniture).
- `enablement/architect-track/WORKSHOP.md` — the same system from an evaluator's side, including a
  module on the three designs this lab exercised most.
- `test/` — `test/unit/`, `test/integration/`, `test/contract/openapi.test.ts` and `test/e2e/`. The
  e2e specs are the best written description of what each screen is *for*.

---

## Known defects and gaps

Found while writing and executing this lab, against the sample deployment. Reported to the product
owner; listed here so nobody spends an afternoon assuming they broke it.

1. **Dashboard drill-throughs disagree with the numbers they come from.** Every KPI tile and chart
   is computed from `call_metrics` (the `call-insights` **ask** agent) while every drill-through
   link filters on labels (the `resource-labeler` **labeler** agent). Two agents, no reconciliation.
   On the sample corpus *Cross-sell accepted* reads 0% and links to ten calls, and *Complaint rate*
   reads 23% and links to none. Reproduce it in [Exercise 7, Task 9](exercises/07-dashboard-drill-through.md);
   the fix and the test that should have caught it are in [its solution](solutions/07-dashboard-drill-through.md).
2. **A labelset cannot be reset to its shipped definition.** Every settings section has
   `DELETE /api/v1/settings/{section}`; the taxonomy has no equivalent. `restoreLabelset()` exists
   in `services/taxonomy-store.ts` and is unit-tested, but no route and no button reach it, so
   undoing an edit means retyping the original or deleting `DATA_DIR/taxonomy.json` and losing
   every other customisation with it. See [Exercise 4](exercises/04-edit-labelset.md).
3. **A source-taxonomy change cannot reach an existing deployment.** `seedTaxonomy()` runs once,
   guarded by a `seeded` marker, and there is no re-seed operation — so a partner who rewrites
   `lib/domain/taxonomy.ts` and redeploys changes nothing for existing users. In sample mode it is
   worse than nothing: the mock Knowledge Box *is* re-seeded from source at boot, leaving labelsets
   that are `provisioned: true, defined: false`. See [Exercise 2](exercises/02-extend-taxonomy.md).
4. **The audit trail covers configuration but not data.** Every call site of `audit()` lives in
   `settings`, `api-keys`, `labelsets`, `agents`, `retention/purge`, `settings/logo` and
   `jobs/{id}` (cancel). Nothing under `/api/v1/calls`, `/api/v1/views` or `/api/v1/shares` records
   anything — so **deleting a call, bulk-deleting forty calls, creating a share link and creating
   a shared saved view are all unaudited**, and all four are reachable with an API key rather than
   the operator token. A retention purge is recorded; the `DELETE /api/v1/calls/{id}` that removes
   the same recording is not. Verified by creating a view and a share and watching the trail stay
   at thirteen entries, and by grepping every `audit(` call site.
5. **The `OPTIONS = preflight` convention is enforced by review only.** D-CA-14 requires every
   route to export it; no contract test asserts it, and the Exercise 1 scaffold used to omit it.
6. **`PurgePreview.total` means "candidates", not "calls".** `GET /api/v1/retention/preview?days=90`
   on a 13-call corpus returns `total: 7, retained: 6`. It is internally consistent
   (`total` = `candidates.length`) but the field has no `description` in the spec, and "total" next
   to "retained" reads as the catalogue size. A one-line spec fix.
