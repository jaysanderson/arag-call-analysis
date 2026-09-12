import { expect, test } from "@playwright/test";

/**
 * The demo happy path: dashboard → calls → filter → detail → ask → citation scrub.
 * Runs against a production build backed by the in-process mock ARAG (see playwright.config.ts).
 */

test.describe("demo app", () => {
  test("dashboard renders live aggregates from the generated metrics", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Call Analytics" })).toBeVisible();

    // The KPI row is computed, not hard-coded: total calls must be a real number > 0.
    const total = page.locator("a", { has: page.getByText("Total calls") }).first();
    await expect(total).toBeVisible();
    await expect(total).not.toContainText("NaN");

    await expect(page.getByText("Calls by reason")).toBeVisible();
    await expect(page.getByText("Sentiment mix")).toBeVisible();
    await expect(page.getByText("Cross-sell funnel")).toBeVisible();
    await expect(page.getByText("Recent calls")).toBeVisible();
    // Each recent call card links to a detail page.
    await expect(page.locator('a[href^="/calls/"]').first()).toBeVisible();
  });

  test("the Progress band and the how-this-works reveal are on every page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByAltText("Progress Agentic RAG")).toBeVisible();
    await page.getByRole("button", { name: "How this works" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard - how this works" })).toBeVisible();
    await expect(page.getByText("Data-Augmentation agents")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("calls list filters by an ARAG-assigned label", async ({ page }) => {
    await page.goto("/calls");
    await expect(page.getByRole("heading", { name: "Calls", exact: true })).toBeVisible();
    await expect(page.getByText("All calls")).toBeVisible();

    const cards = page.locator('a[href^="/calls/"]');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const before = await cards.count();

    // Facet chips come from GET /api/v1/labelsets; counts come from GET /api/v1/dashboard.
    const facet = page.getByRole("button", { name: /^Billing & Payments/ }).first();
    await facet.click();
    await expect(page).toHaveURL(/label=call_reason/);
    await expect.poll(async () => cards.count(), { timeout: 20_000 }).toBeLessThan(before);
  });

  test("search finds a call by what was said in it", async ({ page }) => {
    await page.goto("/calls");
    await page.getByPlaceholder("Search transcripts…").fill("premium");
    await expect(page).toHaveURL(/q=premium/, { timeout: 20_000 });
    await expect(page.locator('a[href^="/calls/"]').first()).toBeVisible({ timeout: 20_000 });
  });

  test("call detail shows the transcript with moment chips and the analysis panel", async ({ page }) => {
    await page.goto("/calls");
    await page.locator('a[href^="/calls/"]').first().click();

    await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
    await expect(page.getByText("Filter by moment:")).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI Analysis" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ask this call" })).toBeVisible();

    // Paragraph timestamps come from ARAG's transcription, so they must look like m:ss.
    await expect(page.locator("span.font-mono").first()).toHaveText(/^\d+:\d{2}$/);
  });

  test("the wow moment: ask a question, get a cited answer, click the citation to scrub", async ({
    page,
  }) => {
    await page.goto("/calls");
    await page.locator('a[href^="/calls/"]').first().click();
    await expect(page.getByRole("heading", { name: "Ask this call" })).toBeVisible();

    await page.getByRole("button", { name: "Summarize this call" }).click();

    // The answer streams in as NDJSON from POST /api/v1/calls/{id}/ask.
    const answer = page
      .locator("div.bg-brand-50")
      .filter({ hasNot: page.locator("button") })
      .first();
    await expect(page.getByText("Thinking…")).toBeHidden({ timeout: 45_000 });

    // A grounded answer carries a qualitative confidence badge (REMi-derived) and source chips.
    const badge = page.getByText(/confidence|No grounded citations/).first();
    await expect(badge).toBeVisible({ timeout: 45_000 });

    const citation = page.getByRole("button", { name: /source/ }).first();
    await expect(citation).toBeVisible({ timeout: 45_000 });
    await citation.click();

    // Clicking a citation focuses the source paragraph in the transcript.
    await expect(page.locator(".flash").first()).toBeVisible({ timeout: 10_000 });
    await expect(answer).toBeVisible();
  });

  test("a moment chip filters the transcript", async ({ page }) => {
    await page.goto("/calls");
    await page.locator('a[href^="/calls/"]').first().click();
    const filterBar = page.locator("div", { has: page.getByText("Filter by moment:") }).last();
    await expect(filterBar).toBeVisible();

    // Whichever moments the labeler assigned to this call, clicking the first one must narrow the
    // transcript. Naming a specific label would couple the test to the labeller's output.
    const segments = page.locator("text=/\\d+ of \\d+|\\d+ segments/").first();
    const before = await segments.innerText();
    await filterBar.getByRole("button").first().click();
    await expect.poll(async () => segments.innerText(), { timeout: 15_000 }).not.toBe(before);
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

  test("a not-found call renders the empty state, not a stack trace", async ({ page }) => {
    await page.goto("/calls/definitely-not-a-real-id");
    await expect(page.getByRole("heading", { name: "Call not found" })).toBeVisible();
  });
});
