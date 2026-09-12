/**
 * Showcase walkthrough — records the demo video and numbered screenshots into showcase/out/
 * (see showcase/SCRIPT.md and showcase/STORYBOARD.md).
 *
 * Run: SHOWCASE=1 bunx playwright test --config playwright.config.ts (testDir switches to this
 * file; playwright.config.ts turns video recording on, widens the viewport to 1440x900, and
 * raises CALLS_MOCK_STREAM_DELAY_MS so the ask answer streams visibly).
 *
 * This follows design/PRODUCT-EXPERIENCE.md §8 ("The guided path — Try with sample calls") step
 * for step. One difference from that section's stated preconditions: the showcase environment's
 * mock Knowledge Box is already seeded with the 24 sample calls (the mock seeds and augments
 * itself once per process — see lib/mock.ts), so the onboarding screen genuinely offers "See the
 * analysis" rather than "Try with sample calls". That is recorded honestly rather than reset and
 * faked, per instruction.
 *
 * Every selector here is reused verbatim from test/e2e/demo.spec.ts and test/e2e/admin.spec.ts,
 * which already prove them stable against the mock ARAG.
 */
import { expect, test } from "@playwright/test";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("showcase walkthrough", async ({ page }) => {
  test.setTimeout(240_000);

  const shot = (name: string) => page.screenshot({ path: `showcase/out/${name}.png`, fullPage: false });

  // --- 1. First-run onboarding -----------------------------------------------------------
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
  await expect(page.getByTestId("onboarding-step-connect")).toBeVisible();
  await expect(page.getByTestId("onboarding-step-taxonomy")).toBeVisible();
  await expect(page.getByTestId("onboarding-step-calls")).toBeVisible();
  await expect(page.getByTestId("onboarding-step-analysis")).toBeVisible();
  // The Knowledge Box is already seeded in this environment, so the real, honest state of the
  // guided path is "See the analysis" rather than a seeding run to fake.
  const seeAnalysis = page.getByTestId("see-the-analysis");
  await expect(seeAnalysis).toBeVisible();
  await pause(8_000);
  await shot("01-welcome");

  // --- 2. Dashboard ------------------------------------------------------------------------
  await seeAnalysis.click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const strip = page.getByTestId("stat-strip");
  await expect(strip).toBeVisible();
  await expect(strip).not.toContainText("NaN");
  await expect(strip.getByText("First-call resolution")).toBeVisible();
  await expect(page.getByText("Calls by reason")).toBeVisible();
  await expect(page.getByText("Sentiment mix")).toBeVisible();
  await expect(page.getByRole("group", { name: "Break down by" })).toBeVisible();
  await pause(10_000);
  await shot("02-dashboard");

  // --- 3. Stat-tile drill-through into the filtered table -----------------------------------
  await strip.getByText("Complaint rate").click();
  await expect(page).toHaveURL(/\/calls\?label=disposition_flags/);
  await expect(page.getByTestId("filter-chips")).toBeVisible();
  await expect(page.getByTestId("calls-table")).toBeVisible({ timeout: 20_000 });
  await pause(8_000);
  await shot("03-drilldown");

  // --- 4. Facet filter on the full calls list ------------------------------------------------
  await page.goto("/calls");
  const table = page.getByTestId("calls-table");
  await expect(table).toBeVisible({ timeout: 30_000 });
  const rows = table.locator("tbody tr");
  const beforeFacet = await rows.count();
  await page.getByRole("button", { name: "Filter by Sentiment" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Negative/ }).click();
  await expect(page).toHaveURL(/label=sentiment/);
  await expect(page.getByTestId("filter-chips")).toContainText("Negative");
  await expect.poll(async () => rows.count(), { timeout: 20_000 }).toBeLessThan(beforeFacet);
  await page.keyboard.press("Escape");
  await pause(7_000);
  await shot("04-facets");

  // --- 5. Semantic search across full transcripts --------------------------------------------
  await page.goto("/calls");
  await expect(table).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Search transcripts").fill("double charged");
  await expect(page).toHaveURL(/q=double/, { timeout: 20_000 });
  const billingCall = table.getByRole("link", { name: /Billing complaint/ }).first();
  await expect(billingCall).toBeVisible({ timeout: 20_000 });
  const callHref = await billingCall.getAttribute("href");
  await pause(7_000);
  await shot("05-search");

  // --- 6. Browse mode: the category rails ------------------------------------------------------
  await page.goto("/calls?mode=browse");
  await expect(page.getByRole("group", { name: "View mode" })).toBeVisible();
  await expect(page.locator('a[href^="/calls/"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: /See all/ }).first()).toBeVisible();
  await pause(7_000);
  await shot("06-browse");

  // --- 7. Table mode again: bulk selection -----------------------------------------------------
  await page.goto("/calls");
  await expect(table).toBeVisible({ timeout: 30_000 });
  const checkboxes = table.locator('tbody input[type="checkbox"]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await checkboxes.nth(2).check();
  const bulk = page.getByTestId("bulk-bar");
  await expect(bulk).toBeVisible();
  await expect(bulk).toContainText("3 selected");
  await expect(bulk.getByRole("link", { name: /Export/ })).toBeVisible();
  await expect(bulk.getByRole("button", { name: /Re-run analysis/ })).toBeVisible();
  await expect(bulk.getByRole("button", { name: /Delete/ })).toBeVisible();
  await pause(7_000);
  await shot("07-bulk");
  // The affordance is real; the point of this beat is that it exists, not that it runs.

  // --- 8. The call workspace ---------------------------------------------------------------
  expect(callHref).toBeTruthy();
  await page.goto(callHref!);
  await expect(page.getByRole("heading", { name: /Billing complaint/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
  const momentsTrack = page.getByTestId("moments-track");
  await expect(momentsTrack).toBeVisible();
  await expect(
    page
      .locator(".mono")
      .filter({ hasText: /^\d+:\d{2}$/ })
      .first(),
  ).toBeVisible();
  const inspector = page.getByRole("complementary", { name: "Call inspector" });
  await expect(inspector.getByRole("tab", { name: "Analysis" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Export/ })).toBeVisible();
  await pause(10_000);
  await shot("08-workspace");

  // --- 9. Click a moments-track segment: the player scrubs, the transcript block highlights ---
  const complaintSegment = momentsTrack.getByRole("button", { name: /^Complaint/ });
  const segment =
    (await complaintSegment.count()) > 0
      ? complaintSegment.first()
      : momentsTrack.locator('button[data-moment="1"]').first();
  await segment.click();
  await expect(page.locator(".flash").first()).toBeVisible({ timeout: 10_000 });
  await pause(7_000);
  await shot("09-moment-seek");

  // --- 10-12. Ask, stream, cite, click the citation to scrub — the spine, and the longest beat --
  await inspector.getByRole("tab", { name: "Ask" }).click();
  await expect(page.getByRole("heading", { name: "Ask this call" })).toBeVisible();

  await page.getByRole("button", { name: "Summarize this call" }).click();
  // The mock streams the answer in a few hundred ms; grab the transient "Thinking…" frame fast.
  await pause(150);
  await shot("10-asking");

  await expect(page.getByText("Thinking…")).toBeHidden({ timeout: 45_000 });
  const badge = page.getByText(/confidence|No grounded citations/).first();
  await expect(badge).toBeVisible({ timeout: 45_000 });
  const citationsBefore = page.getByRole("button", { name: /source/ });
  await expect(citationsBefore.first()).toBeVisible({ timeout: 45_000 });
  const citationCountBefore = await citationsBefore.count();
  await pause(8_000);
  await shot("11-answer");

  await citationsBefore.first().click();
  await expect(page.locator(".flash").first()).toBeVisible({ timeout: 10_000 });
  await pause(10_000);
  await shot("12-citation-scrub");

  // --- 13. The honest decline ----------------------------------------------------------------
  // Chosen so it shares no vocabulary at all with this call's transcript (the mock's retrieval is
  // keyword-overlap based — see vendor/arag-platform/src/arag/mock/server.ts's tokens()/retrieve()
  // — so a question using none of this transcript's words is what genuinely triggers a decline).
  await page.getByPlaceholder("Ask about this call…").fill("What is the customer's shoe size?");
  await inspector.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(/not enough data to answer this/i)).toBeVisible({ timeout: 45_000 });
  // No confidence badge and no new citation chips on a decline — the refusal is the feature.
  await expect(page.getByRole("button", { name: /source/ })).toHaveCount(citationCountBefore);
  await pause(7_000);
  await shot("13-decline");

  // --- 14. Share --------------------------------------------------------------------------
  await page.getByRole("button", { name: "Share" }).click();
  const shareDialog = page.getByRole("dialog", { name: "Share this call" });
  await expect(shareDialog).toBeVisible();
  await pause(1_500);
  await shareDialog.getByRole("button", { name: "Create link and copy" }).click();
  await expect(shareDialog.getByText("Active links")).toBeVisible({ timeout: 15_000 });
  await pause(7_000);
  await shot("14-share");
  await shareDialog.getByRole("button", { name: "Done" }).click();

  // --- 15. Upload ---------------------------------------------------------------------------
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "Upload a call" })).toBeVisible();
  await expect(page.getByTestId("upload-stepper")).toBeVisible();
  await expect(page.getByText("Drop a recording or transcript here")).toBeVisible();
  await expect(page.getByLabel("Title")).toBeVisible();
  await pause(6_000);
  await shot("15-upload");

  // --- 16. Agents & Taxonomy ------------------------------------------------------------------
  await page.goto("/taxonomy");
  await expect(page.getByRole("heading", { name: "Agents & Taxonomy" })).toBeVisible();
  const labelsets = page.getByTestId("labelsets-table");
  await expect(labelsets).toBeVisible({ timeout: 20_000 });
  await expect(labelsets.getByText("Call Reason")).toBeVisible();
  await page.getByRole("group", { name: "Taxonomy section" }).getByRole("button", { name: "Agents" }).click();
  const agents = page.getByTestId("agents-table");
  await expect(agents.getByText("resource-labeler")).toBeVisible();
  await expect(agents.getByText("paragraph-labeler")).toBeVisible();
  await expect(agents.getByText("call-insights")).toBeVisible();
  await pause(6_000);
  await shot("16-taxonomy");

  // --- 17. Settings — Branding live preview ----------------------------------------------------
  await page.goto("/settings?tab=branding");
  await expect(page.getByRole("tab", { name: "Branding" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("branding-preview")).toBeVisible();
  const productName = page.getByLabel("Product name");
  await expect(productName).toHaveValue("Call Analysis");
  await productName.fill("Meridian Call Analysis");
  await expect(page.getByTestId("branding-preview")).toContainText("Meridian Call Analysis");
  await pause(5_000);
  await shot("17-branding");

  // --- 18. Admin overview ----------------------------------------------------------------------
  await page.goto("/admin/login");
  await page.getByLabel("Admin token").fill("e2e-admin-token");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Knowledge Box reachable")).toBeVisible({ timeout: 20_000 });
  await pause(5_000);
  await shot("18-admin-overview");

  // --- 19. Admin jobs: the provenance of everything just seen -----------------------------------
  const adminNav = page.getByTestId("admin-nav");
  await adminNav.getByRole("tab", { name: "Jobs" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  await expect(page.getByText("Recent jobs").or(page.getByText("Nothing to show yet."))).toBeVisible();
  const firstJobRow = page.locator("tbody tr").first();
  if (await firstJobRow.count()) {
    await firstJobRow.click();
  }
  await pause(5_000);
  await shot("19-admin-jobs");

  // --- 20. API docs — every screen just recorded is a client of these endpoints -----------------
  await page.goto("/api/v1/docs");
  await expect(page).toHaveTitle(/API reference/);
  await pause(5_000);
  await shot("20-api-docs");
});
