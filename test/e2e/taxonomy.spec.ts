import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

/**
 * Agents & Taxonomy as a configuration product: create, edit, provision and delete a labelset,
 * switch an agent off, and rewrite the `call-insights` instructions — each one asserted after a
 * reload, because the point of the screen is that the change persisted, not that a toast appeared.
 *
 * The spec runs against a persistent DATA_DIR, so everything it creates it removes and everything
 * it changes it puts back: a second run must find the deployment exactly as the first one did.
 */

const ADMIN_TOKEN = "e2e-admin-token";
const LABELSET_ID = "e2e_taxonomy";
const LABELSET_TITLE = "E2E Taxonomy";
const PROMPT_MARKER = "E2E marker: ignore this line.";
const BASE = `http://127.0.0.1:${process.env.PW_PORT ?? 3241}`;

const authed = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** The prompts the deployment shipped with, so the spec can put them back. */
let originalPrompts: Record<string, string> = {};

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Admin token").fill(ADMIN_TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

/** Remove the labelset this spec creates, from the product and from the Knowledge Box. */
async function purge(request: APIRequestContext): Promise<void> {
  await request
    .delete(`${BASE}/api/v1/labelsets/${LABELSET_ID}?knowledge_box=true`, { headers: authed })
    .catch(() => undefined);
}

test.describe.configure({ mode: "serial" });

test.describe("agents & taxonomy", () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    await purge(request);
    const agents = await (await request.get(`${BASE}/api/v1/agents`, { headers: authed })).json();
    const insights = (agents.items as Array<{ key: string; prompts?: Record<string, string> }>).find(
      (a) => a.key === "call-insights",
    );
    originalPrompts = insights?.prompts ?? {};
    await request.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    await purge(request);
    // Put the agent configuration back: the store outlives the run.
    await request
      .put(`${BASE}/api/v1/agents/paragraph-labeler`, { headers: authed, data: { enabled: true } })
      .catch(() => undefined);
    if (Object.keys(originalPrompts).length > 0) {
      await request
        .put(`${BASE}/api/v1/agents/call-insights`, { headers: authed, data: { prompts: originalPrompts } })
        .catch(() => undefined);
    }
    await request.dispose();
  });

  test("a visitor sees the taxonomy read-only, and is told how to change it", async ({ page }) => {
    await page.goto("/taxonomy");
    await expect(page.getByTestId("labelsets-table")).toBeVisible({ timeout: 20_000 });

    const note = page.getByTestId("taxonomy-readonly-note");
    await expect(note).toBeVisible();
    await expect(note.getByRole("link", { name: "Sign in as an operator" })).toBeVisible();

    // No write controls at all: not the create button, not a row editor, not a provision action.
    await expect(page.getByTestId("new-labelset")).toHaveCount(0);
    await expect(page.getByTestId("edit-call_reason")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Re-provision everything" })).toHaveCount(0);
  });

  test("an operator creates a labelset and it reaches the Knowledge Box", async ({ page }) => {
    await signIn(page);
    await page.goto("/taxonomy");
    await page.getByTestId("new-labelset").click();

    const form = page.getByTestId("labelset-form");
    await expect(form).toBeVisible();
    await form.getByLabel("Identifier").fill(LABELSET_ID);
    await form.getByLabel("Title").fill(LABELSET_TITLE);
    await form.getByLabel("Label 1 name").fill("Renewal");
    await form
      .getByLabel("Label 1 description")
      .fill("The member is asking about renewing or extending their policy.");

    await page.getByTestId("labelset-save").click();

    const row = page.getByTestId(`labelset-row-${LABELSET_ID}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(LABELSET_TITLE);
    await expect(row).toContainText("Customised");
    await expect(row).toContainText("Applied");

    await page.reload();
    await expect(page.getByTestId(`labelset-row-${LABELSET_ID}`)).toContainText(LABELSET_TITLE, {
      timeout: 20_000,
    });
  });

  test("editing adds a label that survives a reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/taxonomy");

    await page.getByTestId(`edit-${LABELSET_ID}`).click();
    const form = page.getByTestId("labelset-form");
    await expect(form.getByLabel("Identifier")).toBeDisabled();
    await expect(form.getByLabel("Label 1 name")).toHaveValue("Renewal", { timeout: 20_000 });

    await page.getByTestId("add-label").click();
    await form.getByLabel("Label 2 name").fill("Lapse");
    await form
      .getByLabel("Label 2 description")
      .fill("The member's cover has lapsed or is about to lapse without renewal.");
    await page.getByTestId("labelset-save").click();

    await expect(page.getByTestId("labelset-form")).toHaveCount(0, { timeout: 20_000 });

    await page.reload();
    await page.getByTestId(`edit-${LABELSET_ID}`).click();
    await expect(page.getByTestId("labelset-form").getByLabel("Label 2 name")).toHaveValue("Lapse", {
      timeout: 20_000,
    });
  });

  test("switching an agent off persists", async ({ page }) => {
    await signIn(page);
    await page.goto("/taxonomy");
    await page
      .getByRole("group", { name: "Taxonomy section" })
      .getByRole("button", { name: "Agents" })
      .click();

    const toggle = page.getByTestId("agent-enabled-paragraph-labeler");
    await expect(toggle).toBeChecked({ timeout: 20_000 });
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();

    await page.reload();
    await page
      .getByRole("group", { name: "Taxonomy section" })
      .getByRole("button", { name: "Agents" })
      .click();
    await expect(page.getByTestId("agent-enabled-paragraph-labeler")).not.toBeChecked({ timeout: 20_000 });
  });

  test("the call-insights instructions are editable and persist", async ({ page }) => {
    await signIn(page);
    await page.goto("/taxonomy");
    await page
      .getByRole("group", { name: "Taxonomy section" })
      .getByRole("button", { name: "Agents" })
      .click();

    // The labeler agents have no prompt of their own; the screen says why rather than faking one.
    await expect(page.getByTestId("agent-resource-labeler")).toContainText(
      "its instructions are built from the labelsets above",
    );

    await page.getByTestId("agent-edit-prompts-call-insights").click();
    const prompt = page.getByTestId("prompt-call_analysis");
    await expect(prompt).toBeVisible({ timeout: 20_000 });
    const before = await prompt.inputValue();
    await prompt.fill(`${before}\n${PROMPT_MARKER}`);
    await page.getByTestId("agent-prompts-save").click();
    await expect(page.getByTestId("prompt-call_analysis")).toHaveCount(0, { timeout: 20_000 });

    await page.reload();
    await page
      .getByRole("group", { name: "Taxonomy section" })
      .getByRole("button", { name: "Agents" })
      .click();
    await page.getByTestId("agent-edit-prompts-call-insights").click();
    await expect(page.getByTestId("prompt-call_analysis")).toHaveValue(new RegExp(PROMPT_MARKER), {
      timeout: 20_000,
    });
  });

  test("deleting names the cost, and removes the labelset for good", async ({ page }) => {
    await signIn(page);
    await page.goto("/taxonomy");

    await page.getByRole("button", { name: `More actions for ${LABELSET_TITLE}` }).click();
    await page.getByTestId(`delete-${LABELSET_ID}`).click();

    const dialog = page.getByRole("alertdialog", { name: `Delete ${LABELSET_TITLE}?` });
    await expect(dialog).toContainText("2 labels");
    // Removing the labels already applied to analysed calls is a separate, explicit choice.
    const alsoKb = page.getByTestId("delete-also-kb");
    await expect(alsoKb).not.toBeChecked();
    await alsoKb.check();
    await dialog.getByRole("button", { name: "Delete labelset" }).click();

    await expect(page.getByTestId(`labelset-row-${LABELSET_ID}`)).toHaveCount(0, { timeout: 20_000 });
    await page.reload();
    await expect(page.getByTestId("labelsets-table")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`labelset-row-${LABELSET_ID}`)).toHaveCount(0);
  });
});
