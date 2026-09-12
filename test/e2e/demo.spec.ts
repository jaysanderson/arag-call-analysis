import { expect, test } from "@playwright/test";

/**
 * The product journey end to end: shell → dashboard → calls table → filters → workspace → ask →
 * citation scrub. Runs against a production build backed by the in-process mock ARAG
 * (see playwright.config.ts).
 */

test.describe("the workspace", () => {
  test("every screen sits in one shell with the Progress band and the left navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("powered-by-band")).toBeVisible();
    await expect(page.getByAltText("Progress Agentic RAG").first()).toBeVisible();

    const sidebar = page.getByTestId("app-sidebar");
    for (const label of ["Dashboard", "Calls", "Upload", "Agents & Taxonomy", "Settings", "Admin"]) {
      await expect(sidebar.getByRole("link", { name: label, exact: true })).toBeVisible();
    }

    // Navigation is real routing, and the active item follows the route.
    await sidebar.getByRole("link", { name: "Calls", exact: true }).click();
    await expect(page).toHaveURL(/\/calls/);
    await expect(sidebar.getByRole("link", { name: "Calls", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("the dashboard aggregates live metrics and drills through to the calls table", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

    const strip = page.getByTestId("stat-strip");
    await expect(strip).toBeVisible();
    await expect(strip).not.toContainText("NaN");
    await expect(strip.getByText("First-call resolution")).toBeVisible();

    await expect(page.getByText("Calls by reason")).toBeVisible();
    await expect(page.getByText("Sentiment mix")).toBeVisible();
    // The per-agent breakdown is the "who is driving this" answer.
    await expect(page.getByRole("group", { name: "Break down by" })).toBeVisible();

    // Every stat tile is a drill-through into the filtered table, not a dead number.
    await strip.getByText("Complaint rate").click();
    await expect(page).toHaveURL(/\/calls\?label=disposition_flags/);
    await expect(page.getByTestId("filter-chips")).toBeVisible();
  });

  test("the calls list is a data table with search, facets, sorting and pagination", async ({ page }) => {
    await page.goto("/calls");
    await expect(page.getByRole("heading", { name: "Calls", exact: true })).toBeVisible();

    const table = page.getByTestId("calls-table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    for (const header of ["Call", "Date", "Duration", "Agent / Queue", "Sentiment", "Status"]) {
      await expect(table.getByRole("columnheader", { name: new RegExp(header) })).toBeVisible();
    }
    // Every row carries a lifecycle state, so no call is in an unexplained limbo.
    await expect(table.getByText("Analysed").first()).toBeVisible();
    await expect(page.getByTestId("page-range")).toContainText(/\d+-\d+ of \d+/);

    const rows = table.locator("tbody tr");
    const before = await rows.count();
    expect(before).toBeGreaterThan(1);

    // Sorting is a real request: the column header reports the direction it applied.
    await table.getByRole("button", { name: /Duration/ }).click();
    await expect(page).toHaveURL(/sort=duration/);
    await expect(table.getByRole("columnheader", { name: /Duration/ })).toHaveAttribute(
      "aria-sort",
      /ascending|descending/,
    );

    // A facet narrows the set and leaves a removable chip behind.
    await page.getByRole("button", { name: "Filter by Sentiment" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Negative/ }).click();
    await expect(page).toHaveURL(/label=sentiment/);
    await expect(page.getByTestId("filter-chips")).toContainText("Negative");
    await expect.poll(async () => rows.count(), { timeout: 20_000 }).toBeLessThan(before);

    await page.getByRole("button", { name: "Clear all" }).click();
    await expect.poll(async () => rows.count(), { timeout: 20_000 }).toBe(before);
  });

  test("selecting rows reveals the bulk actions", async ({ page }) => {
    await page.goto("/calls");
    const table = page.getByTestId("calls-table");
    await expect(table).toBeVisible({ timeout: 30_000 });

    await table.locator('tbody input[type="checkbox"]').first().check();
    const bulk = page.getByTestId("bulk-bar");
    await expect(bulk).toBeVisible();
    await expect(bulk).toContainText("1 selected");
    await expect(bulk.getByRole("link", { name: /Export/ })).toBeVisible();
    await expect(bulk.getByRole("button", { name: /Re-run analysis/ })).toBeVisible();
    await expect(bulk.getByRole("button", { name: /Delete/ })).toBeVisible();

    // Deleting is always confirmed, and the confirmation names what goes.
    await bulk.getByRole("button", { name: /Delete/ }).click();
    const dialog = page.getByRole("dialog", { name: /Delete 1 call/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  test("browse mode keeps the category rails", async ({ page }) => {
    await page.goto("/calls?mode=browse");
    await expect(page.getByRole("group", { name: "View mode" })).toBeVisible();
    await expect(page.locator('a[href^="/calls/"]').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /See all/ }).first()).toBeVisible();
  });

  test("search finds a call by what was said in it", async ({ page }) => {
    await page.goto("/calls");
    await page.getByLabel("Search transcripts").fill("premium");
    await expect(page).toHaveURL(/q=premium/, { timeout: 20_000 });
    await expect(page.locator('a[href^="/calls/"]').first()).toBeVisible({ timeout: 20_000 });
  });

  test("the call workspace shows the moments track, transcript and inspector", async ({ page }) => {
    await page.goto("/calls");
    await page.locator('a[href^="/calls/"]').first().click();

    await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
    await expect(page.getByTestId("moments-track")).toBeVisible();
    // Timestamps come from ARAG's transcription, so they must read as m:ss.
    await expect(
      page
        .locator(".mono")
        .filter({ hasText: /^\d+:\d{2}$/ })
        .first(),
    ).toBeVisible();

    const inspector = page.getByRole("complementary", { name: "Call inspector" });
    await expect(inspector.getByRole("tab", { name: "Analysis" })).toHaveAttribute("aria-selected", "true");
    await inspector.getByRole("tab", { name: "Details" }).click();
    await expect(inspector.getByText("Call id")).toBeVisible();
    await inspector.getByRole("tab", { name: "Ask" }).click();
    await expect(page.getByRole("heading", { name: "Ask this call" })).toBeVisible();

    // The workspace actions are real, not decoration.
    await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Export/ })).toBeVisible();
  });

  test("the hero moment: ask a question, get a cited answer, click the citation to scrub", async ({
    page,
  }) => {
    await page.goto("/calls");
    await page.locator('a[href^="/calls/"]').first().click();
    const inspector = page.getByRole("complementary", { name: "Call inspector" });
    await inspector.getByRole("tab", { name: "Ask" }).click();
    await expect(page.getByRole("heading", { name: "Ask this call" })).toBeVisible();

    await page.getByRole("button", { name: "Summarize this call" }).click();
    await expect(page.getByText("Thinking…")).toBeHidden({ timeout: 45_000 });

    // A grounded answer carries a qualitative confidence badge and source chips.
    await expect(page.getByText(/confidence|No grounded citations/).first()).toBeVisible({
      timeout: 45_000,
    });

    const citation = page.getByRole("button", { name: /source/ }).first();
    await expect(citation).toBeVisible({ timeout: 45_000 });
    await citation.click();
    // Clicking a citation focuses the source block in the transcript.
    await expect(page.locator(".flash").first()).toBeVisible({ timeout: 10_000 });
  });

  test("a moment chip filters the transcript", async ({ page }) => {
    await page.goto("/calls");
    await page.locator('a[href^="/calls/"]').first().click();
    const transcript = page.getByTestId("transcript");
    const count = transcript.getByText(/\d+ of \d+ blocks|\d+ blocks/).first();
    const before = await count.innerText();

    // Whichever moments the labeller assigned, clicking the first must narrow the transcript.
    await transcript.locator("button.arag-filterchip").first().click();
    await expect.poll(async () => count.innerText(), { timeout: 15_000 }).not.toBe(before);
  });

  test("a share link opens a read-only copy of the call", async ({ page, request }) => {
    const list = await request.get("/api/v1/calls?page_size=1");
    const id = (await list.json()).items[0].id as string;
    const created = await request.post(`/api/v1/calls/${id}/shares`, { data: { ttlDays: 1 } });
    expect(created.status()).toBe(201);
    const share = await created.json();

    await page.goto(share.url);
    await expect(page.getByText(/shared, read-only copy/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
    // Read-only means no write affordances at all.
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Ask" })).toHaveCount(0);

    await request.delete(`/api/v1/shares/${share.token}`);
    await page.goto(share.url);
    await expect(page.getByRole("heading", { name: "Call not found" })).toBeVisible();
  });

  test("upload offers a dropzone, a metadata form and a progress stepper", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: "Upload a call" })).toBeVisible();
    await expect(page.getByTestId("upload-stepper")).toBeVisible();
    await expect(page.getByText("Drop a recording or transcript here")).toBeVisible();
    await expect(page.getByLabel("Title")).toBeVisible();

    await page.getByRole("link", { name: "Ingest history" }).first().click();
    await expect(page.getByRole("heading", { name: "Ingest history" })).toBeVisible();
  });

  test("agents and taxonomy report what is actually provisioned", async ({ page }) => {
    await page.goto("/taxonomy");
    await expect(page.getByRole("heading", { name: "Agents & Taxonomy" })).toBeVisible();
    const labelsets = page.getByTestId("labelsets-table");
    await expect(labelsets).toBeVisible({ timeout: 20_000 });
    await expect(labelsets.getByText("Call Reason")).toBeVisible();

    await page
      .getByRole("group", { name: "Taxonomy section" })
      .getByRole("button", { name: "Agents" })
      .click();
    const agents = page.getByTestId("agents-table");
    await expect(agents.getByText("resource-labeler")).toBeVisible();
    await expect(agents.getByText("paragraph-labeler")).toBeVisible();
    await expect(agents.getByText("call-insights")).toBeVisible();
  });

  test("settings explain the connection, the branding and the limits", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Knowledge Box" })).toBeVisible();
    await expect(page.getByText("Sample data").first()).toBeVisible();

    await page.getByRole("tab", { name: "Branding" }).click();
    await expect(page.getByTestId("branding-preview")).toBeVisible();
    await expect(page.getByLabel("Product name")).toHaveValue("Call Analysis");

    await page.getByRole("tab", { name: "API keys" }).click();
    await expect(page.getByText(/API_KEYS/)).toBeVisible();

    await page.getByRole("tab", { name: "About" }).click();
    await expect(page.getByText("Apache-2.0")).toBeVisible();
  });

  test("the API contract is browsable from the app", async ({ page }) => {
    const res = await page.request.get("/api/v1/openapi.json");
    expect(res.status()).toBe(200);
    const spec = (await res.json()) as { openapi: string; info: { title: string } };
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Call Analysis API");

    await page.goto("/api/v1/docs");
    await expect(page).toHaveTitle(/API reference/);
  });

  test("a not-found call renders an empty state, not a stack trace", async ({ page }) => {
    await page.goto("/calls/definitely-not-a-real-id");
    await expect(page.getByRole("heading", { name: "Call not found" })).toBeVisible();
  });

  test("a filter that matches nothing teaches the way out", async ({ page }) => {
    await page.goto("/calls?q=zzzzznotarealtranscriptphrase");
    const empty = page.getByTestId("empty-state");
    await expect(empty).toBeVisible({ timeout: 20_000 });
    await expect(empty).toContainText("No calls match these filters");
    await expect(empty.getByRole("button", { name: "Clear all filters" })).toBeVisible();
  });
});
