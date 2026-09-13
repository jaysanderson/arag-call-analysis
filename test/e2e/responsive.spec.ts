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

const SCREENS = ["/", "/calls", "/api", "/settings", "/taxonomy", "/upload", "/admin", "/welcome"];

async function horizontalOverflow(page: Page, path: string): Promise<number> {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
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
