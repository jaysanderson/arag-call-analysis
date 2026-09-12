# OpenAPI fragment for Exercise 1

Merge these two pieces into `lib/openapi.ts`. Do not paste this file itself into the repo — it's a
guide, and it deliberately leaves gaps for you to fill in (marked `_____`).

## 1. Schema

Add this alongside the other schema constants (near `CallParagraph`), and add its name to the
`schemas` map a few lines below:

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

```ts
const schemas: Record<string, unknown> = {
  // ...existing entries...
  CallMoments,
};
```

## 2. Path

Add a new entry to the `paths` object, next to `/api/v1/calls/{id}`:

```ts
"/api/v1/calls/{id}/moments": {
  get: {
    operationId: "_____",              // name it like the others: getCallMoments
    tags: ["Calls"],
    summary: "_____",                  // one line describing what this returns
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } },
    ],
    responses: { 200: jsonResponse(ref("_____"), "_____"), ...problemResponses },
  },
},
```

## 3. Route coverage

Add one line to `API_ROUTES` at the bottom of `lib/openapi.ts`:

```ts
{
  method: "get",
  path: "/api/v1/calls/{id}/moments",
  auth: "none",
  file: "app/api/v1/calls/[id]/moments/route.ts",
},
```

Once all three pieces are in place, `test/contract/openapi.test.ts`'s spec-lint and
spec-vs-implementation tests will tell you exactly what's still missing if you got a name wrong.
