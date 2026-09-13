import { expect, type Page, test } from "@playwright/test";
import { onScreen, settled } from "./helpers";

/**
 * The calls list's saved views, column picker, density toggle and date window.
 *
 * The distinction being tested is the product decision behind all four: a saved view is *shared*
 * and lives on the server, while columns and density are one person's furniture and live in that
 * browser. So the view survives a different browser context and the furniture survives a reload.
 *
 * `DATA_DIR=./data/e2e` persists between runs, so every view this spec creates is named with the
 * prefix below and swept up afterwards — otherwise the second run would collide on the name and
 * the third would be testing a queue full of test data.
 */

const PREFIX = "e2e-view-";
const ADMIN_TOKEN = "e2e-admin-token";
const NEGATIVE = "sentiment/Negative";

/**
 * Saved views are shared server-side state on a persistent `DATA_DIR`, so a run that leaves one
 * behind changes what the next run is testing — starting with the "there is nothing to show yet"
 * empty state.
 *
 * Authenticated as the operator rather than anonymously: another spec may have issued an API key,
 * and key enforcement is sticky (D-CA-46), so an unauthenticated sweep would silently 401 and
 * leave everything in place. Every view goes, not only this spec's, because `data/e2e` is a test
 * fixture rather than anyone's data.
 */
async function sweepViews(request: import("@playwright/test").APIRequestContext) {
  const auth = { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } };
  const res = await request.get("/api/v1/views", auth);
  if (!res.ok()) return;
  const body = (await res.json()) as { items: Array<{ id: string; name: string }> };
  for (const v of body.items ?? []) await request.delete(`/api/v1/views/${v.id}`, auth);
}

/** Open the calls table and wait for the first page of rows. */
async function openCalls(page: Page, query = "") {
  await page.goto(`/calls${query}`);
  await expect(page.getByTestId("calls-table")).toBeVisible({ timeout: 30_000 });
  await settled(page);
}

const viewsButton = (page: Page) => page.getByRole("button", { name: /^Saved views/ });

test.beforeEach(async ({ request }) => sweepViews(request));
test.afterAll(async ({ request }) => sweepViews(request));

test.describe("saved views", () => {
  test("the menu teaches what a view is before there is one to show", async ({ page }) => {
    await openCalls(page);
    await viewsButton(page).click();
    const empty = page.getByTestId("views-empty");
    await expect(empty).toContainText("No saved views yet");
    await expect(empty).toContainText("shared");
    // With nothing filtered there is nothing worth naming, and the menu says so rather than
    // offering a button that would be refused by the server.
    await expect(page.getByTestId("save-view")).toHaveCount(0);
    await expect(page.getByTestId("views-menu")).toContainText("Filter or search the list to save it");
  });

  test("a filter is saved as a view, survives a reload, and restores the filters when chosen", async ({
    page,
  }) => {
    const name = `${PREFIX}negative`;
    await openCalls(page, `?label=${encodeURIComponent(NEGATIVE)}`);
    await expect(onScreen(page, "filter-chips")).toContainText("Negative");
    const filtered = await page.getByTestId("calls-table").locator("tbody tr").count();

    await viewsButton(page).click();
    await page.getByTestId("save-view").click();
    await page.getByLabel("Name this view").fill(name);
    await page.getByRole("button", { name: "Save view", exact: true }).click();

    // The new view is the selected one: the control names it rather than saying "Views".
    await expect(viewsButton(page)).toContainText(name);

    // A saved view is server-side, so it is there after a full reload with no filters at all.
    await openCalls(page);
    await viewsButton(page).click();
    await page.getByRole("button", { name: new RegExp(`^${name}$`) }).click();

    await expect(page).toHaveURL(/label=sentiment/);
    await expect(onScreen(page, "filter-chips")).toContainText("Negative");
    await expect
      .poll(async () => page.getByTestId("calls-table").locator("tbody tr").count(), { timeout: 20_000 })
      .toBe(filtered);
    await expect(viewsButton(page)).toContainText(name);
  });

  test("changing a filter reports the view as modified and offers to update it", async ({ page }) => {
    const name = `${PREFIX}modify`;
    await openCalls(page, `?label=${encodeURIComponent(NEGATIVE)}`);
    await viewsButton(page).click();
    await page.getByTestId("save-view").click();
    await page.getByLabel("Name this view").fill(name);
    await page.getByRole("button", { name: "Save view", exact: true }).click();
    await expect(viewsButton(page)).toContainText(name);

    // Narrow it further. The view is still the one being worked on, but it no longer matches.
    await page.getByRole("button", { name: "Filter by Status" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Analysed", exact: true }).click();
    await expect(page).toHaveURL(/lifecycle=analysed/);
    await expect(viewsButton(page)).toContainText("Modified");

    await viewsButton(page).click();
    await expect(page.getByTestId("save-view")).toContainText("Save as new view");
    await page.getByTestId("update-view").click();
    await expect(viewsButton(page)).not.toContainText("Modified");

    // The change is on the server, not in this tab: a fresh load of the view carries it.
    await openCalls(page);
    await viewsButton(page).click();
    await page.getByRole("button", { name: new RegExp(`^${name}$`) }).click();
    await expect(page).toHaveURL(/lifecycle=analysed/);
    await expect(page.getByTestId("filter-chips")).toContainText("Analysed");
  });

  test("a colliding name is refused with the server's own explanation", async ({ page, request }) => {
    const name = `${PREFIX}collide`;
    const made = await request.post("/api/v1/views", { data: { name, query: "lifecycle=failed" } });
    expect(made.status()).toBe(201);

    await openCalls(page, `?label=${encodeURIComponent(NEGATIVE)}`);
    await viewsButton(page).click();
    await page.getByTestId("save-view").click();
    await page.getByLabel("Name this view").fill(name);
    await page.getByRole("button", { name: "Save view", exact: true }).click();

    // The RFC 9457 detail, verbatim — never "Something went wrong".
    await expect(page.getByTestId("views-menu").getByRole("alert")).toContainText(
      `A view called "${name}" already exists`,
    );
    // The form stays open with the name in it, so the fix is one edit away.
    await expect(page.getByLabel("Name this view")).toHaveValue(name);
  });

  test("a view is renamed and deleted from the menu, with deletion confirmed", async ({ page, request }) => {
    const name = `${PREFIX}doomed`;
    const renamed = `${PREFIX}renamed`;
    const made = await request.post("/api/v1/views", { data: { name, query: "lifecycle=failed" } });
    expect(made.status()).toBe(201);

    await openCalls(page);
    await viewsButton(page).click();
    await page.getByRole("button", { name: `Rename ${name}` }).click();
    await page.getByLabel("New name").fill(renamed);
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^${renamed}$`) })).toBeVisible();

    await page.getByRole("button", { name: `Delete ${renamed}` }).click();
    // `role="alertdialog"`: the kit's confirmation announces its body, not only its title.
    const dialog = page.getByRole("alertdialog", { name: /Delete the view/ });
    await expect(dialog).toContainText("shared");
    await expect(dialog).toContainText("calls it selects are not");
    await dialog.getByRole("button", { name: "Delete view" }).click();

    await expect
      .poll(async () => {
        const res = await request.get("/api/v1/views");
        const body = (await res.json()) as { items: Array<{ name: string }> };
        return body.items.some((v) => v.name === renamed);
      })
      .toBe(false);
  });
});

test.describe("the reader's own furniture", () => {
  test("a hidden column stays hidden after a reload, and the caption follows", async ({ page }) => {
    await openCalls(page);
    const table = page.getByTestId("calls-table");
    await expect(table.getByRole("columnheader", { name: /Duration/ })).toBeVisible();

    await page.getByRole("button", { name: "Choose columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Duration/ }).click();
    // Show a column that is not on by default at the same time.
    await page.getByRole("menuitemcheckbox", { name: /Compliance/ }).click();
    await page.keyboard.press("Escape");

    await expect(table.getByRole("columnheader", { name: /Duration/ })).toHaveCount(0);
    await expect(table.getByRole("columnheader", { name: /Compliance/ })).toBeVisible();
    await expect(table.locator("caption")).toContainText("8 columns shown");

    await openCalls(page);
    await expect(table.getByRole("columnheader", { name: /Duration/ })).toHaveCount(0);
    await expect(table.getByRole("columnheader", { name: /Compliance/ })).toBeVisible();

    // The Call column is the row's only way into the record, so it is never offered for hiding.
    await page.getByRole("button", { name: "Choose columns" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: /^Call/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    // Sorting still works on a column the reader kept, and reports its direction.
    await page.getByRole("button", { name: "Reset to default" }).click();
    await page.keyboard.press("Escape");
    await table.getByRole("button", { name: /Sentiment/ }).click();
    await expect(page).toHaveURL(/sort=sentiment/);
    await expect(table.getByRole("columnheader", { name: /Sentiment/ })).toHaveAttribute(
      "aria-sort",
      /ascending|descending/,
    );
    await expect(table.getByRole("columnheader", { name: /Duration/ })).toBeVisible();
  });

  test("density is remembered by this browser", async ({ page }) => {
    await openCalls(page);
    const table = page.getByTestId("calls-table");
    await expect(table).not.toHaveClass(/compact/);

    await page.getByRole("group", { name: "Row density" }).getByRole("button", { name: "Compact" }).click();
    await expect(table).toHaveClass(/compact/);

    await openCalls(page);
    await expect(table).toHaveClass(/compact/);
    await expect(table).toHaveAttribute("data-density", "compact");

    await page
      .getByRole("group", { name: "Row density" })
      .getByRole("button", { name: "Comfortable" })
      .click();
    await expect(table).not.toHaveClass(/compact/);
  });

  test("the furniture is not in the URL, so a link carries the question and nothing else", async ({
    page,
  }) => {
    await openCalls(page);
    await page.getByRole("group", { name: "Row density" }).getByRole("button", { name: "Compact" }).click();
    await page.getByRole("button", { name: "Choose columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Duration/ }).click();
    await page.keyboard.press("Escape");
    expect(page.url()).not.toMatch(/columns|density/);
  });
});

test.describe("the date window", () => {
  test("a range set in the filter bar becomes chips and narrows the result count", async ({
    page,
    request,
  }) => {
    // The bound comes from the data itself — the newest call's own day — so the assertion is about
    // the filter working rather than about how old the seeded sample happens to be.
    const listed = await request.get("/api/v1/calls?page_size=100&sort=created&order=desc");
    const body = (await listed.json()) as { total: number; items: Array<{ createdISO?: string }> };
    const dates = body.items.map((c) => c.createdISO).filter((d): d is string => Boolean(d));
    expect(dates.length).toBeGreaterThan(1);
    const cutoff = (dates[0] ?? "").slice(0, 10);
    const narrowed = await request.get(`/api/v1/calls?page_size=1&from=${cutoff}T00:00:00.000Z`);
    const expected = ((await narrowed.json()) as { total: number }).total;
    expect(expected).toBeLessThan(body.total);

    await openCalls(page);

    await page.getByRole("button", { name: "Filter by date range" }).click();
    await page.getByTestId("date-range-menu").getByLabel("From").fill(cutoff);
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page).toHaveURL(/from=/);
    const chips = page.getByTestId("filter-chips");
    await expect(chips).toContainText("From");
    await expect
      .poll(async () => (await chips.innerText()).match(/(\d+) calls?/)?.[1], { timeout: 20_000 })
      .toBe(String(expected));

    // The upper bound is a second chip, so one end of the window can be widened on its own.
    await page.getByRole("button", { name: /Filter by date range/ }).click();
    await page.getByTestId("date-range-menu").getByLabel("To").fill(cutoff);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(chips).toContainText("To");
    await expect(page).toHaveURL(/to=/);

    await chips.getByRole("button", { name: /^Remove filter To/ }).click();
    await expect(page).not.toHaveURL(/[?&]to=/);
    await expect(page).toHaveURL(/from=/);
  });

  test("a date window drilled through from elsewhere arrives as removable chips", async ({ page }) => {
    await openCalls(page, "?from=2020-01-01T00:00:00.000Z&to=2035-01-01T00:00:00.000Z");
    // `.last()` because Next keeps the outgoing tree mounted for a few frames during an App Router
    // transition, so a strict locator can briefly match the old copy as well as the new one. The
    // rendered page holds exactly one chip row — confirmed by screenshot and by polling the DOM
    // for three seconds — so this is the assertion tolerating a transition, not the screen being
    // wrong. The last match is always the tree React is committing to.
    const chips = page.getByTestId("filter-chips").last();
    await expect(chips).toContainText("From 1 Jan 2020");
    await expect(chips).toContainText("To 1 Jan 2035");
    await chips.getByRole("button", { name: /^Remove filter From/ }).click();
    await expect(page).not.toHaveURL(/[?&]from=/);
  });

  test("a saved view pins the window as two instants, not a name that drifts", async ({ page, request }) => {
    const name = `${PREFIX}window`;
    await openCalls(page, "?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.999Z");
    await viewsButton(page).click();
    await page.getByTestId("save-view").click();
    await page.getByLabel("Name this view").fill(name);
    await page.getByRole("button", { name: "Save view", exact: true }).click();
    await expect(viewsButton(page)).toContainText(name);

    const res = await request.get("/api/v1/views");
    const body = (await res.json()) as { items: Array<{ name: string; query: string }> };
    const saved = body.items.find((v) => v.name === name);
    expect(saved?.query).toContain("from=2026-01-01T00%3A00%3A00.000Z");
    expect(saved?.query).toContain("to=2026-12-31T23%3A59%3A59.999Z");
  });
});
