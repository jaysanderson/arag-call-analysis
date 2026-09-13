# Exercise 1 — Add a read endpoint: `GET /api/v1/calls/{id}/moments`

**Time:** 20 minutes. **Difficulty:** core.

## Task

This product's transcript view highlights paragraph-level "moment" labels (Complaint, Cross-sell
Pitch, Resolution, …) written by the `paragraph-labeler` data-augmentation agent
(`lib/domain/taxonomy.ts`, `PARAGRAPH_LABELSET`). `GET /api/v1/calls/{id}` already returns the
full `CallDetail`, including every paragraph's `moments: string[]` — but a caller who only wants
the moment track (say, a lightweight timeline widget) has to fetch the whole transcript to get it.

Add a new, smaller read endpoint:

```
GET /api/v1/calls/{id}/moments
```

Response `200`:

```json
{
  "id": "demo00000000000000000000000002",
  "paragraphs": [
    { "index": 0, "moments": ["Greeting & Verification"] },
    { "index": 1, "moments": [] },
    { "index": 2, "moments": ["Complaint"] }
  ]
}
```

Same 404 behaviour as `GET /api/v1/calls/{id}` for an unknown id (RFC 9457 problem document).

## Files to touch

1. **`lib/openapi.ts`** — add a `CallMoments` schema and a `/api/v1/calls/{id}/moments` path
   entry (`get`), and add the route to `API_ROUTES`.
2. **`services/calls.ts`** — add a `momentsOf(rt, id)` function. Reuse `getCall()` (already
   cached, already throws `notFound("Call")` for an unknown id) rather than fetching the resource
   a second way.
3. **`app/api/v1/calls/[id]/moments/route.ts`** (new file) — the thinnest possible handler:
   `route()` + a call to your service function, plus `export const OPTIONS = preflight;` (every
   route in this product exports the shared CORS preflight handler — `DECISIONS.md` D-CA-14).
4. **`test/contract/openapi.test.ts`** — add one case to the `describe("response validation
   (checkResponse)")` block that fetches your new endpoint and asserts it against the spec with
   `checkResponse`.

Scaffolding for steps 1 and 3 is in
[`../starter/exercise-1-moments/`](../starter/exercise-1-moments/) — copy it into the real repo
paths and fill in the blanks, or write the files from scratch; both are fine.

## Hints

- Look at `app/api/v1/calls/[id]/route.ts` for the shape of a one-line `GET` handler wrapped in
  `route()`.
- Look at how `CallDetail` is defined with `allOf: [ref("CallSummary"), {...}]` for the pattern of
  building a schema from pieces — your `CallMoments` schema doesn't need `allOf`, just a plain
  object schema with `id` and `paragraphs`.
- `CallParagraph.moments` is already `{ type: "array", items: { type: "string" } }` in the spec —
  reuse that shape for the item schema's `moments` property.
- Every operation in this spec spreads `...problemResponses` into its `responses` — copy that
  pattern so the contract test's "documents error responses on every operation" check keeps
  passing.
- `services/calls.ts` already exports `getCall(rt, id): Promise<CallDetail>` — your function should
  call it and re-shape `call.paragraphs`, not re-fetch from `rt.arag`.
- The route handler needs no `auth` field (defaults to `"none"`, same as `GET /api/v1/calls/{id}`).
- Do not forget `export const OPTIONS = preflight;`. **No contract test catches its absence today**
  — the contract tests deliberately ignore `OPTIONS`, since it is a CORS mechanism rather than an
  API operation (D-CA-14), and the one integration case that exercises a preflight covers a single
  route. The convention is enforced by review, which is exactly why it is easy to miss, and this
  remains the **smallest open gap in the repo**: a test that walks `API_ROUTES`, imports each
  handler file and asserts it exports `OPTIONS` would close it in about fifteen lines. That is a
  real contribution if you want one after the exercise.
- The spec currently declares **62 operations across 13 tags**; yours makes 63. The in-product API
  explorer at <http://localhost:3000/api> reads `/api/v1/openapi.json` at runtime, so your new
  operation appears there — filterable, deep-linkable at `/api?op=getCallMoments`, and callable
  from the try-it panel — the moment the spec entry exists. That is the fastest way to check your
  work before you write the test (D-CA-41).

## Acceptance criteria

- `make check` passes (lint + typecheck + audit + `vitest run --coverage`, which includes the
  contract test you added).
- `GET /api/v1/openapi.json` declares 63 operations, and `/api?op=getCallMoments` renders yours
  with its parameter table and a working **Send**.
- `curl -s http://localhost:3000/api/v1/calls/<id>/moments` returns `200` with the shape above for
  a real call id, and `404` (`application/problem+json`) for an unknown one.
- `test/contract/openapi.test.ts`'s `"every implemented route is documented"` and `"every
  documented route has a handler file exporting that method"` checks still pass — meaning your
  spec entry, your `API_ROUTES` entry and your route file all agree.
