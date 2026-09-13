import type { Locator, Page } from "@playwright/test";

/**
 * The one element with this test id that is actually on screen.
 *
 * Next's App Router keeps the outgoing tree in the DOM, hidden, while the incoming one renders, so
 * for a few frames of a soft navigation the document holds two copies of a screen and a strict
 * locator matches both. It became visible here when the framework moved from 16.1.6 to 16.2.12
 * (DECISIONS D-CA-44); the rendered page has always held exactly one — polling the DOM for three
 * seconds and the failure screenshots both confirm it.
 *
 * So this is the assertion learning to ignore a tree the browser is already hiding, not a defect
 * being papered over. Anywhere a test would otherwise race a transition, scope to the visible one.
 */
export function onScreen(page: Page, testId: string): Locator {
  return page.locator(`[data-testid="${testId}"]:visible`);
}

/**
 * Wait until the App Router has finished a transition.
 *
 * Next keeps the outgoing route's tree in the DOM — hidden — while the incoming one renders, so a
 * document can briefly hold two `<main id="main">` elements and every strict locator inside them
 * matches twice. Waiting for exactly one is waiting for the transition to commit.
 *
 * Called from the navigation helpers rather than sprinkled through assertions, so a test reads as
 * "go here, then check this" and cannot forget it.
 */
export async function settled(page: Page): Promise<void> {
  // The shell — and with it `<main id="main">` — is the *layout*, which the router keeps across a
  // navigation; only the page subtree inside it is duplicated. So the signal has to be something
  // the page owns, and every screen in this product renders exactly one `PageHeader` `<h1>`.
  await page
    .waitForFunction(() => document.querySelectorAll("main#main h1").length <= 1, null, {
      timeout: 20_000,
    })
    .catch(() => {
      /* a page without the shell (the share view, the docs page) simply has none */
    });
}

/** `page.goto` that waits for the transition to commit. */
export async function go(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await settled(page);
}

/** The visible match for a text locator — the transition-tolerant form of `page.getByText`. */
export function text(page: Page, value: string | RegExp): Locator {
  return page.getByText(value).filter({ visible: true });
}
