/**
 * The client half of saved views: normalising a calls-list query string and deciding which saved
 * view, if any, the current URL is.
 *
 * Pure, with no React and no server imports. `services/views.ts` owns the same rules on the write
 * path, but that module reaches for `node:crypto` and the document store, so it cannot be pulled
 * into a browser bundle. The allowlist and the normalisation are therefore mirrored here and
 * pinned to the server's copy by `test/unit/calls-views.test.ts` — if the two ever drift, the
 * screen would show "modified" for a view it had just saved, which is the most confusing failure
 * this feature has.
 */

/** Mirror of `VIEW_PARAMS` in `services/views.ts`. The server is the authority; this follows it. */
export const VIEW_PARAMS = [
  "q",
  "label",
  "agent",
  "queue",
  "media_type",
  "lifecycle",
  // The metric filters the dashboard drills through with. Without them a view saved straight after
  // a drill-through would silently drop the very filter it was saved for.
  "call_reason",
  "outcome",
  "sentiment",
  "line_of_business",
  "complaint_category",
  "complaint",
  "fcr",
  "escalated",
  "cross_sell_offered",
  "cross_sell_accepted",
  "from",
  "to",
  "sort",
  "order",
  "page_size",
  "mode",
] as const;

const MULTI = new Set<string>(["label"]);

/**
 * Keep only the parameters a saved view may carry, in a fixed order.
 *
 * Order-independence is the point: a supervisor who picked Sentiment before Agent and one who
 * picked Agent before Sentiment are looking at the same queue, and the screen must say so.
 */
export function normaliseCallsQuery(input: string): string {
  const src = new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  const out = new URLSearchParams();
  for (const key of VIEW_PARAMS) {
    const values = src.getAll(key).filter((v) => v !== "");
    if (values.length === 0) continue;
    if (MULTI.has(key)) for (const v of values.slice(0, 30)) out.append(key, v.slice(0, 200));
    else out.set(key, (values[values.length - 1] ?? "").slice(0, 200));
  }
  return out.toString();
}

export interface SavedView {
  id: string;
  name: string;
  /** Normalised query string, without a leading `?`. */
  query: string;
  href: string;
  description?: string;
  createdISO: string;
  createdBy?: string;
}

/** The saved view the given query *is*, comparing normalised forms so order cannot matter. */
export function matchingView(views: readonly SavedView[], query: string): SavedView | null {
  const target = normaliseCallsQuery(query);
  if (!target) return null;
  return views.find((v) => normaliseCallsQuery(v.query) === target) ?? null;
}

/**
 * What the views control should say about the current URL.
 *
 * `sticky` is the view the reader last opened or saved. Once they change a filter the URL no
 * longer matches it, and the honest report is "this is that view, modified" — not "no view",
 * which would quietly lose the thing they were working on and with it the chance to update it.
 */
export function viewState(
  views: readonly SavedView[],
  query: string,
  sticky: string | null,
): { active: SavedView | null; modified: boolean } {
  const exact = matchingView(views, query);
  if (exact) return { active: exact, modified: false };
  if (!sticky || !normaliseCallsQuery(query)) return { active: null, modified: false };
  const held = views.find((v) => v.id === sticky);
  return held ? { active: held, modified: true } : { active: null, modified: false };
}
