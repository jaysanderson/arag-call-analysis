/**
 * `scripts/*.ts` run under plain `node` — no bundler, no tsconfig path mapping. Any module they
 * reach therefore may not use a `@/` VALUE import: a type-only import is erased, but a value
 * import resolves at runtime and fails with ERR_MODULE_NOT_FOUND.
 *
 * This was a real regression: adding `import { deriveLifecycle } from "@/lib/lifecycle"` to
 * `lib/parse.ts` broke `make smoke` while every other check stayed green, because the whole test
 * and build estate runs through Next's bundler. The graph is walked here so the next person gets
 * a failing unit test instead of a failing live smoke run.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");

/** Modules the CLI scripts import directly; the walk follows their relative imports from there. */
const SCRIPT_ENTRYPOINTS = ["lib/parse.ts", "lib/aggregate.ts", "lib/openapi.ts", "lib/domain/scenarios.ts"];

/** `import ... from "x"` / `export ... from "x"`, excluding `import type` and `export type`. */
const VALUE_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/g;

function valueImports(file: string): string[] {
  const src = readFileSync(join(ROOT, file), "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(VALUE_IMPORT)) {
    // `import { type A, b } from "x"` is still a value import; `import type { A } from "x"` is not.
    out.push(m[1]!);
  }
  return out;
}

/** Every local module reachable from the entrypoints by following relative value imports. */
function reachable(): string[] {
  const seen = new Set<string>();
  const queue = [...SCRIPT_ENTRYPOINTS];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of valueImports(file)) {
      if (!spec.startsWith(".")) continue;
      const target = relative(ROOT, resolve(ROOT, dirname(file), spec));
      // The vendored platform is imported by path and is out of scope for this rule.
      if (target.startsWith("vendor/")) continue;
      queue.push(target.endsWith(".ts") ? target : `${target}.ts`);
    }
  }
  return [...seen];
}

describe("modules the CLI scripts load", () => {
  it("never use a `@/` value import", () => {
    const offenders: string[] = [];
    for (const file of reachable()) {
      for (const spec of valueImports(file)) {
        if (spec.startsWith("@/")) offenders.push(`${file} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("covers the modules `scripts/*.ts` actually import", () => {
    // If a script starts importing something new, this list has to grow with it.
    const files = reachable();
    expect(files).toContain("lib/parse.ts");
    expect(files).toContain("lib/lifecycle.ts");
    expect(files.length).toBeGreaterThanOrEqual(SCRIPT_ENTRYPOINTS.length);
  });
});
