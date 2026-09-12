import { defineConfig } from "@playwright/test";

const port = Number(process.env.PW_PORT ?? 3251);
export default defineConfig({
  testDir: "./test/shots",
  timeout: 300_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PW_CHANNEL ?? "chrome",
    viewport: { width: 1440, height: 900 },
  },
  outputDir: "test-results/shots",
  webServer: {
    command:
      `ENV_FILE=/dev/null ARAG_KB_ID= ARAG_API_KEY= ARAG_BASE_URL= ARAG_BASE= ` +
      `ARAG_MOCK=1 ADMIN_TOKEN=e2e-admin-token DATA_DIR=./data/shots NODE_ENV=production ` +
      `RATE_LIMIT_RPS=200 RATE_LIMIT_BURST=1000 ` +
      `PORT=${port} node node_modules/next/dist/bin/next start -p ${port}`,
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
