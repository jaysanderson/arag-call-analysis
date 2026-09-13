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
window.from                                                  = 2026-06-16T00:00:00.000Z
GET /calls?label=sentiment/Negative                 → total 3   (all time)
GET /calls?label=sentiment/Negative&from=<window>   → total 1   (90 days)
GET /dashboard?range=90d → bySentiment[Negative]    =       1   ✔ agrees
```

The link carries the **resolved instants**, not `range=90d`. That matters for two reasons: a
pasted link means the same thing tomorrow as it does today, and a saved view built from it pins a
window rather than a name that drifts (the calls-list e2e spec asserts exactly this).

In the UI the window arrives as two removable chips alongside the sentiment chip, so the first
thing a user can do on the destination screen is widen the question they were sent with.

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

## Task 9 — the defect

```
KPI tile                 number shown   drill-through returns
First-Call Resolution    10 of 13       3
Complaint Raised         3 of 13        0
Cross-sell Accepted      0 of 13        10
```

Every row disagrees. **Cross-sell accepted reads 0% and links to a list of ten calls.**

And it is not confined to the stat strip. Checking every chart on a **pristine** sample
deployment:

```
byReason (chart)              chart   drill-through
  Benefits & Coverage             6       6
  Billing & Payments              3       0   ✗
  Enrollment & Eligibility        3       4   ✗
  Claims                          1       0   ✗
bySentiment                    10 / 3  10 / 3     agrees
byOutcome                      10 / 3  10 / 3     agrees
byLob                          12 / 1  12 / 1     agrees
```

Three of the six charts happen to agree, and it is worth being precise about why that is not
reassuring: they agree because on thirteen short synthetic transcripts two independent agents
reached the same conclusion, not because anything made them. `byReason` — the chart with the most
label choices to get wrong — is where the coincidence runs out.

> A note on reproducing this: if you did Exercise 4 and have not run its reset, `byOutcome` will
> mismatch too, because you changed what the labeler applies without changing what the ask agent
> generates. That is the same defect from the other end, and it is a fair demonstration of how
> easily the two drift — but the table above is the state of an untouched deployment.

**Cause.** `lib/aggregate.ts` computes every number on the dashboard — KPI rates, `byReason`,
`bySentiment`, `byOutcome`, `byLob`, the cross-sell funnel — from each call's **`call_metrics`**,
written by the `call-insights` **ask** agent:

```ts
complaintRate: count((m) => m.complaint) / n,
byReason: tally(metrics.map((m) => m.call_reason)),
```

`app/page.tsx` builds every drill-through as a **label** filter, written by the `resource-labeler`
**labeler** agent:

```ts
href={lc("disposition_flags", "Complaint Raised", scope)}
```

Two independent data-augmentation agents read the same transcript and answer the same question
separately. Nothing in the product reconciles them, and nothing ever could — a generative
classification and a generative labelling of the same call are simply two opinions. The number and
the list it links to have **no shared source**, so they agree only by coincidence.
(`sentiment/Negative` in step 3 agreed by coincidence. That is why the exercise asked you to check
the others.)

**The fix, and what you would have to prove.** `GET /api/v1/calls` already accepts `complaint`,
`fcr` and `escalated` boolean parameters that filter on the metrics — the same source the tiles
count:

```
complaint=true   -> 3     (tile: 3 of 13)  ✔
fcr=true         -> 10    (tile: 10 of 13) ✔
escalated=true   -> 0     (tile: 0 of 13)  ✔
```

Exact agreement. So the three metric tiles should link to `/calls?complaint=true{scope}`,
`?fcr=true{scope}` and `?escalated=true{scope}` instead of to `disposition_flags` labels — a change
of three `href`s in `app/page.tsx`.

The charts are harder and the right answer is a product decision, not a patch: `byReason` and
`byOutcome` have **no** metrics-based filter parameter, so either the calls list gains one
(`metric_reason=`…), or the charts are recomputed from labels so that chart and filter share a
source, or the dashboard states which of the two agents it is reporting. Whichever is chosen, what
you would have to prove before calling it fixed is one property, stated once and tested:

> **Every clickable number on the dashboard and the list it navigates to are produced by the same
> query over the same field.**

That is a test, not a code review — a contract test that walks every drill-through link the
dashboard renders, follows it, and asserts the returned `total` equals the number on the tile. It
would have caught this on the day the drill-throughs were added, and it is the deliverable worth
proposing alongside the three-line fix.

This is recorded in the lab's *Known defects and gaps* and reported to the product owner.
