# Exercise 7 — Scope the dashboard by date, follow a drill-through into a saved view

**Time:** 20 minutes. **Difficulty:** core. **Needs:** nothing beyond a running deployment.

## Why this exercise exists

A dashboard number that cannot be clicked is a poster. This exercise follows one question all the
way through the product — *"which calls are behind that?"* — across the three mechanisms that make
it work: the dashboard's date window, the drill-through that carries that window onto the calls
table as a URL, and the saved view that turns the URL into something a team shares.

It also asks you to check the answer, which is how you will find the defect at the end.

## The three mechanisms

- **The window.** `GET /api/v1/dashboard` takes `range` (`7d`, `30d`, `90d`, `12m`, `all`) or an
  explicit `from`/`to` pair of ISO instants. It resolves whichever you gave it into a concrete
  window and reports it back as `window: { range, from, to, excluded }`.
- **The drill-through.** Every stat tile, chart bar, donut segment and rollup row on `/` is a link
  to `/calls?…`, built from a filter **plus the resolved window** — `from`/`to` instants, never the
  preset name. So the table is scoped to the same calls the number was computed over.
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
`/calls?label=sentiment/Negative` plus the window. Compare unscoped with scoped:

```bash
curl -s "$B/api/v1/calls?label=sentiment%2FNegative&page_size=1" \
  | python3 -c 'import json,sys;print("all time:", json.load(sys.stdin)["total"])'
curl -s "$B/api/v1/calls?label=sentiment%2FNegative&from=$FE&page_size=1" \
  | python3 -c 'import json,sys;print("90d     :", json.load(sys.stdin)["total"])'
```

The scoped number must equal the donut segment's value for the same window:

```bash
curl -s "$B/api/v1/dashboard?range=90d" \
  | python3 -c 'import json,sys;print("donut   :", [x["value"] for x in json.load(sys.stdin)["bySentiment"] if x["name"]=="Negative"])'
```

**4. Now do it in the product, which is the point.** Open <http://localhost:3000>, set the range
picker to **90 days**, and click the **Negative** segment of *Sentiment mix*. You land on `/calls`
with three removable chips — the sentiment filter and both ends of the window — and a row count
matching the segment. Remove the **From** chip and watch the count widen; the chips are the window,
made editable.

**5. Save the question, not the answer.** With the filters still applied, open **Saved views** →
**Save view**, and name it `Negative sentiment, last 90 days`. Or do it over the API:

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
- For `sentiment/Negative` in a 90-day window, the donut segment's value and
  `GET /api/v1/calls?label=sentiment%2FNegative&from=<window.from>`'s `total` are the **same
  number**.
- A view saved from those filters is returned by an unauthenticated `GET /api/v1/views` and
  restores the same filters and the same row count when re-opened.
- You can state which parts of the calls table's state are in the URL, which are on the server, and
  which are in your browser — and why each is where it is.

## Task 9 (10 min) — check the other tiles, and find the defect

Do not take step 3's agreement as proof the dashboard is consistent. Check the rest:

```bash
curl -s "$B/api/v1/dashboard?range=all" > /tmp/d.json
python3 - <<'PY'
import json, urllib.parse, urllib.request
B = "http://localhost:3000"
d = json.load(open("/tmp/d.json"))
n = d["total"]
print("KPI tile                 number shown   drill-through returns")
for key, label in [("fcrRate", "First-Call Resolution"),
                   ("complaintRate", "Complaint Raised"),
                   ("crossSellAcceptRate", "Cross-sell Accepted")]:
    q = urllib.parse.quote("disposition_flags/" + label, safe="")
    got = json.load(urllib.request.urlopen(f"{B}/api/v1/calls?label={q}&page_size=1"))["total"]
    print("%-24s %-14s %s" % (label, f"{round(d[key]*n)} of {n}", got))
PY
```

Against the sample corpus every row disagrees, and one of them spectacularly: **Cross-sell
accepted** reads 0% and drills through to 10 calls.

**Work out why before reading on.** Then: the KPI numbers are computed in `lib/aggregate.ts` from
each call's `call_metrics` — written by the `call-insights` **ask** agent. The drill-through links
in `app/page.tsx` filter on `disposition_flags` **labels** — written by the `resource-labeler`
**labeler** agent. Two independent data-augmentation agents, reading the same transcript, with
nothing in the product reconciling their answers. The number and the list it links to have no
shared source.

`GET /api/v1/calls` already accepts `complaint`, `fcr` and `escalated` boolean parameters that
filter on the *metrics* — the same source the tiles count:

```bash
for p in complaint=true fcr=true escalated=true; do
  printf "%-16s -> %s\n" "$p" "$(curl -s "$B/api/v1/calls?$p&page_size=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["total"])')"
done
```

Those agree with the tiles exactly. **Write down what you would change, and what you would have to
prove before calling it fixed.** This is reported as a live defect — see the lab's *Known defects*
section — and it is the most useful thing in this exercise, because it is the failure mode every
"click the number" dashboard has: the click and the number have to come from one query, or they
will drift.
