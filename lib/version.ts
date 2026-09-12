/**
 * Single source of truth for the product version.
 *
 * It is a plain constant rather than an import of `package.json` so that the OpenAPI module can be
 * loaded by the Node-run CLI scripts (`scripts/gen-api-reference.ts`), which have no bundler to
 * resolve JSON imports. `make check` fails if it drifts from package.json (see the contract tests).
 */
export const APP_VERSION = "0.1.0";
