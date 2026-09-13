# Starter

The repo itself is the starter for this lab — there is no separate scaffold project. Clone
`call-analysis` at branch `mvp`, run `make install`, start the deployment in sample mode as
[`../LAB.md`](../LAB.md) §0 describes, and work directly in the real source tree (`lib/`,
`services/`, `app/api/v1/`, `test/`).

This directory holds two small things, for **Exercise 1** only
([`../exercises/01-add-endpoint.md`](../exercises/01-add-endpoint.md)), so you do not have to
remember Next.js' file-based routing convention from scratch:

```
exercise-1-moments/
  app/api/v1/calls/[id]/moments/route.ts   an empty route-handler skeleton
  openapi-fragment.md                      the spec pieces to fill in and paste into lib/openapi.ts
```

## How to use it

1. Copy the skeleton to its real path in the repo:
   ```bash
   mkdir -p app/api/v1/calls/\[id\]/moments
   cp enablement/developer-track/starter/exercise-1-moments/app/api/v1/calls/\[id\]/moments/route.ts \
      app/api/v1/calls/\[id\]/moments/route.ts
   ```
2. Fill in the `TODO`s. It will not compile until you have added the spec entry and the service
   function it calls — that is deliberate; the spec comes first in this codebase.
3. Open `openapi-fragment.md` and merge its three pieces (the `CallMoments` schema, the path entry
   and the `API_ROUTES` line) into `lib/openapi.ts` where indicated.
4. Write the service function and the contract test yourself. The exercise does not scaffold those
   two, because writing them is most of the learning value.

Two things worth knowing while you work:

- The skeleton already exports `OPTIONS = preflight`. Every route in this product does
  (`DECISIONS.md` D-CA-14) and **no test catches its absence**, so it is the easiest line to forget.
- The in-product API explorer at <http://localhost:3000/api> reads `/api/v1/openapi.json` at
  runtime. The moment your spec entry exists, your operation appears there at
  `/api?op=getCallMoments` with a parameter table and a working **Send** — which is a faster
  feedback loop than the test suite for checking you named things consistently.

If you get stuck, the full worked solution — every file complete, with the results actually
observed when it was run — is in
[`../solutions/01-add-endpoint.md`](../solutions/01-add-endpoint.md).

## Exercises 2 to 7

No scaffolding. Exercise 2 is one edit to `lib/domain/taxonomy.ts` plus a restart against a clean
`DATA_DIR`; exercises 3 to 7 are `curl` against a running deployment and clicks in the product, and
every command is given inline. Keep the operator token to hand:

```bash
B=http://localhost:3000
T=dev-admin-token
```

Each of those exercises ends with a clean-up block. Exercise 6's is not optional — issuing an API
key closes this deployment's read API to anonymous callers until the key rows are **purged**, so
skipping it will make later exercises fail with `401`s that have nothing to do with what you are
doing. If that happens, the recovery is at the end of
[`../exercises/06-api-keys.md`](../exercises/06-api-keys.md); the blunt alternative is to stop the
server, `rm -rf ./data/lab`, and start again.
