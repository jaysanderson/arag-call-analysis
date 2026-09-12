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
import { route } from "@/lib/api";
import { momentsOf } from "@/services/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/calls/{id}/moments", method: "get" }, (ctx) =>
  momentsOf(ctx.rt, ctx.params.id!),
);
```

This is the same three-line shape as `app/api/v1/calls/[id]/route.ts`'s `GET` export — `route()`
already validated `ctx.params.id` against the spec's path-parameter schema (`maxLength: 64`)
before your handler runs.

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
make check      # lint + typecheck + vitest run --coverage (includes the new contract test)
make dev        # in another terminal
curl -s "http://localhost:3000/api/v1/calls/$(curl -s 'http://localhost:3000/api/v1/calls?page_size=1' | python3 -c 'import json,sys;print(json.load(sys.stdin)["items"][0]["id"])')/moments"
```

Expected: `make check` is green, and the `curl` prints
`{"id":"...","paragraphs":[{"index":0,"moments":[...]}, ...]}`.
