import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts", "test/contract/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      include: ["lib/**/*.ts", "services/**/*.ts"],
      exclude: ["lib/domain/scenarios.ts", "lib/mock.ts", "lib/openapi.ts", "**/*.d.ts"],
      thresholds: { lines: 80, functions: 70, statements: 80, branches: 70 },
    },
  },
});
