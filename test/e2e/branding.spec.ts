import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * White-label verification: a partner sets BRAND_* variables and the running app carries their
 * identity — name, colour, footer — with the Progress credit hidden.
 *
 * This spec starts its own server rather than using the shared `webServer`, because branding is
 * read once at boot from the environment, which is exactly the property under test.
 */

// Playwright runs from the repo root; `import.meta` is unavailable under the CJS transform that
// PW_DISABLE_TS_ESM=1 selects.
const ROOT = process.cwd();
const NEXT_BIN = resolve(ROOT, "node_modules/next/dist/bin/next");

const BRAND = {
  BRAND_PRODUCT_NAME: "Northwind Call IQ",
  BRAND_TAGLINE: "Conversation intelligence for insurers",
  BRAND_PRIMARY_COLOR: "#7c3aed",
  BRAND_ACCENT_COLOR: "#0ea5e9",
  BRAND_POWERED_BY: "0",
  BRAND_FOOTER_TEXT: "© Northwind Analytics. All rights reserved.",
  BRAND_SUPPORT_URL: "https://support.northwind.example",
};

async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => res(port));
    });
  });
}

let child: ReturnType<typeof spawn> | null = null;
let baseUrl = "";

test.beforeAll(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      // Hermetic, like the shared web server: a developer .env must never reach a test process.
      ENV_FILE: "/dev/null",
      ARAG_KB_ID: "",
      ARAG_API_KEY: "",
      ARAG_BASE_URL: "",
      ARAG_BASE: "",
      ARAG_MOCK: "1",
      NODE_ENV: "production",
      ADMIN_TOKEN: "brand-admin-token",
      DATA_DIR: resolve(ROOT, `data/brand-${port}`),
      LOG_LEVEL: "warn",
      RATE_LIMIT_RPS: "200",
      RATE_LIMIT_BURST: "1000",
      CALLS_MOCK_SEED: "4",
      PORT: String(port),
      ...BRAND,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("white-label server did not start");
});

test.afterAll(async () => {
  child?.kill("SIGTERM");
});

test.describe("white label", () => {
  test("serves the partner identity from GET /api/v1/branding", async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/v1/branding`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      productName: BRAND.BRAND_PRODUCT_NAME,
      tagline: BRAND.BRAND_TAGLINE,
      primaryColor: BRAND.BRAND_PRIMARY_COLOR,
      poweredBy: false,
    });
  });

  test("renders the partner name, tagline, colour and footer, with no Progress credit", async ({ page }) => {
    await page.goto(`${baseUrl}/`);

    // Name and tagline in the sidebar identity block.
    await expect(page.getByTestId("app-sidebar").getByText(BRAND.BRAND_PRODUCT_NAME)).toBeVisible();
    await expect(page.getByText(BRAND.BRAND_TAGLINE)).toBeVisible();

    // The browser tab follows the branding too.
    await expect(page).toHaveTitle(BRAND.BRAND_PRODUCT_NAME);

    // The powered-by band and footer credit are both gone, and with them every trace of the
    // Progress wordmark and of Progress green.
    await expect(page.getByTestId("powered-by-band")).toHaveCount(0);
    await expect(page.getByTestId("powered-by-credit")).toHaveCount(0);
    await expect(page.getByText("Built on Progress Agentic RAG")).toHaveCount(0);
    await expect(page.getByAltText("Progress Agentic RAG")).toHaveCount(0);

    // Footer text and support link come from configuration.
    await expect(page.getByText(BRAND.BRAND_FOOTER_TEXT)).toBeVisible();
    await expect(page.getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      BRAND.BRAND_SUPPORT_URL,
    );

    // The primary colour reaches the Tailwind theme token, so buttons really are re-coloured.
    const brand = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-brand-600").trim(),
    );
    expect(brand.toLowerCase()).toBe(BRAND.BRAND_PRIMARY_COLOR);

    // Hiding the credit must not hide the architecture reveal.
    await expect(page.getByRole("button", { name: "How this works" })).toBeVisible();
  });

  test("the admin console carries the partner identity too", async ({ page }) => {
    await page.goto(`${baseUrl}/admin/login`);
    await page.getByLabel("Admin token").fill("brand-admin-token");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByTestId("admin-nav").getByRole("tab", { name: "Branding" }).click();
    await expect(page.getByRole("heading", { name: "In effect" })).toBeVisible();
    await expect(page.getByText(BRAND.BRAND_PRODUCT_NAME).first()).toBeVisible();
    await expect(page.getByText("hidden")).toBeVisible();
  });
});
