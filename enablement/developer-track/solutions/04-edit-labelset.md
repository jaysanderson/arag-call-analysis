# Solution — Exercise 4: edit a labelset, re-provision, re-run the labeler

Everything below was executed against the sample deployment, twice, on two clean `DATA_DIR`s, while
this solution was written. The numbers are what you should see.

## The edit

`PUT /api/v1/labelsets/call_outcome` with the whole definition, `Escalated`'s description replaced:

```json
{
  "id": "call_outcome", "title": "Outcome", "color": "#16a34a",
  "multiple": false, "kind": "RESOURCES",
  "labels": [
    { "label": "Resolved", "description": "Member's issue was fully resolved on this call." },
    { "label": "Follow-up Required", "description": "Resolution pending a callback, document, or future action." },
    { "label": "Escalated", "description": "The agent is escalating the call to a supervisor, filing a formal complaint, or sending a claims review team a priority case." },
    { "label": "Transferred", "description": "Handed to another department without resolution." },
    { "label": "Unresolved", "description": "Call ended without resolving the member's issue." }
  ]
}
```

Response `200`:

```json
{ "labelset": { ... }, "provisioned": true }
```

`PUT` is a **replace**, not a patch. Sending only the changed label would have deleted the other
four.

## The three steps, and what each one did

```
                                       call_outcome facet counts
before anything                        Resolved 10, Follow-up Required 3
after PUT (definition + provisioning)  Resolved 10, Follow-up Required 3   ← unchanged
after POST /agents/resource-labeler/start
   + POST /admin/cache/invalidate      Resolved  7, Escalated 6
```

The middle row is the one people get wrong. The `PUT` updated the product's taxonomy store **and**
wrote the new vocabulary to the Knowledge Box (`"provisioned": true`) — and changed not one label
on not one call. Provisioning creates the vocabulary; only the labeler applies it.

The cache invalidation is not cosmetic either: the labels changed upstream, but this process was
still holding `summary:<id>` entries written before the run. Without it you would watch the old
counts for up to a TTL and conclude the agent had failed.

`POST /api/v1/agents/resource-labeler/start` returned:

```json
{ "key": "resource-labeler", "type": "labeler", "enabled": true,
  "model": "chatgpt-azure-4o", "state": "running", "taskId": "8e733385-…" }
```

and the poll loop reported `completed` on its first iteration against the sample Knowledge Box.
Against a live one this is a real data-augmentation task: it takes minutes, and ARAG permits **one
running task per operation type**, so a second `start` while it runs returns `422`.

Both target calls landed:

```
GET /api/v1/calls?label=call_outcome%2FEscalated  →  total 6, including
  - Claim denial dispute - complaint, escalated
  - Prior authorization denial - MRI, escalated to supervisor
```

The audit trail carried both operator actions:

```
operator  labelset.update  {"id": "call_outcome", "labels": 5}
operator  agent.start      {"agent": "resource-labeler", "taskId": "8e733385-…"}
```

## The reset

```
POST /api/v1/labelsets/call_outcome/reset   → 200
  {"labelset": {"id": "call_outcome", …}, "provisioned": true}
```

One request, and `Escalated`'s description was back to `"Routed to a supervisor, specialist team, or
grievance process."` — restored in the store *and* re-provisioned to the Knowledge Box. After a
labeler run and a cache invalidation the facets returned to exactly
`Resolved 10, Follow-up Required 3`, and the audit trail gained:

```
operator  labelset.reset   {"id": "call_outcome", "labels": 5}
```

Two things this makes concrete, both of which the earlier version of this exercise could only
describe in the negative because the route did not exist:

- **The reset covers the definition and the provisioning, not the labels.** The facet counts do not
  move until the labeler runs again. That is the same three-way split as the edit, and it is why the
  exercise's *Put it back* has three commands rather than one.
- **It only works on shipped labelsets.** `restoreLabelset()` looks the id up in `ALL_LABELSETS` and
  throws `notFound("Shipped labelset")` if it is not there, so resetting a labelset created through
  `POST /api/v1/labelsets` is a `404`. There is nothing to restore a partner's own vocabulary *to*,
  and inventing an empty definition to "reset" it to would be worse than refusing.

## Answers

**1. Why did a different label's count move?**

`call_outcome` is `multiple: false`: every call carries exactly one label from this set. There is
no "add" — a call that now reads `Escalated` was taken from whatever held it before. `Resolved`
went 10 → 7 and `Follow-up Required` 3 → 0, which is where all six `Escalated` calls came from.
A `multiple: true` labelset (like `disposition_flags`) behaves differently, and that difference is
a modelling decision you make per labelset, not a detail.

**2. Six calls, not two — bug or label?**

The label. The description is broad — *escalating*, *supervisor*, *formal complaint*, *claims*,
*review*, *priority* — and four calls that are not escalations use enough of that language to
match. Nothing is wrong with the product or the exercise; you wrote an instruction that over-fires.

To tighten it you would narrow the description to the distinguishing behaviour (a handoff that
leaves the call unfinished) rather than its surrounding vocabulary, re-provision, re-run and
re-count. **How you would know you had fixed it is the harder half**, and the honest answer is that
this product gives you no way to tell beyond eyeballing facet counts: there is no labelled
evaluation set, no way to try a description against a sample before applying it, and no diff of
"which calls changed label and why" after a run. **That gap is still open**, and the reset does not
close it: reversibility is not rehearsal. Knowing you can undo an edit makes it safe to experiment
on thirteen sample calls; it does nothing for an operator who has just re-labelled eight thousand
real ones and has no way to see what moved. For a deployment where the taxonomy is the product, that
is the gap to raise — see `enablement/architect-track/WORKSHOP.md` §4.

**3. Why does the path `id` always win over a body `id`?**

`DECISIONS.md` **D-CA-37**. The labelset id is also the Knowledge Box labelset id, and it is
stamped into every label already applied to every analysed call. Honouring a rename in the body
would leave those labels pointing at a labelset that no longer exists — configuration silently
orphaning data. So the id is immutable after creation, the editor disables the Identifier field,
and the route ignores the body's copy rather than returning a confusing error.

**4. `?knowledge_box=true` — which one destroys data?**

`DELETE /api/v1/labelsets/{id}` (the default, `knowledge_box=false`) removes the labelset from the
product's **vocabulary**: it stops being offered as a facet, stops being provisioned, and the
labeler stops applying it. The labels already written to analysed calls stay in the Knowledge Box,
untouched.

`?knowledge_box=true` additionally deletes the labelset upstream, **taking every label already
applied with it**. That is the destructive one, it is irreversible, and it is why the flag defaults
to `false` and the UI makes it a separate unticked checkbox in the confirmation dialog rather than
folding it into the delete. Configuration and data are not the same thing, and the product declines
to guess which one you meant.
