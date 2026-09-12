import { expect, test } from "@playwright/test";

/** Admin panel: the token gate, the Knowledge Box connection test, logs and cache control. */

const ADMIN_TOKEN = "e2e-admin-token";

/** The admin nav, scoped so link names do not collide with the overview tiles. */
function nav(page: import("@playwright/test").Page) {
  return page.getByTestId("admin-nav");
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Admin token").fill(ADMIN_TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible({ timeout: 20_000 });
}

test.describe("admin panel", () => {
  test("refuses the admin API without a token", async ({ request }) => {
    const res = await request.get("/api/v1/admin/health");
    expect(res.status()).toBe(401);
    expect(res.headers()["content-type"]).toContain("problem+json");
  });

  test("shows an error instead of data before sign-in", async ({ page }) => {
    await page.goto("/admin/health");
    await expect(page.getByTestId("admin-error")).toContainText(/Admin token required/, {
      timeout: 20_000,
    });
  });

  test("rejects a wrong token", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Admin token").fill("not-the-token");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("login-error")).toContainText(/Invalid admin token/);
  });

  test("signs in and runs a live Knowledge Box connection test", async ({ page }) => {
    await signIn(page);
    await expect(page.getByText("Knowledge Box reachable")).toBeVisible({ timeout: 20_000 });

    await nav(page).getByRole("link", { name: "Health", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
    await expect(page.getByText("Generative model")).toBeVisible();
    await expect(page.getByText(/^OK · \d+ ms$/)).toBeVisible({ timeout: 20_000 });

    // Re-testing hits the KB again and must still succeed.
    await page.getByRole("button", { name: "Re-test connection" }).click();
    await expect(page.getByText(/^OK · \d+ ms$/)).toBeVisible({ timeout: 20_000 });
  });

  test("config view never exposes the admin token or the service-account key", async ({ page }) => {
    await signIn(page);
    await nav(page).getByRole("link", { name: "Config", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();
    await expect(page.getByText("Environment (redacted)")).toBeVisible();
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).not.toContain(ADMIN_TOKEN);
    expect(bodyText).not.toContain("mock-api-key");
  });

  test("usage counters and the log inspector work", async ({ page }) => {
    await signIn(page);
    await nav(page).getByRole("link", { name: "Usage", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
    await expect(page.getByText("ARAG calls")).toBeVisible();
    await expect(page.getByText("Requests by route")).toBeVisible();

    await nav(page).getByRole("link", { name: "Logs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Records", exact: true })).toBeVisible();
    await page.getByLabel("Contains").fill("http");
    // The access log records every API call, so filtering on "http" must match something.
    await expect(page.getByText(/[1-9]\d* records/)).toBeVisible({ timeout: 20_000 });
  });

  test("agent status lists the three data-augmentation agents", async ({ page }) => {
    await signIn(page);
    await nav(page).getByRole("link", { name: "Agents", exact: true }).click();
    await expect(page.getByText("resource-labeler")).toBeVisible();
    await expect(page.getByText("paragraph-labeler")).toBeVisible();
    await expect(page.getByText("call-insights")).toBeVisible();
  });

  test("cache page reports statistics and invalidates", async ({ page }) => {
    // Warm the cache first so there is something to clear.
    await page.goto("/");
    await signIn(page);
    await nav(page).getByRole("link", { name: "Cache", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cache" })).toBeVisible();
    await expect(page.getByText("Hit rate")).toBeVisible();

    await page.getByRole("button", { name: "Invalidate all" }).click();
    await expect(page.getByText(/Invalidated \d+ entr/)).toBeVisible({ timeout: 15_000 });
  });

  test("job history is inspectable", async ({ page }) => {
    await signIn(page);
    await nav(page).getByRole("link", { name: "Jobs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
    await expect(page.getByText("Recent jobs").or(page.getByText("Nothing to show yet."))).toBeVisible();
  });
});
