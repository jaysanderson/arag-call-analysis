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
source file has no effect, by itself, on a deployment whose store already exists.**

That is not a bug — it is what stops a redeploy from silently reverting a partner's customisations.
It does mean this exercise has a prerequisite the old version of it did not: **a clean `DATA_DIR`**,
or the explicit crossing you will use in step 6.

There are now two operator-initiated ways across that seam, both deliberately manual, and it is
worth being precise about which does what:

| | What it does | What it will not do |
|---|---|---|
| `POST /api/v1/admin/reseed` | Adds every shipped labelset the store does **not** hold; reports `added` and `skipped` by id | Touch a labelset the store already holds, however it was edited |
| `POST /api/v1/labelsets/{id}/reset` | Puts **one** shipped labelset back to its shipped definition and re-provisions it | Work on a labelset the product does not ship — that is a `404` (Exercise 4) |

Neither runs by itself, and that is the design: automatic re-seeding on every boot would resurrect
a labelset an operator deleted on purpose. Note the corollary honestly — a re-seed *does* bring back
a shipped labelset that was deliberately deleted, because "add the ones that are missing" is exactly
what it was asked to do. The protection is that a person has to ask.

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

**6. Now cross the seam the other way, without wiping anything.** This is the half the exercise
could not do before. Put the store back to a state that does not know about your labelset, and then
ask for it explicitly rather than by restarting:

```bash
curl -s -X DELETE "http://localhost:3000/api/v1/labelsets/resolution_path" \
  -H "Authorization: Bearer dev-admin-token" -o /dev/null -w '%{http_code}\n'   # 204

curl -s -X POST "http://localhost:3000/api/v1/admin/reseed" \
  -H "Authorization: Bearer dev-admin-token" | python3 -m json.tool
```

`added` contains `resolution_path` and nothing else; `skipped` lists the five labelsets the store
already held, untouched. That is the whole contract: a deployment that has been customised for six
months gains what the release added and loses none of what its operator built.

Two things to satisfy yourself about rather than take on trust:

- **An edit survives it.** Change a label description with `PUT /api/v1/labelsets/{id}` (Exercise 4
  does this properly), then re-seed, then read the labelset back. Your wording is still there, and
  the id appears in `skipped`.
- **It is idempotent.** Run it twice. The second `added` is `[]`.

`test/integration/settings-api.test.ts` asserts both, in "re-seeds a deleted shipped labelset
without touching an edited one".

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
- After deleting it and calling `POST /api/v1/admin/reseed`, `added` is `["resolution_path"]` and
  every other labelset appears in `skipped` with its definition unchanged.
- `make check` still passes — no test asserts the taxonomy's exact contents, but every test imports
  the module.

## Hints

- `FACET_ORDER` in `services/labelsets.ts` controls the order facets appear in, not whether they
  appear. An unlisted labelset is appended after the ordered ones.
- `lib/parse.ts`'s `VALID_METRIC_VALUES` is the one place a taxonomy-shaped value *is* hardcoded —
  but it validates the `call_metrics` enums the ask agent generates, not labelsets. Adding a
  labelset needs no change there; adding a new generated metric enum would.
- If you want the new labelset to show up without wiping anything, you have two routes: step 6's
  `POST /api/v1/admin/reseed`, which brings across what the *source* ships, or Exercise 4's
  `POST /api/v1/labelsets`, which adds one this *deployment* owns. Same vocabulary, different
  authority — and the second is not resettable, because there is nothing shipped to reset it to.

## Question

A partner forks this product for utility-company calls. They rewrite `lib/domain/taxonomy.ts`
wholesale and redeploy to a cluster that has been running for six months with a persistent
`DATA_DIR`. What do their users see, and what should the release notes have told them to do?

Then the harder half, which `POST /api/v1/admin/reseed` does **not** answer: their rewrite did not
only *add* labelsets, it *changed* two that already exist. A changed shipped definition is neither
missing (so a re-seed skips it) nor unwanted (so a reset would only undo the operator's own work, if
any). Work out what the partner has to do for those two, and why the product does not do it for
them. *(The shape of the answer: `PUT /api/v1/labelsets/{id}` per changed labelset, and the reason
is that the product cannot tell a definition the operator customised from one the partner has since
revised — overwriting silently is the failure this whole seam exists to prevent.)*
