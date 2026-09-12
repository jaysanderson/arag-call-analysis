/**
 * Showcase walkthrough — records the 2:25 demo video and numbered screenshots into
 * showcase/out/ (see showcase/SCRIPT.md and showcase/STORYBOARD.md).
 *
 * Run: make showcase (SHOWCASE=1, testDir switches to this file; playwright.config.ts
 * turns video recording on, widens the viewport to 1440x900, and raises
 * CALLS_MOCK_STREAM_DELAY_MS so the ask answer streams visibly).
 *
 * Selectors are reused verbatim from test/e2e/demo.spec.ts and test/e2e/admin.spec.ts,
 * which already prove them stable against the mock ARAG. A single serial test keeps
 * the whole walkthrough as one continuous take.
 */
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("showcase walkthrough", async ({ page }) => {
  test.setTimeout(200_000);

  const shot = (name: string) => page.screenshot({ path: `showcase/out/${name}.png`, fullPage: false });

  // --- 0:00 Dashboard: every number is generated, nothing hand-tagged -------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Call Analytics" })).toBeVisible();
  const total = page.locator("a", { has: page.getByText("Total calls") }).first();
  await expect(total).toBeVisible();
  await expect(total).not.toContainText("NaN");
  await pause(12_000);
  await shot("01-dashboard");

  // --- 0:12 the charts: reason / sentiment / cross-sell, all AI-labeled ------------------
  await expect(page.getByText("Calls by reason")).toBeVisible();
  await expect(page.getByText("Sentiment mix")).toBeVisible();
  await expect(page.getByText("Cross-sell funnel")).toBeVisible();
  await page.getByText("Cross-sell funnel").scrollIntoViewIfNeeded();
  await pause(13_000);
  await shot("02-charts");

  // --- 0:25 drill into a KPI: complaint rate -> filtered calls list ----------------------
  const complaintKpi = page.locator("a", { has: page.getByText("Complaint rate") }).first();
  await complaintKpi.click();
  await expect(page).toHaveURL(/label=disposition_flags/);
  await expect(page.getByRole("heading", { name: "Calls", exact: true })).toBeVisible();
  await expect(page.locator('a[href^="/calls/"]').first()).toBeVisible({ timeout: 20_000 });
  await pause(15_000);
  await shot("03-drilldown");

  // --- 0:40 facet filter on the full calls list ------------------------------------------
  await page.goto("/calls");
  await expect(page.getByRole("heading", { name: "Calls", exact: true })).toBeVisible();
  const cards = page.locator('a[href^="/calls/"]');
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  const beforeFacet = await cards.count();
  const facet = page.getByRole("button", { name: /^Billing & Payments/ }).first();
  await facet.click();
  await expect(page).toHaveURL(/label=call_reason/);
  await expect.poll(async () => cards.count(), { timeout: 20_000 }).toBeLessThan(beforeFacet);
  await pause(1500);
  await shot("04-calls-facet");

  // --- 0:48 semantic search across full transcripts --------------------------------------
  await page.goto("/calls");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder("Search transcripts…").fill("premium");
  await expect(page).toHaveURL(/q=premium/, { timeout: 20_000 });
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  await pause(1500);
  await shot("05-calls-search");

  // --- 0:55 call detail: media player, transcript moment chips, AI analysis panel --------
  await page.goto("/calls");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await cards.first().click();
  await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
  await expect(page.getByText("Filter by moment:")).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI Analysis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask this call" })).toBeVisible();
  await expect(page.locator("span.font-mono").first()).toHaveText(/^\d+:\d{2}$/);
  await pause(2500);
  await shot("06-call-detail");

  // --- 1:15 the wow moment: ask, stream, cite, click, scrub -------------------------------
  await page.getByRole("button", { name: "Summarize this call" }).click();
  await pause(900);
  await shot("07-asking");

  await expect(page.getByText("Thinking…")).toBeHidden({ timeout: 45_000 });
  const badge = page.getByText(/confidence|No grounded citations/).first();
  await expect(badge).toBeVisible({ timeout: 45_000 });
  const citation = page.getByRole("button", { name: /source/ }).first();
  await expect(citation).toBeVisible({ timeout: 45_000 });
  await pause(1200);
  await shot("08-answer");

  await citation.click();
  await expect(page.locator(".flash").first()).toBeVisible({ timeout: 10_000 });
  await pause(1800);
  await shot("09-citation-scrub");

  // --- 2:00 "How this works" — the real request path, not a marketing diagram -----------
  await page.getByRole("button", { name: "How this works" }).click();
  await expect(page.getByRole("heading", { name: "Call detail - how this works" })).toBeVisible();
  await pause(2200);
  await shot("10-how-it-works");
  await page.keyboard.press("Escape");

  // --- 2:10 admin panel: sign in, KB connection test, agent status -----------------------
  await page.goto("/admin/login");
  await page.getByLabel("Admin token").fill("e2e-admin-token");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Knowledge Box reachable")).toBeVisible({ timeout: 20_000 });
  await pause(1200);
  await shot("11-admin-overview");

  const adminNav = page.getByTestId("admin-nav");
  await adminNav.getByRole("link", { name: "Health", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
  await expect(page.getByText("Generative model")).toBeVisible();
  await expect(page.getByText(/^OK · \d+ ms$/)).toBeVisible({ timeout: 20_000 });
  await pause(1200);
  await shot("12-admin-health");

  await adminNav.getByRole("link", { name: "Agents", exact: true }).click();
  await expect(page.getByText("resource-labeler")).toBeVisible();
  await expect(page.getByText("paragraph-labeler")).toBeVisible();
  await expect(page.getByText("call-insights")).toBeVisible();
  await pause(1200);
  await shot("13-admin-agents");

  // --- 2:20 close: it is all /api/v1, Redoc, no credentials required --------------------
  await page.goto("/api/v1/docs");
  await expect(page).toHaveTitle(/API reference/);
  await pause(2500);
  await shot("14-api-docs");
});
