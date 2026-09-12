import { defineConfig } from "@playwright/test";

// A fixed, product-specific port so a sibling product's Playwright run never shares this web
// server (that collision caused a spurious showcase failure before platform 0.1.4).
const port = Number(process.env.PW_PORT ?? 3241);
const showcase = Boolean(process.env.SHOWCASE);

export default defineConfig({
  testDir: showcase ? "showcase" : "test/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PW_CHANNEL ?? (process.env.CI ? undefined : "chrome"),
    video: showcase ? { mode: "on", size: { width: 1440, height: 900 } } : "retain-on-failure",
    screenshot: showcase ? "off" : "only-on-failure",
    viewport: showcase ? { width: 1440, height: 900 } : { width: 1280, height: 860 },
  },
  outputDir: showcase ? "showcase/out" : "test-results",
  webServer: {
    command:
      // Rate limits are raised for the test run only: Next route handlers cannot see the socket
      // address, so with no proxy header every local request shares one bucket.
      // Hermetic environment. `ENV_FILE=/dev/null` stops the platform's own .env loader, but
      // Next.js loads .env/.env.local itself before any product code runs and only skips keys that
      // are already defined — so the ARAG variables are explicitly blanked here. Without this a
      // developer's live Knowledge Box credentials would sit in the test server's environment.
      `ENV_FILE=/dev/null ARAG_KB_ID= ARAG_API_KEY= ARAG_BASE_URL= ARAG_BASE= ` +
      `ARAG_MOCK=1 ADMIN_TOKEN=e2e-admin-token DATA_DIR=./data/e2e NODE_ENV=production ` +
      `RATE_LIMIT_RPS=200 RATE_LIMIT_BURST=1000 CALLS_MOCK_STREAM_DELAY_MS=${showcase ? 45 : 0} ` +
      `PORT=${port} node node_modules/next/dist/bin/next start -p ${port}`,
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
