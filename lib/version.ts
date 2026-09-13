/**
 * Single source of truth for the product version.
 *
 * It is a plain constant rather than an import of `package.json` so that the OpenAPI module can be
 * loaded by the Node-run CLI scripts (`scripts/gen-api-reference.ts`), which have no bundler to
 * resolve JSON imports. `make check` fails if it drifts from package.json (see the contract tests).
 */
export const APP_VERSION = "0.1.0";

/**
 * The vendored platform version.
 *
 * PLATFORM BUG (arag-platform 0.2.0): `src/index.ts` still exports `PLATFORM_VERSION = "0.1.8"` —
 * the release bumped `package.json` and `PLATFORM_VERSION` (the file `sync-platform.sh` stamps)
 * but not the constant the products import, so every product reports the wrong platform version on
 * its Settings and Admin screens. Read from the stamped file instead, with a contract test pinning
 * the two together. Reported to the Head; delete this when the constant is correct upstream.
 */
export const PLATFORM_VERSION = "0.2.0";
