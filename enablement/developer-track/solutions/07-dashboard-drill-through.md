# Solution — Exercise 7: scope, drill through, save the view

Executed against the sample deployment (13 calls, newest 2026-09-xx) while this was written.

## Step 1 — the window resolves server-side

```
range=all  total=13  excluded=0   from=None
range=12m  total=13  excluded=0   from=2025-09-14
range=90d  total=5   excluded=8   from=2026-06-16
range=30d  total=0   excluded=13  from=2026-08-15
```

`total + excluded` is always 13. `range` is resolved into concrete instants by
`DASHBOARD_RANGES` in `services/dashboard.ts` and handed back as `window: { range, from, to,
excluded }` — the client never computes a date.

`excluded` is the field that keeps the product honest: at `range=30d` the dashboard shows zero
calls, and without `excluded` it could not distinguish "this deployment is empty, send them to
first-run onboarding" from "your window is too narrow". `app/page.tsx` checks both
(`d.total === 0 && d.window.excluded === 0`) before redirecting to `/welcome`.

## Steps 2–4 — a drill-through that agrees with its number

```
window.from                                              = 2026-06-16T00:00:00.000Z
GET /calls?sentiment=Negative                   → total 3   (all time)
GET /calls?sentiment=Negative&from=<window>     → total 1   (90 days)
GET /dashboard?range=90d → bySentiment[Negative] =      1   ✔ agrees
```

The donut links with `?sentiment=`, the generated metric it was tallied from. When this exercise was
first run it linked with `?label=sentiment/Negative` instead and returned the same numbers — which
is exactly the trap Task 9 is about. On this corpus the labeler and the ask agent happened to agree
about sentiment; they do not agree about `call_reason`, and nothing made either of them agree about
anything. A drill-through that is right by coincidence is indistinguishable, from the outside, from
one that is right by construction.

The link carries the **resolved instants**, not `range=90d`. That matters for two reasons: a
pasted link means the same thing tomorrow as it does today, and a saved view built from it pins a
window rather than a name that drifts (the calls-list e2e spec asserts exactly this).

In the UI the window arrives as two removable chips. The sentiment filter does **not** arrive as a
third one, and the table does not apply it — `CallsWorkspace` builds its request from an allowlist
that has no metric filters in it. See "What is still open" at the end.

## Steps 5–6 — what a saved view is

`POST /api/v1/views` returned `201`, and the stored `query` came back **re-normalised**:

```
sent:   label=sentiment%2FNegative&from=2026-06-16T00:00:00.000Z&sort=created&order=desc
stored: label=sentiment%2FNegative&from=2026-06-16T00%3A00%3A00.000Z&sort=created&order=desc
```

The colons are percent-encoded because the query was parsed, filtered through the `VIEW_PARAMS`
allowlist (`q`, `label`, `agent`, `queue`, `media_type`, `lifecycle`, `from`, `to`, `sort`,
`order`, `page_size`, `mode`) and re-serialised. A saved view is a URL the product will later
follow, so it is validated on the way in rather than trusted on the way out.

An unauthenticated `GET /api/v1/views` listed it. That is the point of **D-CA-39**: a view is a
shared definition of a work queue — a rota of supervisors has to see the same thing, which
`localStorage` cannot deliver. Columns and density went the other way, to `localStorage`
(`ca.calls.columns`, `ca.calls.density`), and are absent from the URL entirely, so a link carries
your question and the recipient's own furniture.

## Where each piece of state lives, and why

| State | Lives in | Why there |
|---|---|---|
| filters, search, sort, page, date window, table/browse mode | the **URL** | it is the question; it must be linkable, pasteable and back-button-able |
| saved views | the **server** (`DATA_DIR/views.json`) | a work queue is shared; two supervisors must see one list |
| visible columns, row density | the **browser** (`localStorage`) | furniture — one person's preference, not part of anyone's question |
| row selection for bulk actions | **React state** | transient by definition; a reloadable "3 calls selected" would be a hazard, not a feature |

## Task 9 — the defect, and the mechanism that replaced it

### What the first run of this lab found

```
KPI tile                 number shown   drill-through returned
First-Call Resolution    10 of 13       3
Complaint Raised         3 of 13        0
Cross-sell Accepted      0 of 13        10
```

Every row disagreed. **Cross-sell accepted read 0 % and linked to a list of ten calls.**

And it was not confined to the stat strip. Every chart on a **pristine** sample deployment:

```
byReason (chart)              chart   drill-through
  Benefits & Coverage             6       6
  Billing & Payments              3       0   ✗
  Enrollment & Eligibility        3       4   ✗
  Claims                          1       0   ✗
bySentiment                    10 / 3  10 / 3     agreed
byOutcome                      10 / 3  10 / 3     agreed
byLob                          12 / 1  12 / 1     agreed
```

Three of the six charts happened to agree, and it is worth being precise about why that was not
reassuring: they agreed because on thirteen short synthetic transcripts two independent agents
reached the same conclusion, not because anything made them. `byReason` — the chart with the most
label choices to get wrong — is where the coincidence ran out. This is the single most useful
observation in the exercise: **a dashboard can be wrong in a way that is invisible on small data and
unmissable on real data.**

> A note on reproducing the old behaviour, if you want to: check out a commit before
> `lib/drilldown.ts` existed. On the current build the tiles and the charts agree by construction,
> and `test/integration/dashboard-drilldown.test.ts` fails if they ever stop.

**Cause.** `lib/aggregate.ts` computes every number on the dashboard — KPI rates, `byReason`,
`bySentiment`, `byOutcome`, `byLob`, the cross-sell funnel — from each call's **`call_metrics`**,
written by the `call-insights` **ask** agent:

```ts
complaintRate: count((m) => m.complaint) / n,
byReason: tally(metrics.map((m) => m.call_reason)),
```

`app/page.tsx` built every drill-through as a **label** filter, written by the `resource-labeler`
**labeler** agent:

```ts
href={lc("disposition_flags", "Complaint Raised", scope)}
```

Two independent data-augmentation agents read the same transcript and answer the same question
separately. Nothing in the product reconciled them, and nothing ever could — a generative
classification and a generative labelling of the same call are simply two opinions. The number and
the list it linked to had **no shared source**, so they agreed only by coincidence.

### What was built instead

Three changes, and the order matters because each one exists to make the next possible.

1. **The API learnt to filter on what the dashboard counts.** `GET /api/v1/calls` already took
   `complaint`, `fcr` and `escalated`; it now also takes `call_reason`, `outcome`, `sentiment`,
   `line_of_business`, `complaint_category`, `cross_sell_offered` and `cross_sell_accepted`
   (`CALL_FILTER_PARAMS` in `lib/openapi.ts` → `lib/query.ts` → `filterByAttributes` in
   `services/calls.ts`). The wire names match the `call_metrics` field names exactly, so a reader of
   the URL can see which generated value is being tested. Note that `?label=call_reason/Claims` was
   not removed — both filters are legitimate, and the point is that the dashboard must use the one
   it counted.

2. **The figure and its filter became one object.** `lib/drilldown.ts` `dashboardFigures(d)` returns
   `{ id, label, count, filters }` for every number the dashboard renders as a link, and
   `callsHref(filters, scope)` is the only thing that builds the URL. `app/page.tsx` no longer knows
   how to write a drill-through, so it cannot write a wrong one. `Dashboard.counts` was added to
   `lib/aggregate.ts` at the same time, because a rate cannot be compared with the length of a
   filtered list — without the numerator the test would have had to recover it by multiplying and
   rounding, and would then be checking its own arithmetic.

   The two average tiles (compliance, CSAT) are deliberately **not** in the enumeration. A mean has
   no subset of calls behind it; `SORT_ONLY_TILES` sends those two to the list sorted ascending —
   "show me the worst" — which is an honest action rather than a filter pretending to explain the
   number. Refusing to link the two tiles that cannot honestly be linked is the harder half of the
   design.

3. **The property was written down as a test.** `test/integration/dashboard-drilldown.test.ts`
   walks the enumeration against a live server and asserts each figure's `count` equals the `total`
   its own link returns; repeats it inside a window that excludes everything, so a figure computed
   over a window and a link that forgot it cannot both pass; and asserts directly that
   `?call_reason=` and `?label=call_reason/…` are different filters.

The property the whole thing encodes, which is the thing to carry to the next dashboard you review:

> **Every clickable number on the dashboard and the list it navigates to are produced by the same
> query over the same field.**

A tile added without an entry in `dashboardFigures()` is merely untested; a tile added with the
wrong filter fails. That is the difference between "the numbers match today" and "a wrong filter
cannot reach main", and it is why the test — not the three changed `href`s — was the real
deliverable.

### Breaking it on purpose

Changing `...fromTally("sentiment", d.bySentiment, "sentiment")` to `"call_reason"` and re-running
the test fails in the enumeration case with the figure id, the query it built and both numbers, e.g.
`sentiment:Negative ("Negative") shows 3 but ?call_reason=Negative returns 0`. A failure message
that names the figure and the query is the difference between a guard someone fixes and a guard
someone deletes.

## What is still open

The API agrees with the dashboard and the links are generated from the same declaration. The **calls
table does not yet carry the metric filters**:

- `CallsWorkspace`'s `query` memo builds the request from `q`, `label`, `agent`, `queue`,
  `media_type`, `lifecycle`, `from`, `to`, `sort`, `order`, `page`, `page_size` — no metric filter
  is forwarded to the API.
- `activeFilters` in the same file renders no chip for one, so there is nothing to remove.
- `VIEW_PARAMS` (`services/views.ts`, mirrored in `components/calls/view-query.ts` and pinned to it
  by `test/unit/calls-views.test.ts`) drops them on save, so a view cannot store one.

So a tile links to a correct URL that the table under-filters: `curl` agrees with the dashboard, the
screen does not. The fix is the three allowlists plus a chip, and the test to add alongside it is
the browser-level twin of the integration one — click a tile, assert the row count matches the
number that was clicked.
