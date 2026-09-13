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

## Answer to the question

> A partner forks this product for utility-company calls, rewrites `lib/domain/taxonomy.ts`
> wholesale, and redeploys to a cluster that has been running six months with a persistent
> `DATA_DIR`. What do their users see?

**The old health-insurance taxonomy, unchanged.** The store was seeded on that cluster's first boot
in month one, `seedTaxonomy()` returns at its `seeded` guard on every subsequent read, and there is
no re-seed endpoint. Their calls keep being classified into *Claims*, *Benefits & Coverage* and
*Prior Authorization*. In sample/mock mode they would get the confusing half-state above instead,
which is arguably worse because it looks like something happened.

The release notes needed to say one of three things, and the choice is a real product decision:

1. **Migrate deliberately** — for each new labelset, `POST /api/v1/labelsets`; for each obsolete
   one, `DELETE /api/v1/labelsets/{id}?knowledge_box=true`; then re-provision and re-run the
   labeler. Every call already classified keeps its old labels until that last step. This is the
   only option that preserves the operator's own customisations.
2. **Reset the taxonomy** — delete the labelset rows from `DATA_DIR/taxonomy.json` and restart,
   accepting that any in-product edits the operator made are gone.
3. **Ship it as a new deployment** with its own `DATA_DIR`.

That there is no fourth option — no `POST /api/v1/taxonomy/reseed`, no "restore shipped" — is a gap
worth naming to the product owner rather than working around silently. It is recorded in the lab's
*Known defects and gaps* section.
