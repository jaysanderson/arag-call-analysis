# Exercise 4 — Edit a labelset in the product, re-provision it, re-run the labeler

**Time:** 25 minutes. **Difficulty:** core. **Needs:** the operator token (`dev-admin-token`).

## Why this exercise exists

Exercise 2 changed the taxonomy this product *ships*. This one changes the taxonomy *this
deployment is running* — no source edit, no restart, no redeploy. That distinction is the whole
point of `DECISIONS.md` **D-CA-37**: `lib/domain/taxonomy.ts` seeds `DATA_DIR/taxonomy.json` once,
and from then on the store is the authority. A partner classifying utility calls instead of health
insurance changes their vocabulary here, through the API and the Agents & Taxonomy screen.

You will also see the thing that makes a labelset different from ordinary configuration: **the
label's `description` is the instruction the labeler agent reads.** Changing the words changes what
gets classified. That is not a documentation string — it is the prompt.

## The three steps that are actually three different things

Keep these separate in your head; the exercise fails confusingly if you conflate them.

| Step | What it changes | Endpoint |
|---|---|---|
| 1. Edit the definition | the product's own taxonomy store | `PUT /api/v1/labelsets/{id}` |
| 2. Provision | the Knowledge Box's labelset definition | same request, or `POST /api/v1/labelsets/{id}/provision` |
| 3. Re-run the labeler | the labels actually applied to existing calls | `POST /api/v1/agents/resource-labeler/start` |

Provisioning creates the vocabulary. It does **not** retroactively reclassify anything. Only step 3
does that.

The same three-way split applies to the undo: `POST /api/v1/labelsets/{id}/reset` covers steps 1 and
2 in one request and does **not** cover step 3. You will use it in *Put it back*.

## Task

Rewrite the `Escalated` label in the `call_outcome` labelset so the labeler starts recognising the
escalation calls in the sample corpus, which it currently misses.

## Steps

Set up a shell:

```bash
B=http://localhost:3000
T=dev-admin-token
```

**1. Look at what the labeler does today.** The facet counts on the calls list are the labeler's
output:

```bash
curl -s "$B/api/v1/calls?page_size=1" \
  | python3 -c 'import json,sys;[print(f["label"],f["count"]) for f in json.load(sys.stdin)["facets"] if f["labelset"]=="call_outcome"]'
```

You should see `Resolved 10` and `Follow-up Required 3` — and no `Escalated` at all, even though
two of the sample calls have "escalated" in their title. Read one of them and you will see why the
label should apply:

```bash
curl -s "$B/api/v1/calls?page_size=30" \
  | python3 -c 'import json,sys;[print(c["id"],c["title"]) for c in json.load(sys.stdin)["items"] if "escalat" in c["title"].lower()]'
```

**2. Read the current definition.** `GET` on a labelset is open — no token needed:

```bash
curl -s "$B/api/v1/labelsets/call_outcome" > /tmp/outcome.json
python3 -m json.tool < /tmp/outcome.json
```

Note the shape: `{ id, title, color, multiple, kind, labels: [{ label, description }] }`. That is
`LabelsetDefinition` in the spec — open `/api?op=updateLabelset` in the in-product API explorer to
see it rendered from the live document.

**3. Rewrite the `Escalated` description.** The current one is
*"Routed to a supervisor, specialist team, or grievance process."* — words that barely appear in
the transcripts. Replace it with language the calls actually use. Edit `/tmp/outcome.json` so the
`Escalated` entry reads:

```json
{
  "label": "Escalated",
  "description": "The agent is escalating the call to a supervisor, filing a formal complaint, or sending a claims review team a priority case."
}
```

Leave every other label exactly as it is. `PUT` replaces the whole definition, so a label you drop
from the array is a label you have deleted.

**4. Save it. This provisions in the same request.**

```bash
curl -s -X PUT "$B/api/v1/labelsets/call_outcome" \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  --data @/tmp/outcome.json | python3 -m json.tool
```

Expect `200` and a `LabelsetWriteResult`: `{ "labelset": {...}, "provisioned": true }`. If
`provisioned` were `false` you would get a `provisionError` alongside it — the definition saved,
the Knowledge Box write did not. That split is deliberate; a KB outage must not lose your edit.

**5. Re-run the labeler.** Nothing has been reclassified yet.

```bash
curl -s -X POST "$B/api/v1/agents/resource-labeler/start" -H "Authorization: Bearer $T" \
  | python3 -m json.tool
```

Expect `state: "running"` and a `taskId`. Poll until it settles:

```bash
for i in $(seq 1 10); do
  s=$(curl -s "$B/api/v1/agents" | python3 -c 'import json,sys;print([a for a in json.load(sys.stdin)["items"] if a["key"]=="resource-labeler"][0]["state"])')
  echo "$i: $s"; [ "$s" != "running" ] && break; sleep 3
done
```

Against the sample Knowledge Box this completes in seconds. Against a live one it is a real
data-augmentation task, and ARAG allows **one running task per operation type** — starting a second
labeler while one runs returns `422`.

**6. Drop the read cache, then look again.** The labels changed upstream; this process is still
holding summaries from before.

```bash
curl -s -X POST "$B/api/v1/admin/cache/invalidate" \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{}'

curl -s "$B/api/v1/calls?page_size=1" \
  | python3 -c 'import json,sys;[print(f["label"],f["count"]) for f in json.load(sys.stdin)["facets"] if f["labelset"]=="call_outcome"]'
```

**7. See it in the product.** Open <http://localhost:3000/calls>, use the **Outcome** facet, and
pick **Escalated**. Then open <http://localhost:3000/taxonomy> — the `call_outcome` row now reads
**Customised** rather than shipped, and **View labels & usage** shows a per-label call count.

## Put it back

The undo is one request — you do not have to know what the original said:

```bash
curl -s -X POST "$B/api/v1/labelsets/call_outcome/reset" \
  -H "Authorization: Bearer $T" | python3 -m json.tool
```

`200`, and the same `LabelsetWriteResult` shape as the `PUT`: the shipped definition is back in the
store **and** re-provisioned to the Knowledge Box in the one request. Check the description came
back:

```bash
curl -s "$B/api/v1/labelsets/call_outcome" \
  | python3 -c 'import json,sys;[print(l["description"]) for l in json.load(sys.stdin)["labels"] if l["label"]=="Escalated"]'
```

Then steps 3 and 5 of the table, which the reset deliberately does **not** do for you — nothing is
reclassified until the labeler runs again:

```bash
curl -s -X POST "$B/api/v1/agents/resource-labeler/start" -H "Authorization: Bearer $T" > /dev/null
sleep 3
curl -s -X POST "$B/api/v1/admin/cache/invalidate" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{}' > /dev/null
```

The facet counts should return to `Resolved 10` / `Follow-up Required 3`.

In the product the same thing is the **Reset to the shipped definition** row action in Agents &
Taxonomy (`components/taxonomy/TaxonomyView.tsx`), behind a confirmation that says what it will and
will not touch.

## Acceptance criteria

- `PUT /api/v1/labelsets/call_outcome` returns `200` with `"provisioned": true`.
- After the labeler run and a cache invalidation, `GET /api/v1/calls`'s `call_outcome` facet
  contains `Escalated` with a non-zero count, and both calls with "escalated" in the title are in
  `GET /api/v1/calls?label=call_outcome%2FEscalated`.
- `GET /api/v1/admin/audit` contains a `labelset.update` entry and an `agent.start` entry, both
  with `actor: "operator"` — and a `labelset.reset` entry once you have put it back.
- You can state, without looking, which of the three steps creates the vocabulary and which one
  applies it.

## Questions to answer

1. You changed one label's `description` and the counts for a *different* label moved too. Why?
   (`call_outcome` is `multiple: false` — every call gets exactly one. Winning a call for
   `Escalated` necessarily takes it from whatever held it before.)
2. `Escalated` picked up more calls than the two with "escalated" in the title. Is that a bug in
   the exercise, in the product, or in the label? What would you change to tighten it, and how
   would you know you had?
3. Why does `PUT /api/v1/labelsets/{id}` ignore an `id` in the request body and always use the one
   in the path? (D-CA-37: a rename would orphan every label already applied to analysed calls.)
4. `DELETE /api/v1/labelsets/{id}` takes `?knowledge_box=true`, defaulting to `false`. What is the
   difference between the two, and which one is destructive to *data* rather than to
   *configuration*?

## What you should have noticed

Three things worth carrying out of this exercise:

- **The reset exists because every other configurable section had one.** `DELETE
  /api/v1/settings/{section}` restores the environment defaults for branding, connection, limits and
  retention; a labelset had no equivalent when this lab was first run, and the way back from an edit
  was retyping the original from memory or deleting `DATA_DIR/taxonomy.json` and discarding *every*
  customisation with it. `restoreLabelset()` already existed in `services/taxonomy-store.ts` and was
  unit-tested — the gap was a route and a button, which is a good reminder that "the logic is
  there" and "the operator can reach it" are different claims. `POST /api/v1/labelsets/{id}/reset`
  and the Agents & Taxonomy row action closed it.

  Read the route (`app/api/v1/labelsets/[id]/reset/route.ts`) and notice two decisions. It is
  `auth: "write"`, not `"admin"`, because editing the vocabulary is the product's job rather than an
  administrator's privilege (**D-CA-42**) — the same mode as the `PUT` it undoes. And it re-provisions
  in the same request, with the same split-failure handling as the `PUT`: if the Knowledge Box write
  fails you get `provisioned: false` and a `provisionError`, and the store still moved. An undo that
  can half-fail must say so.

- **Only shipped labelsets can be reset.** A labelset you created with `POST /api/v1/labelsets` has
  nothing to go back to, so `POST /api/v1/labelsets/{id}/reset` returns `404` for it. Try it — the
  distinction between "this deployment's vocabulary" and "the product's vocabulary" is the same seam
  Exercise 2 is about, seen from the undo side.

- **The description is a prompt.** If that makes you want a way to test a wording change before it
  touches 8,000 analysed calls, you have found the right question to ask about this product — **and
  it is still open.** A reset makes an edit reversible; it does nothing to make one rehearsable.
  There is no evaluation set and no diff of which calls changed label, so an operator still finds
  out what an edit did by re-running the labeler and looking. See
  `enablement/architect-track/WORKSHOP.md` §4.
