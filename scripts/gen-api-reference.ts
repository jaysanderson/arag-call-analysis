/**
 * Regenerate docs/developer/api-reference.md from the authored OpenAPI document.
 *
 *   node scripts/gen-api-reference.ts
 *
 * No running server is needed: the spec is a plain TypeScript module, so it is imported directly
 * and handed to the platform's converter. Never hand-edit the generated file.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openapi } from "../lib/openapi.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(root, ".next", "openapi.generated.json");
const out = join(root, "docs", "developer", "api-reference.md");

mkdirSync(dirname(tmp), { recursive: true });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(tmp, JSON.stringify(openapi, null, 2));

const res = spawnSync(
  process.execPath,
  [join(root, "vendor", "arag-platform", "scripts", "openapi-to-md.ts"), tmp, out],
  { stdio: "inherit" },
);
process.exit(res.status ?? 1);
