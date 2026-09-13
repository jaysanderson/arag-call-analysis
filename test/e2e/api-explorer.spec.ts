import { expect, test } from "@playwright/test";

/**
 * The in-product API explorer at `/api`.
 *
 * Runs against the production build backed by the in-process mock ARAG (see playwright.config.ts,
 * which sets ADMIN_TOKEN but signs nobody in — so an admin-only operation really is unauthorised
 * for this browser, which is what the problem-document case needs).
 */

const DECLARED = 60;

test.describe("the API explorer", () => {
  test("lists every declared operation, grouped by tag", async ({ page }) => {
    await page.goto("/api");

    await expect(page.getByRole("heading", { name: "API", exact: true })).toBeVisible();

    // The coverage strip states what the document declares and that all of it is listed.
    const coverage = page.getByTestId("api-coverage");
    await expect(coverage).toContainText(`${DECLARED} operations`);
    await expect(coverage).toContainText("13 tags");
    await expect(coverage.getByRole("link", { name: /Redoc/ })).toHaveAttribute("href", "/api/v1/docs");
    await expect(coverage.getByRole("link", { name: /Swagger UI/ })).toHaveAttribute(
      "href",
      "/api/v1/swagger",
    );
    await expect(coverage.getByRole("link", { name: /openapi.json/ })).toHaveAttribute(
      "href",
      "/api/v1/openapi.json",
    );

    const index = page.getByTestId("api-index");
    for (const tag of [
      "Calls",
      "Analytics",
      "Taxonomy",
      "Views",
      "API keys",
      "Retention",
      "Shares",
      "Onboarding",
      "Settings",
      "Branding",
      "Jobs",
      "Auth",
      "Admin",
    ]) {
      await expect(page.getByTestId(`api-group-${tag}`)).toBeVisible();
    }

    // Every operation the document declares is a real link in the index.
    await expect(index.getByRole("link")).toHaveCount(DECLARED);
    await expect(page.getByTestId("api-listed-count")).toHaveText(`${DECLARED} of ${DECLARED} shown`);

    // A group collapses and its operations go with it.
    await expect(page.getByTestId("api-op-adminConfig")).toBeVisible();
    await page.getByTestId("api-group-Admin").click();
    await expect(page.getByTestId("api-group-Admin")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("api-op-adminConfig")).toHaveCount(0);
  });

  test("the filter narrows the list on method, path, summary and operation id", async ({ page }) => {
    await page.goto("/api");
    const filter = page.getByTestId("api-filter");
    const index = page.getByTestId("api-index");

    await filter.fill("dashboard");
    await expect(index.getByRole("link")).toHaveCount(1);
    await expect(page.getByTestId("api-op-getDashboard")).toBeVisible();
    await expect(page.getByTestId("api-listed-count")).toHaveText(`1 of ${DECLARED} shown`);

    // Matching on the verb keeps only the destructive operations.
    await filter.fill("delete /api/v1/views");
    await expect(index.getByRole("link")).toHaveCount(1);
    await expect(page.getByTestId("api-op-deleteView")).toBeVisible();

    await filter.fill("no-such-operation");
    await expect(page.getByTestId("api-index-empty")).toBeVisible();

    await filter.fill("");
    await expect(index.getByRole("link")).toHaveCount(DECLARED);
  });

  test("selecting an operation deep-links and survives a reload", async ({ page }) => {
    await page.goto("/api");
    await page.getByTestId("api-op-listCalls").click();

    await expect(page).toHaveURL(/\/api\?op=listCalls$/);
    await expect(page.getByTestId("operation-title")).toHaveText("List analysed calls");
    await expect(page.getByTestId("operation-signature")).toContainText("/api/v1/calls");
    await expect(page.getByTestId("api-op-listCalls")).toHaveAttribute("aria-current", "true");

    await page.reload();
    await expect(page.getByTestId("operation-title")).toHaveText("List analysed calls");
    await expect(page.getByTestId("api-op-listCalls")).toHaveAttribute("aria-current", "true");

    // A parameter declared in the document reaches the reference table and the try-it form.
    await expect(page.getByRole("row", { name: /media_type/ })).toBeVisible();
    await expect(page.getByLabel(/^page_size/)).toBeVisible();

    // Back returns to the operation that was selected before.
    await page.getByTestId("api-op-getDashboard").click();
    await expect(page.getByTestId("operation-title")).toHaveText("Aggregated analytics across a date window");
    await page.goBack();
    await expect(page.getByTestId("operation-title")).toHaveText("List analysed calls");
  });

  test("running GET /api/v1/dashboard from the try-it panel shows a 200 and the JSON body", async ({
    page,
  }) => {
    await page.goto("/api?op=getDashboard");
    await expect(page.getByTestId("operation-signature")).toContainText("/api/v1/dashboard");

    await page.getByTestId("tryit-send").click();

    const status = page.getByTestId("tryit-response-status");
    await expect(status).toContainText("200");
    await expect(status).toContainText(/\d+ ms/);
    await expect(page.getByTestId("tryit-response-body")).toContainText('"total"');
    await expect(page.getByTestId("tryit-response")).toContainText("content-type");
  });

  test("an operation that needs the admin token renders the problem document", async ({ page }) => {
    await page.goto("/api?op=adminConfig");
    await expect(page.getByTestId("operation-signature")).toContainText("/api/v1/admin/config");

    // The auth requirement is stated before anything is sent.
    await expect(page.getByText("The admin token", { exact: true })).toBeVisible();

    await page.getByTestId("tryit-send").click();

    await expect(page.getByTestId("tryit-response-status")).toContainText("401");
    const problem = page.getByTestId("tryit-problem");
    await expect(problem).toContainText("Unauthorized");
    await expect(problem).toContainText("Admin token required");
    await expect(problem).toContainText("https://arag.dev/problems/unauthorized");
  });

  test("the curl is the request that would be sent, and is copyable", async ({ page }) => {
    await page.goto("/api?op=listCalls");

    const curl = page.getByTestId("tryit-curl");
    await expect(curl).toContainText("curl -X GET");
    await expect(curl).toContainText("/api/v1/calls");
    await expect(curl).not.toContainText("X-API-Key");

    // Editing the form edits the curl.
    await page.getByLabel(/^q /).fill("renewal");
    await expect(curl).toContainText("q=renewal");

    // A pasted key is never printed: the curl carries the placeholder instead.
    await page.getByTestId("tryit-apikey").fill("ca_live_never_print_me");
    await expect(curl).toContainText("$CALL_ANALYSIS_API_KEY");
    await expect(curl).not.toContainText("never_print_me");

    await page.getByTestId("tryit-copy-curl").click();
    await expect(page.getByText("curl copied to the clipboard")).toBeVisible();
  });

  test("a DELETE will not send until the confirm step is taken", async ({ page }) => {
    await page.goto("/api?op=deleteView");
    await expect(page.getByTestId("operation-signature")).toContainText("/api/v1/views/{id}");

    const send = page.getByTestId("tryit-send");
    await expect(send).toHaveText("Send — needs confirmation");
    // A required path parameter blocks the send outright.
    await expect(send).toBeDisabled();

    await page.getByLabel(/^id /).fill("no-such-view");
    await expect(send).toBeEnabled();

    // The first click confirms rather than sending.
    await send.click();
    const confirm = page.getByTestId("destructive-confirm");
    await expect(confirm).toContainText("Send DELETE /api/v1/views/no-such-view?");
    await expect(page.getByTestId("tryit-response")).toHaveCount(0);

    // Cancelling leaves nothing sent.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("tryit-response")).toHaveCount(0);

    await send.click();
    await page.getByTestId("tryit-confirm").click();
    await expect(page.getByTestId("tryit-response-status")).toContainText("404");
    await expect(page.getByTestId("tryit-problem")).toContainText("Saved view not found");
  });

  test("the index and the detail stack into one column on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto("/api?op=getBranding");

    const index = page.getByTestId("api-index");
    const detail = page.getByTestId("operation-title");
    await expect(index).toBeVisible();
    await expect(detail).toBeVisible();

    const indexBox = await index.boundingBox();
    const detailBox = await detail.boundingBox();
    if (!indexBox || !detailBox) throw new Error("the explorer did not render");
    // Full-width list above the detail, not a 320px rail squeezed beside it.
    expect(indexBox.width).toBeGreaterThan(300);
    expect(detailBox.y).toBeGreaterThan(indexBox.y);

    // Neither column runs off the side of the screen. (The document-level scroll width is not
    // asserted: the app band overflows by ~55px on every screen at this width, which belongs to
    // the shell rather than to this section.)
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    for (const testid of ["api-coverage", "api-index", "tryit-curl"]) {
      const box = await page.getByTestId(testid).boundingBox();
      if (!box) throw new Error(`${testid} did not render`);
      expect(box.x, testid).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, testid).toBeLessThanOrEqual(viewport.width + 1);
    }
  });
});
