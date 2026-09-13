import { expect, type Page, test } from "@playwright/test";

/**
 * The shell at the two widths the platform's standard names: 1440 px, where the rail and the
 * content column sit side by side, and 390 px, where the rail becomes a drawer.
 *
 * The assertion that matters is that the page never scrolls sideways. It is worth a test of its
 * own because the failure is invisible in development — a band item 55 px too wide looks fine on a
 * laptop and makes the whole product unusable on a phone — and because every screen shares one
 * shell, so a single regression breaks all of them at once.
 */

const SCREENS = [
  "/",
  "/calls",
  "/api",
  "/settings",
  // Each settings tab lays out differently, and two of them were the ones that overflowed: a grid
  // with no explicit column sizes to `max-content`, which is wider than the viewport as soon as a
  // hint sentence is long. Listing the tabs is the only way that is caught.
  "/settings?tab=branding",
  "/settings?tab=limits",
  "/settings?tab=connection",
  "/settings?tab=retention",
  "/settings?tab=api-keys",
  "/settings?tab=shares",
  "/settings?tab=about",
  "/taxonomy",
  "/upload",
  "/upload/history",
  "/admin",
  "/admin/branding",
  "/admin/security",
  "/admin/jobs",
  "/admin/audit",
  "/welcome",
];

async function horizontalOverflow(page: Page, path: string): Promise<number> {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  // Several of these screens render their widest element — a data table, a segmented control —
  // only after a client fetch resolves, so the measurement has to be taken after the layout has
  // settled rather than at networkidle.
  await page.waitForTimeout(1200);
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("the shell at 1440 px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const path of SCREENS) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      expect(await horizontalOverflow(page, path)).toBeLessThanOrEqual(0);
    });
  }

  test("shows the rail beside the content, not over it", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByTestId("app-sidebar");
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box?.x).toBe(0);
    // The main column starts after the rail rather than underneath it.
    const main = await page.locator("main#main").boundingBox();
    expect(main?.x ?? 0).toBeGreaterThanOrEqual((box?.width ?? 0) - 1);
  });
});

test.describe("the shell at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of SCREENS) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      expect(await horizontalOverflow(page, path)).toBeLessThanOrEqual(0);
    });
  }

  test("moves the rail into a drawer the band can open", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open navigation" });
    await expect(toggle).toBeVisible();
    // Off-canvas until opened: present in the accessibility tree, translated out of view.
    await expect(page.locator(".arag-app")).toHaveAttribute("data-rail", /expanded|collapsed/);
    await toggle.click();
    await expect(page.locator(".arag-app")).toHaveAttribute("data-rail", "open");
    await expect(page.getByTestId("app-sidebar").getByRole("link", { name: "Calls" })).toBeVisible();
    // Escape closes it, like every other overlay in the kit.
    await page.keyboard.press("Escape");
    await expect(page.locator(".arag-app")).not.toHaveAttribute("data-rail", "open");
  });
});

test.describe("the operator console at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("does not scroll sideways once signed in", async ({ page }) => {
    // Measured anonymously above, these screens render the "not signed in" state, which is narrow
    // and proves nothing about the tables and controls behind it — and /admin/audit's six-option
    // filter was the widest thing in the product.
    await page.goto("/admin/login");
    const token = page.getByLabel("Admin token");
    for (let i = 0; i < 25; i++) {
      await token.fill("e2e-admin-token");
      const button = page.getByRole("button", { name: "Sign in" });
      // The button is disabled until React hydrates, and filling before that leaves it empty.
      if (await button.isEnabled()) {
        await button.click();
        break;
      }
      await page.waitForTimeout(200);
    }
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    for (const path of [
      "/admin",
      "/admin/audit",
      "/admin/jobs",
      "/admin/logs",
      "/admin/usage",
      "/settings?tab=api-keys",
      "/taxonomy",
    ]) {
      expect(await horizontalOverflow(page, path), `${path} overflows`).toBeLessThanOrEqual(0);
    }
  });
});
