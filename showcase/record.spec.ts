/**
 * Showcase walkthrough — records the demo video and numbered screenshots into showcase/out/
 * (see showcase/SCRIPT.md and showcase/STORYBOARD.md).
 *
 * Run: SHOWCASE=1 bunx playwright test --config playwright.config.ts (testDir switches to this
 * file; playwright.config.ts turns video recording on, widens the viewport to 1440x900, and
 * raises CALLS_MOCK_STREAM_DELAY_MS so the ask answer streams visibly).
 *
 * The recording is in two halves, which is the product's own shape after the full-implementation
 * pass:
 *
 *  1. **The analyst**, signed in as nobody: dashboard, date window, drill-through, facets, the
 *     column picker, search, the call workspace, and the four trust surfaces — a grounded answer,
 *     the citation scrub, the honest decline and the share link.
 *  2. **The operator**, signed in at `/admin/login`: the *same* screens, now editable. Settings is
 *     shown read-only first so the sign-in is the story ("the operator's view of the same
 *     product") rather than an unexplained detour, and the beat straight after it goes back to the
 *     calls list from the first half to save the view the visitor could not. It ends on the audit
 *     trail, which by then is a list of the changes this recording itself just made.
 *
 * Repeatability. The showcase server keeps one `DATA_DIR` (`./data/e2e`) across runs, so every
 * write this walkthrough makes is either reverted in `finally` or made idempotent by a sweep at
 * the start: the saved view and the labelset are removed by name/id before they are created as
 * well as after, branding and retention are dropped back to the environment default, the share link
 * is revoked, and the `call-insights` prompts are captured before the edit and written back
 * afterwards. The one thing the walkthrough deliberately does not do is issue an API key, because
 * that is the one change the product has no way to undo — see beat 19. Two runs in succession
 * therefore record the same thing.
 *
 * Every selector here is reused verbatim from the specs that already prove it stable against the
 * mock ARAG: test/e2e/demo.spec.ts, admin.spec.ts, settings.spec.ts, taxonomy.spec.ts,
 * calls-views.spec.ts and api-explorer.spec.ts.
 */
import { expect, type Page, test } from "@playwright/test";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ADMIN_TOKEN = "e2e-admin-token";
/**
 * Playwright's `page.request` does not share the browser's cookie jar with the page for a `Secure`
 * cookie on plain http, so the set-up and clean-up calls carry the operator token as a bearer
 * header instead — the same credential the sign-in form posts.
 */
const AS_OPERATOR = { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } };

/** Everything this walkthrough creates, named once so the sweep and the beats cannot drift. */
const VIEW_NAME = "Negative sentiment";
const LABELSET_ID = "showcase_renewal";
const LABELSET_TITLE = "Renewal Risk";
const KEY_NAME = "Reporting pipeline";
const PROMPT_LINE = "Call out any renewal or lapse risk the member mentions, with the date they gave.";
/** The stat tile the date-window beat drills through, and the label behind it. */
const DRILL_TILE = "First-call resolution";
const DRILL_LABEL = "disposition_flags/First-Call Resolution";

/**
 * The operator sign-in.
 *
 * The Sign in button is disabled until React has seen a token in its own state: a `fill` that
 * lands before hydration sets the DOM value without ever reaching that state, so the button stays
 * disabled for ever. Re-filling until it reacts makes this independent of how long the bundle took
 * to arrive. Lifted from test/e2e/settings.spec.ts.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  const token = page.getByLabel("Admin token");
  const submit = page.getByRole("button", { name: "Sign in" });
  await expect(async () => {
    await token.fill(ADMIN_TOKEN);
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await submit.click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

/** Remove anything a previous (possibly interrupted) run left behind, so the beats can be typed. */
async function sweep(page: Page): Promise<void> {
  const views = await page.request.get("/api/v1/views", AS_OPERATOR);
  if (views.ok()) {
    const body = (await views.json()) as { items?: Array<{ id: string; name: string }> };
    for (const v of body.items ?? [])
      if (v.name === VIEW_NAME) await page.request.delete(`/api/v1/views/${v.id}`, AS_OPERATOR);
  }
  // `knowledge_box=true` also removes the labels a provision run applied to analysed calls.
  await page.request
    .delete(`/api/v1/labelsets/${LABELSET_ID}?knowledge_box=true`, AS_OPERATOR)
    .catch(() => undefined);
  // An *active* key closes the API to anonymous callers, and the first half of this recording is
  // an anonymous caller. Revoking is all the API offers: `apiKeysEnforced()` is sticky, so a key
  // row left behind by anything else still forces every caller to present a credential and no
  // route removes a row. This recording therefore never issues one (see beat 19).
  const keys = await page.request.get("/api/v1/api-keys", AS_OPERATOR);
  if (keys.ok()) {
    const body = (await keys.json()) as { items?: Array<{ id: string; revoked: boolean }> };
    for (const k of body.items ?? []) {
      if (!k.revoked) await page.request.delete(`/api/v1/api-keys/${k.id}`, AS_OPERATOR);
    }
  }
  for (const section of ["branding", "retention"]) {
    await page.request.delete(`/api/v1/settings/${section}`, AS_OPERATOR).catch(() => undefined);
  }
}

/**
 * A day to start the dashboard window at, chosen from the data rather than from the clock.
 *
 * Reading it off the clock (a named range such as "30 days") would make the recording depend on
 * how old the seeded sample happens to be on the day it is recorded — record it late enough and
 * every call falls outside every named range. Reading it off the data does not.
 *
 * The day has to satisfy two things at once for the beat to say what it claims: enough calls must
 * fall outside the window for the change in the numbers to be visible at all, and the tile the
 * next beat drills through must still select something, because an empty table would be a poor
 * frame — and would mean the chart and the list had been shown disagreeing. So every call's own
 * day is a candidate, the ones that select nothing are dropped, and the pick is whichever comes
 * nearest to halving the list.
 */
async function windowStart(page: Page): Promise<string> {
  const listed = await page.request.get("/api/v1/calls?page_size=100&sort=created&order=desc");
  const body = (await listed.json()) as { total: number; items: Array<{ createdISO?: string }> };
  const days = [...new Set((body.items ?? []).map((i) => i.createdISO?.slice(0, 10)).filter(Boolean))];
  let best = { day: "", score: Number.POSITIVE_INFINITY };
  for (const day of days as string[]) {
    const from = `${day}T00:00:00.000Z`;
    const inWindow = (await (await page.request.get(`/api/v1/calls?page_size=1&from=${from}`)).json()) as {
      total: number;
    };
    if (inWindow.total === 0 || inWindow.total >= body.total) continue;
    const drilled = (await (
      await page.request.get(
        `/api/v1/calls?page_size=1&from=${from}&label=${encodeURIComponent(DRILL_LABEL)}`,
      )
    ).json()) as { total: number };
    if (drilled.total === 0) continue;
    const score = Math.abs(inWindow.total - body.total / 2);
    if (score < best.score) best = { day, score };
  }
  return best.day;
}

test("showcase walkthrough", async ({ page }) => {
  test.setTimeout(420_000);

  const shot = (name: string) => page.screenshot({ path: `showcase/out/${name}.png`, fullPage: false });

  await sweep(page);

  // Captured so the walkthrough can put them back: the share register as it was, and the agent
  // instructions the deployment shipped with.
  const sharesBefore = new Set<string>(
    (
      (
        (await (await page.request.get("/api/v1/shares", AS_OPERATOR)).json()) as {
          items?: Array<{ token: string }>;
        }
      ).items ?? []
    ).map((s) => s.token),
  );
  const agentsBefore = (await (await page.request.get("/api/v1/agents", AS_OPERATOR)).json()) as {
    items: Array<{ key: string; prompts?: Record<string, string> }>;
  };
  const originalPrompts = agentsBefore.items.find((a) => a.key === "call-insights")?.prompts ?? {};

  try {
    // === THE ANALYST ======================================================================

    // --- 1. First-run onboarding ---------------------------------------------------------
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
    await pause(4_000);
    await shot("01-welcome");

    // --- 2. Dashboard ----------------------------------------------------------------------
    await seeAnalysis.click();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    const strip = page.getByTestId("stat-strip");
    await expect(strip).toBeVisible();
    await expect(strip).not.toContainText("NaN");
    await expect(strip.getByText("First-call resolution")).toBeVisible();
    await expect(page.getByText("Calls by reason")).toBeVisible();
    await expect(page.getByText("Sentiment mix")).toBeVisible();
    await expect(page.getByRole("group", { name: "Break down by" })).toBeVisible();
    await pause(5_000);
    await shot("02-dashboard");

    // --- 3. The date window -----------------------------------------------------------------
    // The named ranges are resolved on the server; a custom window is two instants in the URL.
    // Either way the aggregate is recomputed and the calls outside it are counted, not hidden.
    const from = await windowStart(page);
    expect(from).toBeTruthy();
    await expect(page.getByRole("group", { name: "Date range" })).toBeVisible();
    await page.getByRole("button", { name: "Choose a custom date range" }).click();
    await page.getByLabel("From").fill(from);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/from=/);
    await expect(page.getByTestId("range-excluded")).toBeVisible({ timeout: 20_000 });
    await expect(strip).not.toContainText("NaN");
    await pause(6_000);
    await shot("03-date-range");

    // --- 4. Stat-tile drill-through, carrying the window with it -----------------------------
    await strip.getByText(DRILL_TILE).click();
    await expect(page).toHaveURL(/\/calls\?label=disposition_flags/);
    await expect(page).toHaveURL(/from=/);
    const chips = page.getByTestId("filter-chips");
    await expect(chips).toBeVisible();
    await expect(chips).toContainText("From");
    const drilled = page.getByTestId("calls-table");
    await expect(drilled).toBeVisible({ timeout: 20_000 });
    await expect(drilled.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
    await pause(6_000);
    await shot("04-drill-through");

    // --- 5. Facet filter on the full calls list ------------------------------------------------
    await page.goto("/calls");
    const table = page.getByTestId("calls-table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    const rows = table.locator("tbody tr");
    const beforeFacet = await rows.count();
    await page.getByRole("button", { name: "Filter by Sentiment" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Negative/ }).click();
    await expect(page).toHaveURL(/label=sentiment/);
    await expect(chips).toContainText("Negative");
    await expect.poll(async () => rows.count(), { timeout: 20_000 }).toBeLessThan(beforeFacet);
    await page.keyboard.press("Escape");
    await pause(5_000);
    await shot("05-facets");

    // --- 6. The column picker — one reader's furniture, not the team's question ------------------
    // The Saved views control beside it is read-only to this viewer: a view is shared state, so
    // creating one is an operator action, and beat 17 comes back here to do it.
    await expect(page.getByRole("button", { name: /^Saved views/ })).toBeVisible();
    await page.getByRole("button", { name: "Choose columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Duration/ }).click();
    await page.getByRole("menuitemcheckbox", { name: /Compliance/ }).click();
    await expect(table.getByRole("columnheader", { name: /Compliance/ })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /Duration/ })).toHaveCount(0);
    await expect(table.locator("caption")).toContainText("columns shown");
    await pause(6_000);
    await shot("06-columns");
    // Columns and density live in this browser, never in the URL, so nothing here needs undoing on
    // the server — but the rest of the recording reads better against the default table.
    await page.getByRole("button", { name: "Reset to default" }).click();
    await page.keyboard.press("Escape");

    // --- 7. Semantic search across full transcripts ----------------------------------------------
    await page.goto("/calls");
    await expect(table).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Search transcripts").fill("double charged");
    await expect(page).toHaveURL(/q=double/, { timeout: 20_000 });
    const billingCall = table.getByRole("link", { name: /Billing complaint/ }).first();
    await expect(billingCall).toBeVisible({ timeout: 20_000 });
    const callHref = await billingCall.getAttribute("href");
    await pause(5_000);
    await shot("07-search");

    // --- 8. The call workspace -------------------------------------------------------------------
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
    await pause(7_000);
    await shot("08-workspace");

    // --- 9. Click a moments-track segment: the player scrubs, the transcript block highlights ---
    const complaintSegment = momentsTrack.getByRole("button", { name: /^Complaint/ });
    const segment =
      (await complaintSegment.count()) > 0
        ? complaintSegment.first()
        : momentsTrack.locator('button[data-moment="1"]').first();
    await segment.click();
    await expect(page.locator(".flash").first()).toBeVisible({ timeout: 10_000 });
    await pause(6_000);
    await shot("09-moment-seek");

    // --- 10-12. Ask, stream, cite, click the citation to scrub — the spine, and the longest beat --
    await inspector.getByRole("tab", { name: "Ask" }).click();
    await expect(page.getByRole("heading", { name: "Ask this call" })).toBeVisible();

    await page.getByRole("button", { name: "Summarise this call" }).click();
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
    await pause(8_000);
    await shot("12-citation-scrub");

    // --- 13. The honest decline --------------------------------------------------------------
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

    // --- 14. Share ----------------------------------------------------------------------------
    await page.getByRole("button", { name: "Share" }).click();
    const shareDialog = page.getByRole("dialog", { name: "Share this call" });
    await expect(shareDialog).toBeVisible();
    await pause(1_500);
    await shareDialog.getByRole("button", { name: "Create link and copy" }).click();
    await expect(shareDialog.getByText("Active links")).toBeVisible({ timeout: 15_000 });
    await pause(6_000);
    await shot("14-share");
    await shareDialog.getByRole("button", { name: "Done" }).click();

    // === THE OPERATOR =====================================================================

    // --- 15. The same Settings screen, to a viewer who is not an operator ----------------------
    await page.goto("/settings?tab=branding");
    await expect(page.getByRole("tab", { name: "Branding" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("branding-preview")).toBeVisible();
    await expect(page.getByTestId("read-only-notice")).toContainText("Sign in as an operator");
    await expect(page.getByTestId("branding-name")).toBeDisabled();
    await expect(page.getByTestId("save-branding")).toHaveCount(0);
    await pause(5_000);
    await shot("15-settings-read-only");

    // --- 16. Sign in: the operator's view of the same product -----------------------------------
    await signIn(page);
    await expect(page.getByText("Knowledge Box reachable")).toBeVisible({ timeout: 20_000 });
    await pause(5_000);
    await shot("16-operator-overview");

    // --- 17. Back to the queue from beat 5, and save it as a shared view ---------------------------
    // A saved view is server-side state the whole team works from, so creating one is a write, and
    // the visitor in the first half was shown the menu without the control. This is the shortest
    // possible proof that signing in changed the *same* screen rather than opening another one.
    await page.goto(`/calls?label=${encodeURIComponent("sentiment/Negative")}`);
    await expect(page.getByTestId("calls-table")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("filter-chips")).toContainText("Negative");
    const viewsButton = page.getByRole("button", { name: /^Saved views/ });
    await viewsButton.click();
    await page.getByTestId("save-view").click();
    await page.getByLabel("Name this view").fill(VIEW_NAME);
    await page.getByRole("button", { name: "Save view", exact: true }).click();
    // The control names the view rather than saying "Saved views": this is the one being worked on.
    await expect(viewsButton).toContainText(VIEW_NAME, { timeout: 20_000 });
    await viewsButton.click();
    await expect(page.getByTestId("views-menu")).toContainText(VIEW_NAME);
    await pause(6_000);
    await shot("17-saved-view");
    await page.keyboard.press("Escape");

    // --- 18. Branding, now editable, with a live preview -----------------------------------------
    await page.goto("/settings?tab=branding");
    await expect(page.getByTestId("operator-chip")).toBeVisible();
    const productName = page.getByTestId("branding-name");
    await expect(productName).toBeEnabled();
    await expect(page.getByTestId("source-branding")).toContainText("Currently from the environment");
    await productName.fill("Meridian Call Analysis");
    // The preview is driven by the form, not by the saved state: it moves as you type.
    await expect(page.getByTestId("preview-name")).toHaveText("Meridian Call Analysis");
    await page.getByTestId("save-branding").click();
    await expect(page.getByTestId("source-branding")).toContainText("Overridden in the product");
    // The effect, one render later: the rail identity every later frame carries.
    await expect(page.getByTestId("app-sidebar")).toContainText("Meridian Call Analysis", {
      timeout: 20_000,
    });
    await pause(6_000);
    await shot("18-branding");

    // --- 19. The API-key register, and the door this recording deliberately does not open ----------
    //
    // The beat stops at the filled-in form rather than pressing "Create key", for the same reason
    // beat 20 stops at the purge confirmation: it is a one-way door. `apiKeysEnforced()` is
    // sticky — once a key *row* exists, revoked or not, every caller needs a credential — and
    // there is no HTTP route that removes a row (`deleteApiKey` is not exposed). So issuing one
    // here would close the API to the anonymous half of the *next* recording and there would be no
    // way to undo it. The register's own copy carries the whole story, which is what the frame
    // needs: what a key is for, that it is shown once, and what happens when one exists.
    await page.goto("/settings?tab=api-keys");
    await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("create-key").click();
    const keyName = page.getByTestId("new-key-name");
    await expect(keyName).toBeVisible();
    await keyName.fill(KEY_NAME);
    await expect(page.getByTestId("create-key-submit")).toBeEnabled();
    await pause(7_000);
    await shot("19-api-keys");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByTestId("new-key-name")).toHaveCount(0);

    // --- 20. Retention: what a policy would cover, and the guard in front of it --------------------
    await page.goto("/settings?tab=retention");
    await page.getByTestId("retention-days").fill("30");
    await expect(page.getByTestId("retention-candidates")).not.toHaveText("0", { timeout: 20_000 });
    const covered = Number(await page.getByTestId("retention-candidates").innerText());
    // A dry run first — it deletes nothing and is not audited — then the count that has to be
    // typed back before the real purge is even enabled. This recording never takes that step.
    await page.getByTestId("purge-start").click();
    const confirm = page.getByTestId("purge-confirm");
    await expect(confirm).toContainText(`permanently delete ${covered} call`);
    await expect(page.getByTestId("purge-confirm-button")).toBeDisabled();
    await page.getByTestId("purge-typed").fill(String(covered));
    await expect(page.getByTestId("purge-confirm-button")).toBeEnabled();
    // The guard is the subject of this frame, so bring the confirm buttons fully into the viewport
    // rather than leaving them clipped at the bottom edge.
    await page.getByTestId("purge-confirm-button").scrollIntoViewIfNeeded();
    await pause(6_000);
    await shot("20-retention");
    await page.getByTestId("purge-cancel").click();
    await expect(confirm).toHaveCount(0);
    // Nothing was saved and nothing was deleted.
    const stillThere = (await (await page.request.get("/api/v1/calls?page_size=1")).json()) as {
      total: number;
    };
    expect(stillThere.total).toBeGreaterThan(0);

    // --- 21. Taxonomy: a label's description is the instruction the agent reads ---------------------
    await page.goto("/taxonomy");
    await expect(page.getByRole("heading", { name: "Agents & Taxonomy" })).toBeVisible();
    const labelsets = page.getByTestId("labelsets-table");
    await expect(labelsets).toBeVisible({ timeout: 20_000 });
    await expect(labelsets.getByText("Call Reason")).toBeVisible();
    await page.getByTestId("edit-call_reason").click();
    const editor = page.getByTestId("labelset-form");
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await expect(editor.getByLabel("Label 1 name")).not.toHaveValue("", { timeout: 20_000 });
    await expect(page.getByText(/the instruction the agent reads/)).toBeVisible();
    await pause(6_000);
    await shot("21-labelset-instructions");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByTestId("labelset-form")).toHaveCount(0);

    // --- 22. A new labelset, created and provisioned into the Knowledge Box -------------------------
    await page.getByTestId("new-labelset").click();
    const form = page.getByTestId("labelset-form");
    await expect(form).toBeVisible();
    await form.getByLabel("Identifier").fill(LABELSET_ID);
    await form.getByLabel("Title").fill(LABELSET_TITLE);
    await form.getByLabel("Label 1 name").fill("Renewal");
    await form
      .getByLabel("Label 1 description")
      .fill("The member is asking about renewing or extending their policy.");
    await page.getByTestId("add-label").click();
    await form.getByLabel("Label 2 name").fill("Lapse risk");
    await form
      .getByLabel("Label 2 description")
      .fill("The member's cover has lapsed, or will lapse without a payment or a renewal.");
    await page.getByTestId("labelset-save").click();
    const row = page.getByTestId(`labelset-row-${LABELSET_ID}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(LABELSET_TITLE);
    await expect(row).toContainText("Applied");
    await pause(6_000);
    await shot("22-labelset-created");

    // --- 23. An agent's instructions -----------------------------------------------------------------
    const taxonomySection = page.getByRole("group", { name: "Taxonomy section" });
    await taxonomySection.getByRole("button", { name: "Agents" }).click();
    const agents = page.getByTestId("agents-table");
    await expect(agents.getByText("resource-labeler")).toBeVisible();
    await expect(agents.getByText("paragraph-labeler")).toBeVisible();
    await expect(agents.getByText("call-insights")).toBeVisible();
    // The labeler agents have no prompt of their own; the screen says why rather than faking one.
    await expect(page.getByTestId("agent-resource-labeler")).toContainText(
      "its instructions are built from the labelsets above",
    );
    await page.getByTestId("agent-edit-prompts-call-insights").click();
    const prompt = page.getByTestId("prompt-call_analysis");
    await expect(prompt).toBeVisible({ timeout: 20_000 });
    await prompt.fill(`${await prompt.inputValue()}\n${PROMPT_LINE}`);
    await pause(7_000);
    await shot("23-agent-instructions");
    await page.getByTestId("agent-prompts-save").click();
    await expect(page.getByTestId("prompt-call_analysis")).toHaveCount(0, { timeout: 20_000 });

    // --- 24. The API explorer: every screen so far is a client of these operations ---------------------
    await page.goto("/api?op=listCalls");
    await expect(page.getByTestId("operation-title")).toHaveText("List analysed calls");
    await expect(page.getByTestId("api-coverage")).toContainText("operations");
    await expect(page.getByRole("row", { name: /media_type/ })).toBeVisible();
    const curl = page.getByTestId("tryit-curl");
    await expect(curl).toContainText("curl -X GET");
    // The same question the analyst typed into the search box earlier in this recording, so the
    // beat lands as "that screen was this request" rather than as a separate developer demo.
    await page.getByLabel(/^q /).fill("double charged");
    await expect(curl).toContainText("q=double");
    await pause(5_000);
    await shot("24-api-explorer");

    // --- 25. …and it is a real request, against this deployment ----------------------------------------
    await page.getByTestId("tryit-send").click();
    const status = page.getByTestId("tryit-response-status");
    await expect(status).toContainText("200", { timeout: 30_000 });
    await expect(status).toContainText(/\d+ ms/);
    const responseBody = page.getByTestId("tryit-response-body");
    await expect(responseBody).toContainText('"total"');
    // The response has to carry a call, not an empty page: an empty body is a poor frame and would
    // also mean the screen and the endpoint disagreed about the same query.
    await expect(responseBody).toContainText("Billing complaint");
    await pause(7_000);
    await shot("25-api-response");

    // --- 26. The audit trail — which is now a list of everything this recording just did ---------------
    await page.goto("/admin/audit");
    const auditTable = page.getByTestId("audit-table");
    await expect(auditTable).toBeVisible({ timeout: 20_000 });
    await expect(auditTable).toContainText("settings.branding");
    await expect(auditTable).toContainText("labelset.create");
    await expect(auditTable).toContainText("agent.update");
    await expect(auditTable).toContainText("operator");
    await pause(8_000);
    await shot("26-audit");
  } finally {
    // --- Put the deployment back exactly as it was -------------------------------------------------
    await sweep(page).catch(() => undefined);
    if (Object.keys(originalPrompts).length > 0) {
      await page.request
        .put("/api/v1/agents/call-insights", { ...AS_OPERATOR, data: { prompts: originalPrompts } })
        .catch(() => undefined);
    }
    const sharesNow = await page.request.get("/api/v1/shares", AS_OPERATOR).catch(() => null);
    if (sharesNow?.ok()) {
      const body = (await sharesNow.json()) as { items?: Array<{ token: string; revoked: boolean }> };
      for (const s of body.items ?? []) {
        if (!s.revoked && !sharesBefore.has(s.token)) {
          await page.request.delete(`/api/v1/shares/${s.token}`, AS_OPERATOR).catch(() => undefined);
        }
      }
    }
  }
});
