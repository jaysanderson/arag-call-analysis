# Exercise 2 — Extend the taxonomy

**Time:** 15 minutes. **Difficulty:** core.

## Task

The label taxonomy — the labelsets a call gets classified into, and the moment labels a paragraph
gets tagged with — lives entirely in `lib/domain/taxonomy.ts`. It is not configuration read from
ARAG; ARAG's labelsets are *provisioned from* this file (`services/labelsets.ts`,
`provisionLabelsets()`), and the `resource-labeler` / `paragraph-labeler` data-augmentation agents
are built from the same definitions (`labelOps()`).

Pick one:

- **(A) Add a label** to the existing `disposition_flags` labelset (it's `multiple: true`, so
  adding one more flag is additive and safe): e.g. `{ label: "Language Barrier", description:
  "The call involved a language barrier or required an interpreter." }`.
- **(B) Add a whole new resource-level labelset**, following the shape of `line_of_business`:
  `{ id, title, color, multiple: false, kind: "RESOURCES", labels: [...] }`, and add it to
  `RESOURCE_LABELSETS`.

Either way, the labelset must be re-provisioned before it exists in the running Knowledge Box, and
you need to re-run the `resource-labeler` agent (or wait for new calls to be classified) before any
*existing* call actually carries the new label — provisioning creates the labelset definition, it
does not retroactively re-label calls.

## Steps

1. Edit `lib/domain/taxonomy.ts`.
2. Restart `make dev` (env/module state for the mock is process-wide — a full restart is the
   reliable way to pick up a taxonomy change in this exercise, since the mock seeds and augments
   once at boot).
3. Re-provision:
   - Admin panel: http://localhost:3000/admin/agents → **Re-provision labelsets + agents**. Leave
     agents on (default) if you chose option A/B and want existing demo calls to pick up the new
     label; this re-runs `resource-labeler` against every seeded call.
   - Or via the API:
     ```bash
     curl -s -X POST http://localhost:3000/api/v1/admin/provision \
       -H "Authorization: Bearer dev-admin-token" -H "Content-Type: application/json" -d '{}'
     ```
     This returns `202` with a job; poll it with `GET /api/v1/jobs/{id}` (from the `Location`
     header or the response body) until `status` is `succeeded`.
4. Confirm:
   ```bash
   curl -s http://localhost:3000/api/v1/labelsets | python3 -m json.tool | grep -A3 -i "your-label-or-labelset"
   ```
5. Open http://localhost:3000/calls and find your label/labelset as a filter facet (resource-level
   labelsets are shown as facets per `FACET_ORDER` in `services/labelsets.ts`; a brand-new
   labelset id not in that list is still shown, appended after the ordered ones).

## Hints

- `services/labelsets.ts`'s `FACET_ORDER` controls display order on `/calls`, not whether a
  labelset shows up at all — don't worry about it unless you want your new facet to appear earlier.
- Provisioning is idempotent (`PUT`-style `putLabelset` per labelset) — re-running it is always
  safe.
- If you only care about the labelset definition existing (not about existing calls being
  reclassified), pass `{"agents": false}` to skip the slower agent restart.
- The mock ARAG runs the taxonomy's agents synchronously at boot (`lib/mock.ts`,
  `startDemoMock()`) — that's why a restart plus a re-provision is enough to see labels change,
  with no live Knowledge Box involved.

## Acceptance criteria

- `GET /api/v1/labelsets` includes your new label (inside `disposition_flags.labels`) or your new
  labelset (as a new entry in `items`).
- The `/calls` page shows it as a selectable filter chip.
- No test regressions: `make check` still passes (there is no test asserting the exact taxonomy
  contents, but `test/unit/services.test.ts` and the contract tests exercise labelsets generically
  and must not break).
