# Build your own

[White-labelling](white-label.md) changes how the product *looks*. This page is about changing what
it *does* — adapting Call Analysis to a different domain, taxonomy or workflow, and keeping your
fork mergeable with upstream.

Decide first which of these you need:

| You want to… | Do this | Fork required? |
|---|---|---|
| Ship under your own name and colours | [White-label config](white-label.md) | No |
| Classify calls differently (your own reasons, outcomes, moments) | Edit `lib/domain/taxonomy.ts`, re-provision | Yes, but one file |
| Generate different structured fields | Edit the `call-insights` agent prompts in the same file, adjust `lib/types.ts` and `lib/parse.ts` | Yes |
| Add an endpoint | Spec first, then a handler and a service | Yes |
| Change the demo UI | `app/` + `components/` | Yes |
| Use a different domain entirely (support tickets, sales calls, meetings) | All of the above, plus new demo data | Yes |

## 1. The taxonomy

`lib/domain/taxonomy.ts` is the single source of the domain model:

- `RESOURCE_LABELSETS` — the whole-call facets (`call_reason`, `call_outcome`, `sentiment`,
  `line_of_business`, `disposition_flags`). These become the filter chips in the calls explorer and
  the dashboard groupings.
- `PARAGRAPH_LABELSET` — the per-paragraph "moments" (complaint, cross-sell pitch, resolution…).
  These become the chips under each transcript line and the coloured bars on each call card.
- `AGENTS` — the three data-augmentation tasks: a resource labeler (`on: 1`), a paragraph labeler
  (`on: 0`) and one `ask` task whose two operations write `call_analysis` and `call_metrics`.

To retarget the product at another domain, rewrite the labelsets and the two prompts. A worked
example, moving from health-insurance calls to IT support calls:

```ts
export const RESOURCE_LABELSETS: LabelsetDef[] = [
  {
    id: "call_reason",
    title: "Ticket Category",
    color: "#2563eb",
    multiple: false,
    kind: "RESOURCES",
    labels: [
      { label: "Access & Accounts", description: "Password resets, MFA, licence and permission requests." },
      { label: "Hardware", description: "Laptops, peripherals, phones, physical failures." },
      // …
    ],
  },
  // …
];
```

Then apply it:

```bash
make dev                      # or point at a real Knowledge Box
make provision                # POST /api/v1/admin/provision — labelsets, then agents, in order
```

Provisioning is a job because ARAG allows only one *running* task per operation type, so the three
agents must start sequentially. Watch it in the admin console under **Agents**, or stream
`GET /api/v1/jobs/{id}/events`.

Two constraints worth knowing before you write prompts:

- The `ask` operations emit JSON **as text**, which this app parses server-side; ARAG's native
  data-augmentation JSON-schema output is not available on this platform. Keep the "return ONLY a
  JSON object with exactly these keys" instruction.
- Anything you add to `call_metrics` and want on a chart must also be added to
  `VALID_METRIC_VALUES` in `lib/parse.ts`. Values outside the enum are **dropped, not rendered** —
  a model that answers a metrics question in prose must never become a chart category.

## 2. The view model

If your generated fields change shape:

1. `lib/types.ts` — `CallMetrics` and `CallAnalysis`.
2. `lib/parse.ts` — `sanitizeMetrics` (enum allowlists) and, if you renamed a destination, the
   `readJsonField(res, "call_metrics")` lookups.
3. `lib/aggregate.ts` — the dashboard aggregation; it is pure, so cover it with a unit test.
4. `lib/openapi.ts` — the `CallMetrics` / `CallAnalysis` schemas, so the contract stays honest.
5. `components/AnalysisPanel.tsx` and `components/DashboardCharts.tsx` — the rendering.

## 3. Adding an endpoint

The contract comes first; the contract tests fail otherwise.

1. Describe the operation in `lib/openapi.ts` (`paths`, any new `schemas`) and add a row to
   `API_ROUTES`.
2. Create `app/api/v1/<path>/route.ts` and wrap the handler:

   ```ts
   import { preflight, route } from "@/lib/api";

   export const runtime = "nodejs";
   export const dynamic = "force-dynamic";

   export const GET = route({ path: "/api/v1/calls/{id}/moments", method: "get" }, (ctx) =>
     momentsOf(ctx.rt, ctx.params.id!),
   );

   export const OPTIONS = preflight;
   ```

   `route()` gives you request ids, authentication (`auth: "none" | "api" | "write" | "admin"`),
   rate limiting, OpenAPI request validation, security headers and problem+json errors.
3. Put the logic in `services/`, never in the handler. Server components call the same functions,
   which is why the demo UI and the API can never disagree.
4. Add tests: a unit test for the logic, a case in `test/integration/handlers.test.ts`, and a
   `checkResponse` assertion in `test/contract/openapi.test.ts`.
5. `make docs` regenerates `docs/developer/api-reference.md`.

See [Extension points](extension-points.md) for the adapter internals.

## 4. New demo data

`lib/domain/scenarios.ts` holds the 24 synthetic calls. They are plain objects — a slug, a title,
metadata and an array of `{ speaker, text }` turns — and they feed three things: the mock ARAG
server used by `make dev` and every test, the optional `make gen-media` renderer, and
`make ingest`.

Replace them with your own and the whole demo follows, including the recorded showcase. Keep the
transcripts realistic: the mock's retrieval is term-overlap based, and the agents' labels are only
as good as the signal in the text.

## 5. Staying mergeable with upstream

- **Never edit `vendor/arag-platform/`.** Change the platform repo and re-run
  `make sync-platform TARGET=<your repo>` from it. A local edit is silently overwritten on the next
  sync.
- Keep your changes in the files listed above. `lib/api.ts`, `lib/runtime.ts` and `services/cache.ts`
  are infrastructure; if you find yourself editing them to add a feature, consider whether the
  change belongs upstream instead — the platform team accepts them.
- Record every deviation in your `DECISIONS.md` with the reason. That file is what makes a fork
  reviewable a year later.
- Run `make check` and `make e2e` before you merge upstream changes, and again after.

## 6. Platform sync

```bash
cd ../arag-platform
make sync-platform TARGET=../your-product
cd ../your-product
cp vendor/arag-platform/ui/arag-ui.js public/ui/arag-ui.js   # the UI kit's web components
make check && make e2e
```

`vendor/arag-platform/PLATFORM_VERSION` records the synced version, and the admin **Config** page
shows it at runtime, so an operator can always tell which platform build is deployed.

## 7. Licensing

Apache-2.0. You may fork, modify, rebrand and redistribute, including commercially. Keep the
`LICENSE`, retain the copyright and attribution notices, and state what you changed. Hiding the
in-app "Built on Progress Agentic RAG" credit with `BRAND_POWERED_BY=0` is a presentation choice and
does not alter those obligations.
