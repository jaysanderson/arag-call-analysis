# Contributing

The full contribution guide lives at the repo root: [`CONTRIBUTING.md`](../../CONTRIBUTING.md) —
ground rules (bun only, API-first, one service layer, never edit `vendor/arag-platform/`), the
"adding an endpoint" checklist, commit/PR conventions, and code style. Read it before opening a
PR; it is not duplicated here.

## Developer-specific notes

- **Start here for setup and commands**: [Local development](local-dev.md) covers the repo layout,
  every `make` target, mock vs live mode, and running the test suite.
- **Adding a route or changing the API surface**: see
  [Extension points](extension-points.md#add-an-endpoint) for the concrete spec-first sequence
  (`lib/openapi.ts` → `app/api/v1/**/route.ts` → `services/*` → tests → `make docs`).
- **Copy-pasteable request/response shapes** for every endpoint, to sanity-check a change against
  real output: [Examples](examples.md).
- **Before opening a PR**, run the same gate CI runs:

  ```bash
  make check   # lint + typecheck + coverage
  make e2e     # Playwright, against a production build
  ```

  Update `CHANGELOG.md` in the same PR (Keep a Changelog format) and fill in the PR template's
  checklist (spec updated, tests added, docs updated, security considered) honestly — it isn't
  decorative.
- **Product decisions** — if a change deviates from an established pattern (a new dependency, a
  different caching strategy, a schema change), record it in [`DECISIONS.md`](../../DECISIONS.md)
  with the `D-CA-nn` numbering already in use there, rather than leaving the reasoning only in a
  commit message.
