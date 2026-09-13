# Exercise 7 — Scope the dashboard by date, follow a drill-through into a saved view

**Time:** 20 minutes. **Difficulty:** core. **Needs:** nothing beyond a running deployment.

## Why this exercise exists

A dashboard number that cannot be clicked is a poster. This exercise follows one question all the
way through the product — *"which calls are behind that?"* — across the three mechanisms that make
it work: the dashboard's date window, the drill-through that carries that window onto the calls
table as a URL, and the saved view that turns the URL into something a team shares.

It also asks you to check the answer, which is how the first run of this lab found the defect that
Task 9 now walks you through the fix for.

## The three mechanisms

- **The window.** `GET /api/v1/dashboard` takes `range` (`7d`, `30d`, `90d`, `12m`, `all`) or an
  explicit `from`/`to` pair of ISO instants. It resolves whichever you gave it into a concrete
  window and reports it back as `window: { range, from, to, excluded }`.
- **The drill-through.** Every stat tile, chart bar, donut segment and rollup row on `/` is a link
  to `/calls?…`, built from a filter **plus the resolved window** — `from`/`to` instants, never the
  preset name. So the table is scoped to the same calls the number was computed over. The filter is
  not written at the tile: `lib/drilldown.ts` declares each figure *together with* the filter that
  reproduces it, and `app/page.tsx` asks it for the href. Task 9 is about why.
- **The saved view.** `POST /api/v1/views` stores a *name for a query string*. Views are
  server-side and shared across the deployment; columns and row density are not (`localStorage`,
  per browser). That split is **D-CA-39**: a view is a shared definition of a work queue, furniture
  is not.

## Steps

```bash
B=http://localhost:3000
```

**1. Scope the dashboard and watch the window resolve.**

```bash
for r in all 12m 90d 30d; do
  curl -s "$B/api/v1/dashboard?range=$r" | python3 -c "
import json,sys
d=json.load(sys.stdin); w=d.get('window',{})
print('range=%-4s total=%-3d excluded=%-3s from=%s' % ('$r', d['total'], w.get('excluded'), str(w.get('from'))[:10]))"
done
```

Against the sample corpus you should see the catalogue of 13 narrow to 5 at `90d` and to 0 at
`30d`, with `excluded` accounting for every call that fell outside. `excluded` is why the dashboard
does not send you to the first-run screen when a *window* is empty but the Knowledge Box is not —
an empty window is a filter result, not an empty deployment.

**2. Take the resolved window, not the preset.**

```bash
FROM=$(curl -s "$B/api/v1/dashboard?range=90d" | python3 -c 'import json,sys;print(json.load(sys.stdin)["window"]["from"])')
FE=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$FROM', safe=''))")
echo "$FROM"
```

**3. Follow a drill-through by hand.** The **Sentiment mix** donut's *Negative* segment links to
`/calls?sentiment=Negative` plus the window — `?sentiment=`, the generated metric the donut was
tallied from, **not** `?label=sentiment/Negative`, which is the labeler agent's answer to the same
question. Task 9 is about the difference. Compare unscoped with scoped:

```bash
curl -s "$B/api/v1/calls?sentiment=Negative&page_size=1" \
  | python3 -c 'import json,sys;print("all time:", json.load(sys.stdin)["total"])'
curl -s "$B/api/v1/calls?sentiment=Negative&from=$FE&page_size=1" \
  | python3 -c 'import json,sys;print("90d     :", json.load(sys.stdin)["total"])'
```

While you are here, run the other filter against the same window and note that the two numbers are
not the same:

```bash
curl -s "$B/api/v1/calls?label=sentiment%2FNegative&from=$FE&page_size=1" \
  | python3 -c 'import json,sys;print("90d, by label:", json.load(sys.stdin)["total"])'
```

Both filters are legitimate and the API offers both. Only one of them is what the donut counted.

The scoped number must equal the donut segment's value for the same window:

```bash
curl -s "$B/api/v1/dashboard?range=90d" \
  | python3 -c 'import json,sys;print("donut   :", [x["value"] for x in json.load(sys.stdin)["bySentiment"] if x["name"]=="Negative"])'
```

**4. Now do it in the product.** Open <http://localhost:3000>, set the range picker to **90 days**,
and click the **Negative** segment of *Sentiment mix*. You land on `/calls` carrying
`?sentiment=Negative` and both ends of the window, with the two date bounds as separate removable
chips — remove the **From** chip and watch the count widen; the chips are the window, made editable.

> **Note what the screen does not do, and check it yourself rather than taking this on trust.**
> The metric filters are honoured by `GET /api/v1/calls` (step 3) but the calls *table* does not yet
> carry them: `CallsWorkspace`'s `query` memo builds its request from an allowlist — `q`, `label`,
> `agent`, `queue`, `media_type`, `lifecycle`, `from`, `to`, `sort`, `order`, `page`, `page_size` —
> that has no `sentiment` in it, `activeFilters` renders no chip for one, and `VIEW_PARAMS`
> (`services/views.ts`, mirrored in `components/calls/view-query.ts`) drops it on save. So the URL is
> right, the API agrees with the dashboard, and the table still shows the window unfiltered. **This
> is open**, and it is a good second contribution after Task 9: the three allowlists and the chip
> row are the whole change, and `test/unit/calls-views.test.ts` already pins the two copies of
> `VIEW_PARAMS` to each other.

**5. Save the question, not the answer.** With the window still applied, pick **Negative** from the
**Sentiment** facet in the filter bar — that is the *label* filter, the one the table and a saved
view can both carry today — then open **Saved views** → **Save view** and name it
`Negative sentiment, last 90 days`. Or do it over the API:

```bash
curl -s -X POST "$B/api/v1/views" -H 'Content-Type: application/json' -d "$(python3 -c "
import json
print(json.dumps({'name':'Negative sentiment, last 90 days',
                  'query':'label=sentiment%2FNegative&from=$FROM&sort=created&order=desc',
                  'description':'Saved from a dashboard drill-through'}))")" | python3 -m json.tool
```

`201`. Note what came back: the `query` has been **re-parsed through an allowlist and
re-normalised**, not stored as you sent it. A saved view is a URL the product will later follow, so
it is validated on the way in.

Note also why this step filters by `label=` rather than by the `sentiment=` the dashboard now links
with. `VIEW_PARAMS` is that allowlist, and it does not carry the metric filters yet — post the same
view with `query: 'sentiment=Negative'` and the `query` you get back is empty. That is the gap from
step 4 seen from the other end, and it is the reason to fix the allowlist rather than the chip row
alone.

**6. Prove it is shared, not yours.** Views live on the server. Read the register with no
credentials at all, and from a different browser profile if you have one open:

```bash
curl -s "$B/api/v1/views" | python3 -c 'import json,sys;[print(v["name"],"|",v["query"]) for v in json.load(sys.stdin)["items"]]'
```

Then contrast: hide the **Duration** column via **Choose columns** on `/calls`, reload — it stays
hidden — and check the URL. The column choice is nowhere in it, and nowhere in the view. Send the
link to a colleague and they get your *question*, with their own furniture.

**7. See the register.** <http://localhost:3000/settings?tab=views> lists every saved view with a
link straight back into the calls table, and deletes them behind a confirmation that states the
consequence (*"disappears for everyone"*).

**8. Clean up.**

```bash
for id in $(curl -s "$B/api/v1/views" | python3 -c 'import json,sys;[print(v["id"]) for v in json.load(sys.stdin)["items"]]'); do
  curl -s -o /dev/null -X DELETE "$B/api/v1/views/$id"
done
```

## Acceptance criteria

- You can show the dashboard's `total` and `window.excluded` changing with `range`, and the two
  summing to the full catalogue.
- For `Negative` in a 90-day window, the donut segment's value and
  `GET /api/v1/calls?sentiment=Negative&from=<window.from>`'s `total` are the **same number** — and
  you can say why `?label=sentiment/Negative` is a different number without either being wrong.
- A view saved from those filters is returned by an unauthenticated `GET /api/v1/views` and
  restores the same filters and the same row count when re-opened.
- You can state which parts of the calls table's state are in the URL, which are on the server, and
  which are in your browser — and why each is where it is.

## Task 9 (10 min) — the mechanism that keeps a number and its list honest

This is the most useful thing in the exercise, because it is the failure mode every "click the
number" dashboard has.

### The defect this replaced

When this lab was first run against the build, every KPI tile disagreed with the list it linked to,
and one disagreed spectacularly: **Cross-sell accepted** read 0 % and drilled through to ten calls.
The cause is worth deriving before you read the fix. The KPI numbers are computed in
`lib/aggregate.ts` from each call's `call_metrics` — written by the `call-insights` **ask** agent.
The drill-through links in `app/page.tsx` filtered on `disposition_flags` **labels** — written by
the `resource-labeler` **labeler** agent. Two independent data-augmentation agents, reading the same
transcript, with nothing in the product reconciling their answers. The number and the list it linked
to had no shared source.

Nothing errored. That is what makes this class of defect expensive: the reader has no way to tell
which of the two numbers is lying, and a figure that contradicts the list behind it is worse than no
link at all.

### Read the fix

```bash
sed -n '1,60p' lib/drilldown.ts
```

Three things to satisfy yourself about, in this order:

1. **A figure and its filter are one object.** `dashboardFigures(d)` returns
   `{ id, label, count, filters }` for every number the dashboard renders as a link, and
   `callsHref(filters, scope)` is the only thing that builds the URL. `app/page.tsx` no longer knows
   how to write a drill-through; it asks. That is what makes "the tile and the link agree" a
   property of one function rather than a habit two files have to keep.
2. **The rates carry their numerators.** `Dashboard.counts` (`lib/aggregate.ts`) holds `fcr`,
   `complaint`, `escalated`, `crossSellOffered` and `crossSellAccepted`. A percentage cannot be
   compared with the length of a list, so without the numerator there is nothing to assert — the
   test would have had to recover it by multiplying and rounding, and would then be checking its own
   arithmetic rather than the product's.
3. **The averages are deliberately excluded.** Compliance and CSAT are means, and a mean has no
   subset of calls behind it, so `SORT_ONLY_TILES` sends those two to the list sorted ascending —
   "show me the worst" — rather than to a filter pretending to explain the number. Notice this is
   the harder half of the design: the discipline is in refusing to link the two tiles that cannot
   honestly be linked.

Then read the guard:

```bash
sed -n '1,20p' test/integration/dashboard-drilldown.test.ts
bunx vitest run test/integration/dashboard-drilldown.test.ts
```

It walks the whole enumeration, asserting each figure's `count` equals the `total` its own link
returns, then re-runs it inside a window that excludes everything, then asserts the distinction the
change turns on: `?call_reason=` and `?label=call_reason/…` are different filters, and the dashboard
must use the first because that is what it counted.

### Now break it on purpose

Nothing here is proven until you have watched the guard fire.

1. In `lib/drilldown.ts`, change the sentiment tally's filter key from `"sentiment"` to
   `"call_reason"` — the kind of copy-paste a tired contributor makes at five o'clock:

   ```ts
   ...fromTally("sentiment", d.bySentiment, "call_reason"),
   ```

2. Re-run the test. It should fail naming the figure, the query it built and both numbers — not
   "expected true to be false". Read the failure message and ask whether it would have told you
   what to fix if you had not just broken it yourself.
3. Put it back (`git checkout lib/drilldown.ts`) and re-run to green.

### Then add one

`d.byLob` (line of business) is already enumerated; `crossSell.offered` and `crossSell.accepted` are
rendered by the funnel and are already covered by an equality assertion rather than by a link. Pick
a number the dashboard shows that `dashboardFigures()` does **not** yet return, add it with the
filter that reproduces it, and run the test. Two useful outcomes: if it passes, you have extended
the guarantee; if it fails, you have just been told that the number you thought you understood is
computed over a different population from the one your filter selects — which is the same defect
this task exists for, caught in ten seconds instead of by a customer.

**Write down what you would need to prove before calling a drill-through fixed.** The answer this
codebase settled on: not "the numbers match today", but "a tile added with the wrong filter cannot
reach main".

### What is still open

The API and the links agree; the **calls table still ignores the metric filters** (see the note in
step 4). Until the three allowlists carry them, a drill-through from a tile lands on a correct URL
that the table under-filters. That is the next contribution, and it is smaller than this one was.
