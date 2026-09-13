import { type Page, test } from "@playwright/test";

/**
 * Before/after screenshot harness for the product-experience pass (D-28).
 *
 * Not part of `make check` or `make e2e` — it is run on demand with
 * `playwright.shots.config.ts` to produce `docs/screenshots/<prefix>-*.png` at 1440 px.
 */

const PREFIX = process.env.SHOT_PREFIX ?? "after";
const DIR = "docs/screenshots";

test.use({ viewport: { width: 1440, height: 900 } });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${PREFIX}-${name}.png`, fullPage: true });
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
}

test("capture", async ({ page }) => {
  test.setTimeout(300_000);

  await open(page, "/");
  await shot(page, "01-dashboard");

  await open(page, "/calls");
  await page
    .locator('[data-testid="calls-table"]')
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await shot(page, "02-calls-list");

  // Pick an audio call so the player and the moments track are both in the frame.
  await open(page, "/calls?media_type=audio");
  const audio = page.locator('a[href^="/calls/"]').first();
  await audio.waitFor({ timeout: 30_000 }).catch(() => {});
  const href = await audio.getAttribute("href");
  if (href) await open(page, href);
  await shot(page, "03-call-detail");

  await open(page, "/admin/login");
  const token = page.locator('input[type="password"], input[name="token"]').first();
  if (await token.count()) {
    await token.fill("e2e-admin-token");
    await page
      .getByRole("button", { name: /sign in/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1500);
  }

  await open(page, "/admin");
  await shot(page, "04-admin");

  await open(page, "/settings?tab=connection");
  await shot(page, "05-settings-config");

  await open(page, "/admin/taxonomy");
  await shot(page, "06-admin-agents");

  // Screens that did not exist before the pass.
  await open(page, "/welcome");
  await shot(page, "07-welcome");

  await open(page, "/upload");
  await shot(page, "08-upload");

  await open(page, "/taxonomy");
  await shot(page, "09-taxonomy");

  await open(page, "/calls?mode=browse");
  await shot(page, "10-calls-browse");

  await open(page, "/settings?tab=branding");
  await shot(page, "11-settings-branding");

  await open(page, "/admin/security");
  await shot(page, "12-admin-security");

  // Screens and controls added by the full-implementation pass.
  // Deep-linked to an operation so the frame shows what the screen is for — the parameters, the
  // schemas and the try-it form — rather than the index and an empty right-hand pane.
  await open(page, "/api?op=getDashboard");
  await page
    .locator('[data-testid="api-explorer"]')
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await shot(page, "13-api-explorer");

  await open(page, "/settings?tab=api-keys");
  await shot(page, "14-settings-api-keys");

  await open(page, "/settings?tab=limits");
  await shot(page, "15-settings-limits");

  await open(page, "/settings?tab=retention");
  await shot(page, "16-settings-retention");

  await open(page, "/settings?tab=shares");
  await shot(page, "17-settings-shares");

  await open(page, "/?range=30d");
  await shot(page, "18-dashboard-range");

  await open(page, "/admin/jobs");
  await shot(page, "19-admin-jobs");

  await open(page, "/admin/audit");
  await shot(page, "20-admin-audit");

  await open(page, "/calls?label=sentiment%2FNegative");
  await page
    .locator('[data-testid="calls-table"]')
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await shot(page, "21-calls-filtered");
});
