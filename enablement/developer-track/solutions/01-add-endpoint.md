# Solution — Exercise 1: `GET /api/v1/calls/{id}/moments`

Four files change. Every symbol used below (`route()`, `ref()`, `jsonResponse()`,
`problemResponses`, `getCall()`, `notFound`, `checkResponse`, `openapi`, `API_ROUTES`) already
exists in this repo — nothing here is invented.

## 1. `lib/openapi.ts`

Add the schema next to `CallParagraph`:

```ts
const CallMoments = {
  type: "object",
  required: ["id", "paragraphs"],
  properties: {
    id: { type: "string" },
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        required: ["index", "moments"],
        properties: {
          index: { type: "integer" },
          moments: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};
```

Register it in the `schemas` map:

```ts
const schemas: Record<string, unknown> = {
  ResourceLabel,
  CallMetrics,
  CallAnalysis,
  CallSummary,
  CallParagraph,
  CallDetail,
  CallMoments, // <-- added
  Datum,
  Dashboard,
  // ...unchanged...
};
```

Add the path, next to `/api/v1/calls/{id}`:

```ts
"/api/v1/calls/{id}/moments": {
  get: {
    operationId: "getCallMoments",
    tags: ["Calls"],
    summary: "Get the paragraph-level moment track for one call",
    description:
      "Lightweight companion to GET /api/v1/calls/{id}: just the paragraph index and its 'moment' labels, without the transcript text.",
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
    responses: { 200: jsonResponse(ref("CallMoments"), "The call's moment track"), ...problemResponses },
  },
},
```

Add the route to `API_ROUTES` (near the other `/calls/{id}/...` entries):

```ts
{
  method: "get",
  path: "/api/v1/calls/{id}/moments",
  auth: "none",
  file: "app/api/v1/calls/[id]/moments/route.ts",
},
```

## 2. `services/calls.ts`

Add near `getCall` (which it reuses — no second ARAG fetch, no second cache key):

```ts
export interface CallMoments {
  id: string;
  paragraphs: { index: number; moments: string[] }[];
}

/** Paragraph-level moment track for one call, without the transcript text. Reuses the cached detail. */
export async function momentsOf(rt: Runtime, id: string): Promise<CallMoments> {
  const call = await getCall(rt, id);
  return {
    id: call.id,
    paragraphs: call.paragraphs.map((p) => ({ index: p.index, moments: p.moments })),
  };
}
```

This inherits `getCall`'s existing behaviour for free: the `detail:{id}` cache entry, and a
`notFound("Call")` (via `getCall`'s own try/catch on `AragError` 404) for an unknown id — there is
nothing extra to write for the 404 case.

## 3. `app/api/v1/calls/[id]/moments/route.ts` (new file)

```ts
import { preflight, route } from "@/lib/api";
import { momentsOf } from "@/services/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/calls/{id}/moments", method: "get" }, (ctx) =>
  momentsOf(ctx.rt, ctx.params.id!),
);

export const OPTIONS = preflight;
```

This is the same shape as `app/api/v1/calls/[id]/route.ts`'s `GET` export — `route()` already
validated `ctx.params.id` against the spec's path-parameter schema (`maxLength: 64`) before your
handler runs. The `OPTIONS` export is the shared CORS preflight handler every route in this product
carries (`DECISIONS.md` D-CA-14); nothing fails without it today, which is precisely why it gets
forgotten.

## 4. `test/contract/openapi.test.ts`

Add one case inside `describe("response validation (checkResponse)")`, next to the existing
`"GET /api/v1/calls/{id}"` test:

```ts
it("GET /api/v1/calls/{id}/moments", async () => {
  const list = await api.get<{ items: Array<{ id: string }> }>("/api/v1/calls?page_size=1");
  const res = await api.get(`/api/v1/calls/${list.json.items[0]!.id}/moments`);
  expect(checkResponse(openapi, "/api/v1/calls/{id}/moments", "get", 200, res.json)).toEqual([]);
});
```

This follows the exact pattern already used for `GET /api/v1/calls/{id}` a few lines above it —
fetch a real id from the list, hit the new endpoint, assert the response validates against the
spec you just wrote.

## Verifying

```bash
bunx biome check .                                # lint
bunx tsc --noEmit -p tsconfig.json                # types
ENV_FILE=/dev/null ARAG_MOCK=1 ARAG_KB_ID= ARAG_API_KEY= ARAG_BASE_URL= ARAG_BASE= \
  bunx vitest run test/contract/openapi.test.ts   # the contract suite, including your new case
make check                                        # the whole gate: lint + types + audit + coverage
```

Then, against a running deployment:

```bash
B=http://localhost:3000
ID=$(curl -s "$B/api/v1/calls?page_size=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["items"][0]["id"])')
curl -s "$B/api/v1/calls/$ID/moments" | python3 -m json.tool | head
curl -s -i "$B/api/v1/calls/does-not-exist/moments" | head -3
```

**This solution was executed against the sample deployment while it was written.** Observed
results, so you know what "correct" looks like:

- `bunx tsc --noEmit` — clean.
- `bunx biome check` on the four changed files — clean.
- `bunx next build` — succeeds, with `/api/v1/calls/[id]/moments` listed as a dynamic route.
- `vitest run test/contract/openapi.test.ts` — **32 passed**, including the new
  `GET /api/v1/calls/{id}/moments` case and, importantly, the `spec ↔ implementation` block: your
  spec entry, your `API_ROUTES` entry and your route file all agree, in both directions.
- The `200`:

  ```json
  {"id":"demo0000000000000000000000000013","paragraphs":[
    {"index":0,"moments":["Cross-sell Pitch"]},
    {"index":1,"moments":["Problem Statement"]},
    {"index":2,"moments":["Cross-sell Pitch"]}]}
  ```

- The `404`:

  ```
  HTTP/1.1 404 Not Found
  {"type":"https://arag.dev/problems/not-found","title":"Not found","status":404,
   "detail":"Call not found","instance":"/api/v1/calls/does-not-exist/moments","requestId":"…"}
  ```

  Note that you wrote no 404 handling at all. `momentsOf()` delegates to `getCall()`, which already
  throws `notFound("Call")`, and `route()` already turns that into a problem document. Reusing the
  cached read rather than fetching a second way is what bought that for free.
