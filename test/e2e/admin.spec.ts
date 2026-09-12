import { expect, test } from "@playwright/test";

/** The operator product: the token gate, the connection test, taxonomy, jobs, logs, usage, security. */

const ADMIN_TOKEN = "e2e-admin-token";

/** The operator nav, scoped so link names do not collide with content links. */
function nav(page: import("@playwright/test").Page) {
  return page.getByTestId("admin-nav");
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Admin token").fill(ADMIN_TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("operator product", () => {
  test("refuses the admin API without a token", async ({ request }) => {
    const res = await request.get("/api/v1/admin/health");
    expect(res.status()).toBe(401);
    expect(res.headers()["content-type"]).toContain("problem+json");
  });

  test("shows an explained error instead of data before sign-in", async ({ page }) => {
    await page.goto("/admin/connection");
    const err = page.getByTestId("admin-error");
    await expect(err).toContainText(/not signed in as an operator/, { timeout: 20_000 });
    await expect(err.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("rejects a wrong token", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Admin token").fill("not-the-token");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("login-error")).toContainText(/Invalid admin token/);
  });

  test("lives in the same shell as the product, with its own navigation", async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    for (const label of [
      "Overview",
      "Connection",
      "Taxonomy & Agents",
      "Jobs",
      "Logs",
      "Usage",
      "Branding",
      "Security",
    ]) {
      await expect(nav(page).getByRole("tab", { name: label })).toBeVisible();
    }
  });

  test("signs in and runs a live Knowledge Box connection test", async ({ page }) => {
    await signIn(page);
    await expect(page.getByText("Knowledge Box reachable")).toBeVisible({ timeout: 20_000 });

    await nav(page).getByRole("tab", { name: "Connection" }).click();
    await expect(page.getByRole("heading", { name: "Connection" })).toBeVisible();
    await expect(page.getByText("Generative model")).toBeVisible();
    await expect(page.getByText(/Reachable in \d+ ms/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Re-test connection" }).click();
    await expect(page.getByText(/Reachable in \d+ ms/)).toBeVisible({ timeout: 20_000 });
  });

  test("the configuration view never exposes the admin token or the service-account key", async ({
    page,
  }) => {
    await signIn(page);
    await nav(page).getByRole("tab", { name: "Connection" }).click();
    await page.getByRole("button", { name: "Configuration" }).click();
    await expect(page.getByText("Environment (secrets redacted server-side)")).toBeVisible();
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).not.toContain(ADMIN_TOKEN);
    expect(bodyText).not.toContain("mock-api-key");
  });

  test("the old admin paths still resolve after the restructure", async ({ page }) => {
    await signIn(page);
    for (const [from, heading] of [
      ["/admin/health", "Connection"],
      ["/admin/config", "Connection"],
      ["/admin/agents", "Taxonomy & Agents"],
      ["/admin/cache", "Usage"],
    ] as const) {
      await page.goto(from);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 20_000 });
    }
  });

  test("usage counters, the cache and the log inspector work", async ({ page }) => {
    await signIn(page);
    await nav(page).getByRole("tab", { name: "Usage" }).click();
    await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
    await expect(page.getByText("Knowledge Box calls")).toBeVisible();
    await expect(page.getByText("Requests by route")).toBeVisible();

    await page.getByRole("button", { name: "Cache" }).click();
    await expect(page.getByText("Hit rate")).toBeVisible();
    await page.getByRole("button", { name: "Invalidate everything" }).click();
    await expect(page.getByText(/Invalidated \d+ entr/)).toBeVisible({ timeout: 15_000 });

    await nav(page).getByRole("tab", { name: "Logs" }).click();
    await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
    await page.getByLabel("Contains").fill("http");
    await expect(page.getByText(/[1-9]\d* records/)).toBeVisible({ timeout: 20_000 });
  });

  test("taxonomy reports the labelsets and the three agents with their state", async ({ page }) => {
    await signIn(page);
    await nav(page).getByRole("tab", { name: "Taxonomy & Agents" }).click();
    await expect(page.getByTestId("labelsets-table")).toBeVisible({ timeout: 20_000 });
    await page
      .getByRole("group", { name: "Taxonomy section" })
      .getByRole("button", { name: "Agents" })
      .click();
    const agents = page.getByTestId("agents-table");
    await expect(agents.getByText("resource-labeler")).toBeVisible();
    await expect(agents.getByText("paragraph-labeler")).toBeVisible();
    await expect(agents.getByText("call-insights")).toBeVisible();
  });

  test("security reports the auth posture without exposing any credential", async ({ page }) => {
    await signIn(page);
    await nav(page).getByRole("tab", { name: "Security" }).click();
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: "Operator token" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rate limits" })).toBeVisible();
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).not.toContain(ADMIN_TOKEN);
  });

  test("job history is inspectable", async ({ page }) => {
    await signIn(page);
    await nav(page).getByRole("tab", { name: "Jobs" }).click();
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
    await expect(page.getByText("Recent jobs").or(page.getByText("Nothing to show yet."))).toBeVisible();
  });
});
