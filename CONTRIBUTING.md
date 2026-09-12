# Contributing to Call Analysis

Thanks for helping. This repo follows the ARAG platform engineering standards
(`vendor/arag-platform` + `STANDARDS.md` in the platform repo).

## Ground rules

- **Never run `npm`.** This repo uses `bun` with exact pins and a committed `bun.lock`.
- **API first.** Add the operation to `lib/openapi.ts` *before* you implement the handler. The
  contract tests fail otherwise (`test/contract/openapi.test.ts`).
- **One service layer.** Route handlers and React server components both call `services/*`; never
  talk to ARAG from a component or a handler directly.
- **Never edit `vendor/arag-platform/`.** Change the platform repo and re-run
  `make sync-platform TARGET=../call-analysis` from there. Work around platform bugs in product
  code and report them.

## Getting started

```bash
make install
make dev          # http://localhost:3000, backed by the in-process mock ARAG
make check        # lint + typecheck + tests with the coverage gate
make e2e          # Playwright
```

No credentials are needed: with no `ARAG_API_KEY` in `.env`, `make dev` starts the mock ARAG
server, seeds it with demo call transcripts and runs the labeler and ask agents over them, so the
dashboard, filters, transcript moments and chat all have real data.

## Adding an endpoint

1. Describe it in `lib/openapi.ts` (`paths`, any new `schemas`, and an entry in `API_ROUTES`).
2. Create `app/api/v1/<path>/route.ts` and wrap the handler in `route({ path, method, auth })` from
   `lib/api.ts` — that gives you validation, auth, rate limiting and problem+json for free.
3. Put the logic in `services/`, not in the handler.
4. Add tests: a unit test for the logic, a case in `test/integration/handlers.test.ts`, and a
   `checkResponse` assertion in `test/contract/openapi.test.ts`.
5. Run `make docs` to regenerate `docs/developer/api-reference.md`.

## Commits and PRs

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`), one logical change per commit. Update
`CHANGELOG.md` in the same PR. The PR template's checklist (spec updated, tests added, docs
updated, security considered) is not decorative.

## Code style

Biome (2 spaces, double quotes, 110 columns) — `make format`. TypeScript strict with
`noUncheckedIndexedAccess`. Comments explain *why*, especially ARAG behaviours learned live.
