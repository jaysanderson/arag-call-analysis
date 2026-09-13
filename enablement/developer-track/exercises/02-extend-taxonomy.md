# Exercise 2 — Extend the taxonomy the product *ships*

**Time:** 15 minutes. **Difficulty:** core.

> **This exercise and Exercise 4 look similar and are not.** This one changes the vocabulary a
> **fresh** deployment of this product starts life with — a source change, the thing you do when
> you are building a product for a different industry. Exercise 4 changes the vocabulary **this
> running deployment** uses — an API call, the thing an operator does. Doing them in this order is
> deliberate: you need to understand the seam between them, because it is the single most common
> way people get confused by this codebase.

## The seam

`lib/domain/taxonomy.ts` holds `RESOURCE_LABELSETS`, `PARAGRAPH_LABELSET` and `AGENTS`. Until
`DECISIONS.md` **D-CA-37** that file *was* the taxonomy. It is now the **seed**:

```
lib/domain/taxonomy.ts  ──(first read, once)──▶  DATA_DIR/taxonomy.json  ──▶  the product
```

`seedTaxonomy()` in `services/taxonomy-store.ts` copies the shipped definitions into the store the
first time anything reads it, writes a `seeded` marker, and never runs again. **So editing the
source file has no effect on a deployment whose store already exists.** There is no re-seed
endpoint and no "restore shipped" button.

That is not a bug — it is what stops a redeploy from silently reverting a partner's customisations.
But it does mean this exercise has a prerequisite the old version of it did not: **a clean
`DATA_DIR`**.

## Task

Add a new resource-level labelset, `resolution_path`, to the shipped taxonomy, and prove it reaches
a fresh deployment end to end: defined in the store, provisioned to the Knowledge Box, and actually
applied to calls by the labeler.

## Steps

**1. Edit `lib/domain/taxonomy.ts`.** Add one entry to the `RESOURCE_LABELSETS` array, before the
closing `];`:

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

Nothing else needs touching. `ALL_LABELSETS` is `[...RESOURCE_LABELSETS, PARAGRAPH_LABELSET]`, and
the `resource-labeler` agent's `operations` are built by `labelOps(RESOURCE_LABELSETS)` — the
taxonomy is iterated generically everywhere, so no array length, label name or count is hardcoded
anywhere else.

```bash
bunx biome check lib/domain/taxonomy.ts
bunx tsc --noEmit -p tsconfig.json
```

**2. Watch the running deployment ignore you.** Leave `make dev` running and ask it:

```bash
curl -s http://localhost:3000/api/v1/taxonomy | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("%-22s %-8s %-8s %s" % ("id","shipped","defined","provisioned"))
for l in d["labelsets"]:
    print("%-22s %-8s %-8s %s" % (l["id"], l.get("shipped"), l.get("defined"), l.get("provisioned")))'
```

`resolution_path` is either absent, or — in sample mode, where the mock Knowledge Box is re-seeded
from `ALL_LABELSETS` at boot — present with **`defined: false`**: the Knowledge Box has it, the
product's own taxonomy does not. That split state is exactly what the seam produces, and it is
worth looking at rather than skipping past. In live mode the effect is simpler and starker: nothing
happens at all, because provisioning iterates the *store*.

**3. Start over with a clean store.** Stop the server, point it at a fresh `DATA_DIR`, restart:

```bash
# Ctrl-C the running server first — Next refuses a second dev server in the same directory.
rm -rf ./data/lab
ARAG_MOCK=1 ADMIN_TOKEN=dev-admin-token DATA_DIR=./data/lab make dev
```

**4. Confirm it landed, in all three places.**

```bash
curl -s http://localhost:3000/api/v1/taxonomy | python3 -c '
import json,sys
d=json.load(sys.stdin)
for l in d["labelsets"]:
    if l["id"]=="resolution_path":
        print("shipped",l["shipped"],"| defined",l["defined"],"| provisioned",l["provisioned"])'
```

All three `true`. Then check the labeler actually used it:

```bash
curl -s "http://localhost:3000/api/v1/calls?page_size=1" | python3 -c '
import json,sys
print([(f["label"], f["count"]) for f in json.load(sys.stdin)["facets"] if f["labelset"]=="resolution_path"])'
```

Non-empty — the sample corpus has been classified into your new vocabulary, by the real
`resource-labeler` agent running the real `labelOps()` output, with no credentials involved.

**5. See it in the product.** <http://localhost:3000/calls> now has a **Resolution Path** facet in
the filter bar, and <http://localhost:3000/taxonomy> lists it as a shipped labelset alongside the
other five.

## Put it back

```bash
git checkout -- lib/domain/taxonomy.ts
rm -rf ./data/lab      # the store has your labelset in it; the source no longer does
```

Leaving one without the other gets you back to the split state from step 2 — which, if you want to
understand the seam properly, is worth doing once on purpose.

## Acceptance criteria

- `bunx tsc --noEmit` and `bunx biome check` are clean after the edit.
- On a deployment with a **pre-existing** store, `GET /api/v1/taxonomy` does **not** report
  `resolution_path` as `defined`.
- On a deployment with a **fresh** `DATA_DIR`, the same call reports it `shipped`, `defined` and
  `provisioned`, and `GET /api/v1/calls`'s facets include it with non-zero counts.
- `make check` still passes — no test asserts the taxonomy's exact contents, but every test imports
  the module.

## Hints

- `FACET_ORDER` in `services/labelsets.ts` controls the order facets appear in, not whether they
  appear. An unlisted labelset is appended after the ordered ones.
- `lib/parse.ts`'s `VALID_METRIC_VALUES` is the one place a taxonomy-shaped value *is* hardcoded —
  but it validates the `call_metrics` enums the ask agent generates, not labelsets. Adding a
  labelset needs no change there; adding a new generated metric enum would.
- If you want the new labelset to show up without wiping anything, that is Exercise 4's job: add it
  with `POST /api/v1/labelsets` instead. Same vocabulary, different authority.

## Question

A partner forks this product for utility-company calls. They rewrite `lib/domain/taxonomy.ts`
wholesale and redeploy to a cluster that has been running for six months with a persistent
`DATA_DIR`. What do their users see, and what should the release notes have told them to do?
