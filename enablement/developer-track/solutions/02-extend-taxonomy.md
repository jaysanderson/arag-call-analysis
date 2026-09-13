# Solution — Exercise 2: extend the taxonomy the product ships

## The code change

One entry appended to `RESOURCE_LABELSETS` in `lib/domain/taxonomy.ts`, immediately before the
array's closing `];`:

```ts
  {
    id: "resolution_path",
    title: "Resolution Path",
    color: "#7c3aed",
    multiple: false,
    kind: "RESOURCES",
    labels: [
      {
        label: "Self-service Restored",
        description:
          "The agent walked the member through the portal, the app, a password reset or a login so they could do it themselves.",
      },
      {
        label: "Agent Action",
        description:
          "The agent made the change on the member's behalf during the call: autopay, enrolment, a form or an update.",
      },
      {
        label: "Referred Onward",
        description:
          "The agent referred the member to a supervisor, a specialist team, a provider or a pharmacy to finish the job.",
      },
    ],
  },
```

That is the entire diff. Nothing else in the repo names a labelset by id, counts them, or indexes
into the array:

- `ALL_LABELSETS` is `[...RESOURCE_LABELSETS, PARAGRAPH_LABELSET]`.
- `labelOps(RESOURCE_LABELSETS)` builds the `resource-labeler` agent's `operations` by iterating.
- `seedTaxonomy()` iterates `ALL_LABELSETS`.
- `services/labelsets.ts`'s `FACET_ORDER` affects order only; an unlisted id is appended.

## What was actually observed

Run while writing this solution, against the in-process sample Knowledge Box.

**Step 2 — the running deployment, whose store was already seeded:**

```
id                     shipped  defined  provisioned
call_reason            True     True     True
call_outcome           True     True     True
sentiment              True     True     True
line_of_business       True     True     True
disposition_flags      True     True     True
moment                 True     True     True
resolution_path        False    False    True
```

Read that last row carefully. `provisioned: true`, `defined: false`. The Knowledge Box has the
labelset — because in sample mode `startDemoMock()` seeds the mock KB straight from `ALL_LABELSETS`
at boot, and `ALL_LABELSETS` is the source file you just edited. The product's own taxonomy store
does not have it, because `seedTaxonomy()` found its `seeded` marker and returned. `shipped` is
`false` for the same reason: that flag is read off the store document, and there is no store
document.

So the deployment is in a split state: a vocabulary exists upstream that the product has no record
of, and the labeler's `operations` — derived from the **store** — do not include it. Inspecting
`DATA_DIR/taxonomy.json` directly confirms it:

```
['labelset:call_reason', 'labelset:call_outcome', 'labelset:sentiment',
 'labelset:line_of_business', 'labelset:disposition_flags', 'labelset:moment',
 'agent:resource-labeler', 'agent:paragraph-labeler', 'agent:call-insights', 'seeded']
```

In **live** mode the same edit produces no visible effect whatsoever: there is no mock boot seeding,
and `provisionLabelsets()` iterates `labelsetDefs(rt)` — the store.

**Steps 3–4 — restarted against a fresh `DATA_DIR`:**

```
resolution_path        True     True     True
```

and the labeler classified the sample corpus into it:

```
[('Agent Action', 12), ('Self-service Restored', 1)]
```

Twelve of the thirteen sample calls are an agent doing something on the member's behalf, one is a
password reset walked through in the portal, and none were referred onward. That distribution comes
from the real `resource-labeler` agent reading the real `description` strings you wrote — the
descriptions *are* the instruction, which is the point Exercise 4 develops.

## Step 6 — crossing the seam on purpose

```
DELETE /api/v1/labelsets/resolution_path       → 204
POST   /api/v1/admin/reseed                    → 200
  {"added": ["resolution_path"], "skipped": ["call_reason", "call_outcome", "sentiment",
                                             "line_of_business", "disposition_flags", "moment"]}
POST   /api/v1/admin/reseed  (again)           → {"added": [], "skipped": [ …all seven… ]}
```

`reseedMissing()` in `services/taxonomy-store.ts` is eight lines and worth reading in full, because
the whole design is in what it does *not* do: it iterates `ALL_LABELSETS`, and for each one either
records it in `skipped` (the store has it — leave it entirely alone, whatever it now says) or writes
it and records it in `added`. There is no merge, no diff, no "newer wins". An operator's edit is
never overwritten because the code has no branch that could overwrite it.

The behaviour to be honest about is the one the integration test names in its own assertion
comment: a shipped labelset the operator **deleted** is added back, "because that is what was asked
for". The thing that protects a deliberate deletion is not `reseedMissing` — it is that seeding
happens once and this endpoint only runs when a person calls it. Automatic re-seeding on boot would
have been the easy fix and the wrong one.

## Answer to the question

> A partner forks this product for utility-company calls, rewrites `lib/domain/taxonomy.ts`
> wholesale, and redeploys to a cluster that has been running six months with a persistent
> `DATA_DIR`. What do their users see?

**On the redeploy alone: the old health-insurance taxonomy, unchanged.** The store was seeded on
that cluster's first boot in month one, `seedTaxonomy()` returns at its `seeded` guard on every
subsequent read, and deploying new source does not move the store. Their calls keep being classified
into *Claims*, *Benefits & Coverage* and *Prior Authorization*. In sample/mock mode they would get
the confusing half-state above instead, which is arguably worse because it looks like something
happened.

What the release notes have to say, now that there is a supported path:

1. **Re-seed** — `POST /api/v1/admin/reseed` brings across every labelset the rewrite *added*, and
   leaves every labelset the operator holds exactly as it is.
2. **Migrate what the re-seed cannot see** — a labelset the rewrite *changed* is neither missing nor
   restorable, so it needs `PUT /api/v1/labelsets/{id}` per labelset; an obsolete one needs
   `DELETE /api/v1/labelsets/{id}?knowledge_box=true`. This is the step that stays manual, and the
   reason is worth stating to the partner: the product cannot distinguish a definition their
   operator customised from one the partner has since revised, so overwriting silently is precisely
   the failure the seam exists to prevent.
3. **Re-run the labeler.** Neither a re-seed nor a reset re-classifies anything. Every call already
   analysed keeps its old labels until the labeler runs again — which is Exercise 4.

And the per-labelset undo that used to be missing: `POST /api/v1/labelsets/{id}/reset` restores one
shipped labelset and re-provisions it in the same request, matching the
`DELETE /api/v1/settings/{section}` pattern every settings section already had. Only shipped
labelsets can be reset — a partner's own vocabulary has nothing to go back to, and gets a `404`.

Both of these were reported from this lab's first run as gaps and have since been built; the lab's
*Known defects and gaps* section records what each fix was.
