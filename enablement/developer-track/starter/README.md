# Starter

The repo itself is the starter for this lab — there is no separate scaffold project. Clone
`call-analysis` at branch `mvp`, run `make install && make dev`, and work directly in the real
source tree (`lib/`, `services/`, `app/api/v1/`, `test/`).

This directory holds two small things for **Exercise 1** (`../exercises/01-add-endpoint.md`) only,
so you don't have to remember Next.js' file-based routing convention from scratch:

```
exercise-1-moments/
  app/api/v1/calls/[id]/moments/route.ts   an empty route-handler skeleton
  openapi-fragment.md                       the spec pieces to fill in and paste into lib/openapi.ts
```

## How to use it

1. Copy `exercise-1-moments/app/api/v1/calls/[id]/moments/route.ts` to the real path in the repo:
   ```bash
   mkdir -p app/api/v1/calls/\[id\]/moments
   cp enablement/developer-track/starter/exercise-1-moments/app/api/v1/calls/\[id\]/moments/route.ts \
      app/api/v1/calls/\[id\]/moments/route.ts
   ```
2. Fill in the `TODO`s in that file (it will not compile until you add the spec entry and the
   service function it calls).
3. Open `openapi-fragment.md` and merge its two pieces (`CallMoments` schema and the path entry)
   into `lib/openapi.ts` where indicated.
4. Add the service function and the contract test yourself — the exercise deliberately does not
   scaffold those two, since writing them is most of the learning value.

If you get stuck, the full worked solution — every file, complete — is in
[`../solutions/01-add-endpoint.md`](../solutions/01-add-endpoint.md).

Exercises 2 and 3 need no scaffolding: they are edits to existing files
(`lib/domain/taxonomy.ts`) and operational steps against the running app (cache
invalidation via the admin panel or `curl`), not new files.
