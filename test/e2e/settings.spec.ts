import { expect, type Page, test } from "@playwright/test";

/**
 * The Settings area: every tab, and — the point of the whole screen — that an edit persists and
 * takes effect.
 *
 * The shape of each editing test is deliberately the same: change a value, save, **reload the
 * page**, assert the value came back, then assert the consequence somewhere the setting is
 * actually used. A test that only asserted the field it just typed into would pass against a form
 * that never wrote anything.
 *
 * Every test restores what it changed. The e2e server keeps one `DATA_DIR` across the whole run
 * (and across reruns), so a test that left the product renamed, the limits lowered or an API key
 * active would change the deployment the rest of the suite is testing — an active key in
 * particular closes the API to anonymous callers.
 */

const ADMIN_TOKEN = "e2e-admin-token";

/**
 * Playwright's `page.request` does not share the browser's cookie jar with the page for a `Secure`
 * cookie on plain http, so set-up calls made through it carry the operator token as a bearer
 * header instead — the same credential `authenticate()` accepts either way.
 */
const AS_OPERATOR = { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } };

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  const token = page.getByLabel("Admin token");
  const submit = page.getByRole("button", { name: "Sign in" });
  // The sign-in button is disabled until React sees a token in its state. A `fill` that lands
  // before hydration sets the DOM value without ever reaching that state, so the button stays
  // disabled for ever; re-filling until it reacts is what makes the helper independent of how
  // long the bundle took to arrive.
  await expect(async () => {
    await token.fill(ADMIN_TOKEN);
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await submit.click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

async function openTab(page: Page, tab: string): Promise<void> {
  await page.goto(`/settings?tab=${tab}`);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Revoke every key that can still authenticate.
 *
 * An active key closes the read API to anonymous callers, so a key left behind by an interrupted
 * run would change what every later test — and every other spec — is testing. Called before the
 * key test rather than only after it, because the run that left one behind is by definition the
 * run that did not reach its own cleanup.
 */
async function revokeAllApiKeys(page: Page): Promise<void> {
  const res = await page.request.get("/api/v1/api-keys", AS_OPERATOR);
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { items: Array<{ id: string; revoked: boolean }> };
  for (const key of body.items.filter((k) => !k.revoked)) {
    await page.request.delete(`/api/v1/api-keys/${key.id}`, AS_OPERATOR);
  }
}

/** Drop every product override, so a failed test cannot poison the ones after it. */
async function resetSection(page: Page, section: string): Promise<void> {
  const res = await page.request.delete(`/api/v1/settings/${section}`, AS_OPERATOR);
  expect(res.ok(), await res.text()).toBeTruthy();
}

test.describe("settings", () => {
  test("every tab is a route of its own, and names the endpoint that fed it", async ({ page }) => {
    await openTab(page, "connection");
    for (const label of [
      "Connection",
      "Branding",
      "Limits",
      "Retention",
      "API keys",
      "Share links",
      "Saved views",
      "Usage",
      "About",
    ]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }

    await page.getByRole("tab", { name: "Limits" }).click();
    await expect(page).toHaveURL(/tab=limits/);
    await expect(page.getByTestId("api-meta")).toContainText("PUT /api/v1/settings/limits");

    await page.getByRole("tab", { name: "Share links" }).click();
    await expect(page).toHaveURL(/tab=shares/);
    await expect(page.getByTestId("api-meta")).toContainText("GET /api/v1/shares");
  });

  test("a viewer who is not an operator sees the values read-only, with a way in", async ({ page }) => {
    await openTab(page, "branding");
    await expect(page.getByTestId("read-only-notice")).toContainText("Sign in as an operator");
    await expect(page.getByTestId("branding-name")).toBeDisabled();
    await expect(page.getByTestId("save-branding")).toHaveCount(0);
    await expect(
      page.getByTestId("read-only-notice").getByRole("link", { name: "Sign in as an operator" }),
    ).toBeVisible();
  });

  test("branding: edit, save, reload, the value persisted and the product is renamed", async ({ page }) => {
    await signIn(page);
    await openTab(page, "branding");
    await expect(page.getByTestId("source-branding")).toContainText("Currently from the environment");

    // The preview is driven by the form, not by the saved state: it moves as you type.
    await page.getByTestId("branding-name").fill("Northwind Call IQ");
    await expect(page.getByTestId("preview-name")).toHaveText("Northwind Call IQ");
    await page.getByTestId("b-accent-text").fill("#0ea5e9");

    await page.getByTestId("save-branding").click();
    await expect(page.getByTestId("source-branding")).toContainText("Overridden in the product");

    await page.reload();
    await expect(page.getByTestId("branding-name")).toHaveValue("Northwind Call IQ");
    await expect(page.getByTestId("b-accent-text")).toHaveValue("#0ea5e9");

    // The effect: the rail identity and the browser tab, both rendered by the layout.
    await expect(page.getByTestId("app-sidebar")).toContainText("Northwind Call IQ");
    await expect(page).toHaveTitle(/Northwind Call IQ/);

    // …and the reset path, back to what the environment says.
    await page.getByTestId("reset-branding").click();
    await expect(page.getByTestId("source-branding")).toContainText("Currently from the environment");
    await page.reload();
    await expect(page.getByTestId("branding-name")).toHaveValue("Call Analysis");
    await expect(page.getByTestId("app-sidebar")).toContainText("Call Analysis");
  });

  test("branding: a rejected value is reported with the API's own words", async ({ page }) => {
    await signIn(page);
    await openTab(page, "branding");
    await page.getByTestId("b-primary-text").fill("definitely-not-a-colour");
    await page.getByTestId("save-branding").click();
    await expect(page.getByRole("status")).toContainText("primaryColor is not a valid CSS colour");
    await resetSection(page, "branding");
  });

  test("limits: edit, save, reload, the value persisted and is the one in force", async ({ page }) => {
    await signIn(page);
    await openTab(page, "limits");
    await expect(page.getByTestId("in-force-question")).toContainText("500 characters");

    await page.getByTestId("limit-question-chars").fill("900");
    await page.getByTestId("limit-upload-mb").fill("64");
    await page.getByTestId("save-limits").click();
    await expect(page.getByTestId("in-force-question")).toContainText("900 characters");

    await page.reload();
    await expect(page.getByTestId("limit-question-chars")).toHaveValue("900");
    await expect(page.getByTestId("in-force-question")).toContainText("900 characters");
    await expect(page.getByTestId("in-force-upload")).toContainText("64 MB");
    await expect(page.getByTestId("source-limits")).toContainText("Overridden in the product");

    // The effect beyond this screen: the API the rest of the product reads agrees.
    const settings = await (await page.request.get("/api/v1/settings")).json();
    expect(settings.limits.maxQuestionChars).toBe(900);
    expect(settings.limits.maxUploadBytes).toBe(64 * 1024 * 1024);

    await page.getByTestId("reset-limits").click();
    await expect(page.getByTestId("in-force-question")).toContainText("500 characters");
    await page.reload();
    await expect(page.getByTestId("limit-question-chars")).toHaveValue("500");
    await expect(page.getByTestId("source-limits")).toContainText("Currently from the environment");
  });

  test("retention: the preview follows the policy, and a purge is typed-confirmed", async ({ page }) => {
    await signIn(page);
    await openTab(page, "retention");

    // 0 days is "no limit", never "delete everything".
    await expect(page.getByTestId("retention-candidates")).toHaveText("0", { timeout: 20_000 });

    await page.getByTestId("retention-days").fill("30");
    await expect(page.getByTestId("retention-candidates")).not.toHaveText("0", { timeout: 20_000 });
    const covered = Number(await page.getByTestId("retention-candidates").innerText());
    expect(covered).toBeGreaterThan(0);

    await page.getByTestId("retention-enabled").check();
    await page.getByTestId("save-retention").click();

    await page.reload();
    await expect(page.getByTestId("retention-days")).toHaveValue("30");
    await expect(page.getByTestId("retention-enabled")).toBeChecked();
    await expect(page.getByTestId("source-retention")).toContainText("Overridden in the product");
    const settings = await (await page.request.get("/api/v1/settings")).json();
    expect(settings.retention).toMatchObject({ days: 30, enabled: true });

    // The purge: a dry run first, then a confirmation that has to be typed. Deliberately
    // cancelled — this suite must not delete the sample calls every other test reads.
    await expect(page.getByTestId("retention-candidates")).toHaveText(String(covered), { timeout: 20_000 });
    await page.getByTestId("purge-start").click();
    const confirm = page.getByTestId("purge-confirm");
    await expect(confirm).toContainText(`permanently delete ${covered} call`);
    await expect(page.getByTestId("purge-confirm-button")).toBeDisabled();
    await page.getByTestId("purge-typed").fill("not the number");
    await expect(page.getByTestId("purge-confirm-button")).toBeDisabled();
    await page.getByTestId("purge-typed").fill(String(covered));
    await expect(page.getByTestId("purge-confirm-button")).toBeEnabled();
    await page.getByTestId("purge-cancel").click();
    await expect(confirm).toHaveCount(0);

    // Nothing was deleted.
    const calls = await (await page.request.get("/api/v1/calls?page_size=1")).json();
    expect(calls.total).toBeGreaterThan(0);

    await page.getByTestId("reset-retention").click();
    await page.reload();
    await expect(page.getByTestId("retention-days")).toHaveValue("0");
    await expect(page.getByTestId("source-retention")).toContainText("Currently from the environment");
  });

  test("api keys: the secret is shown once, the key is listed, and revoking closes it", async ({ page }) => {
    await signIn(page);
    await revokeAllApiKeys(page);
    await openTab(page, "api-keys");

    // Unique per run: the store keeps revoked keys forever (that is the point of revoking rather
    // than deleting), so a fixed name would match two rows on the second run.
    const name = `E2E integration ${Date.now()}`;
    await page.getByTestId("create-key").click();
    await page.getByTestId("new-key-name").fill(name);
    await page.getByTestId("create-key-submit").click();

    const secretBlock = page.getByTestId("secret-value");
    await expect(secretBlock).toBeVisible();
    await expect(page.getByTestId("new-secret")).toContainText("only time this key will ever be shown");
    const secret = (await secretBlock.innerText()).replace(/\s*Copy key\s*$/, "").trim();
    expect(secret).toMatch(/^ca_live_/);

    await page.getByTestId("dismiss-secret").click();
    await expect(page.getByTestId("new-secret")).toHaveCount(0);

    const row = page.getByTestId("api-keys-table").locator("tr", { hasText: name });
    await expect(row).toContainText("Active");
    await expect(row).toContainText("ca_live_");

    // Once only: a reload must not be able to produce the key material again, anywhere.
    await page.reload();
    await expect(page.getByTestId("api-keys-table")).toContainText(name);
    expect(await page.locator("body").innerText()).not.toContain(secret);

    await page
      .getByTestId("api-keys-table")
      .locator("tr", { hasText: name })
      .getByRole("button", { name: "Revoke" })
      .click();
    await expect(page.getByRole("alertdialog")).toContainText("starts receiving 401 immediately");
    await page.getByRole("button", { name: "Revoke the key" }).click();
    await expect(page.getByTestId("api-keys-table").locator("tr", { hasText: name }).first()).toContainText(
      "Revoked",
    );

    // With no active key left, the API is open again — which is how the rest of the suite runs.
    const settings = await (await page.request.get("/api/v1/settings")).json();
    expect(settings.apiKeys.active).toBe(0);
  });

  test("share links: the register lists, filters and revokes", async ({ page }) => {
    await signIn(page);
    const calls = await (await page.request.get("/api/v1/calls?page_size=1")).json();
    const call = calls.items[0];
    expect(call).toBeTruthy();
    // Unique per run: revoked links stay in the register, so a fixed note would match two rows.
    const note = `Settings e2e ${Date.now()}`;
    const created = await page.request.post(`/api/v1/calls/${call.id}/shares`, {
      ...AS_OPERATOR,
      data: { ttlDays: 7, note },
    });
    expect(created.status()).toBe(201);

    await openTab(page, "shares");
    const table = page.getByTestId("shares-table");
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator("tr", { hasText: note });
    await expect(row).toContainText("Active");

    await page.getByRole("button", { name: "Revoked" }).click();
    await expect(page.getByText(note)).toHaveCount(0);
    await page.getByRole("button", { name: "Active" }).click();
    await expect(page.getByText(note)).toBeVisible();

    await page
      .getByTestId("shares-table")
      .locator("tr", { hasText: note })
      .getByTestId("revoke-share")
      .click();
    await expect(page.getByRole("alertdialog")).toContainText("stops being able to open it");
    await page.getByRole("button", { name: "Revoke the link" }).click();
    await expect(page.getByText(note)).toHaveCount(0);

    await page.getByRole("button", { name: "Revoked" }).click();
    await expect(page.getByTestId("shares-table").locator("tr", { hasText: note })).toContainText("Revoked");
  });

  test("saved views: the register links to the call list and deletes", async ({ page }) => {
    await signIn(page);
    const name = `E2E escalations ${Date.now()}`;
    const created = await page.request.post("/api/v1/views", {
      ...AS_OPERATOR,
      data: { name, query: "lifecycle=analysed&sort=created", description: "From the spec" },
    });
    expect(created.status()).toBe(201);

    await openTab(page, "views");
    const row = page.getByTestId("views-table").locator("tr", { hasText: name });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByRole("link", { name })).toHaveAttribute("href", /\/calls\?.*lifecycle=analysed/);

    await row.getByTestId("delete-view").click();
    await expect(page.getByRole("alertdialog")).toContainText("disappears for everyone");
    await page.getByRole("button", { name: "Delete the view" }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("connection: sample mode says so plainly and freezes the Knowledge Box fields", async ({ page }) => {
    await signIn(page);
    await openTab(page, "connection");
    await expect(page.getByTestId("mock-notice")).toContainText("Connection edits are not applied");
    await expect(page.locator("#c-kbid")).toBeDisabled();
    await expect(page.locator("#c-region")).toBeDisabled();
    await expect(page.getByTestId("rotate-key")).toBeDisabled();
    // The model and the reranker do apply in sample mode, so they are not frozen.
    await expect(page.locator("#c-model")).toBeEnabled();
    await expect(page.getByRole("link", { name: "Run a connection test" })).toBeVisible();
  });

  test("about: version, taxonomy and the audit trail of what has been changed", async ({ page }) => {
    await signIn(page);
    // Produce an audited change so the trail has something in it, then put it straight back.
    const put = await page.request.put("/api/v1/settings/limits", {
      ...AS_OPERATOR,
      data: { maxQuestionChars: 777 },
    });
    expect(put.ok(), await put.text()).toBeTruthy();
    await resetSection(page, "limits");

    await openTab(page, "about");
    await expect(page.getByTestId("about-product")).toHaveText("Call Analysis");
    await expect(page.getByText("Apache-2.0")).toBeVisible();
    const audit = page.getByTestId("audit-table");
    await expect(audit).toBeVisible({ timeout: 20_000 });
    await expect(audit).toContainText("Limits changed");
    await expect(audit).toContainText("operator");
  });

  test("usage stays an operator view", async ({ page }) => {
    await signIn(page);
    await openTab(page, "usage");
    await expect(page.getByText("Requests", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Knowledge Box" })).toBeVisible();
  });
});
