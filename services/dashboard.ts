/**
 * Dashboard service: cached I/O around the pure aggregation in `lib/aggregate.ts`.
 */
import { aggregate } from "@/lib/aggregate";
import type { Runtime } from "@/lib/runtime";
import { allSummaries, filterByAttributes } from "./calls";

export type { Dashboard, Datum } from "@/lib/aggregate";
export { aggregate, tally } from "@/lib/aggregate";

/** Named windows the dashboard offers, in days back from now. `all` is the whole history. */
export const DASHBOARD_RANGES = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
  all: 0,
} as const;

export type DashboardRange = keyof typeof DASHBOARD_RANGES;

export interface DashboardOptions {
  /** A named window; ignored when `from`/`to` are given. */
  range?: DashboardRange;
  /** Inclusive ISO-8601 lower bound. */
  from?: string;
  /** Inclusive ISO-8601 upper bound. */
  to?: string;
}

export interface DashboardWindow {
  range: DashboardRange | "custom";
  from?: string;
  to?: string;
  /** Calls excluded by the window — shown so an empty dashboard is never mistaken for no data. */
  excluded: number;
}

/**
 * Resolve the options to a concrete `[from, to]` pair.
 *
 * Named ranges are resolved on the server rather than in the browser so the dashboard a link
 * reproduces is the same one the sender saw, and so the cache key is a value rather than a clock
 * reading. `?range=30d` is snapped to whole UTC days for exactly that reason: two people opening
 * the same link four minutes apart must not get two different cache entries, and "the last 30
 * days" is a day-granular question anyway.
 */
export function resolveWindow(
  opts: DashboardOptions = {},
  now = Date.now(),
): { from?: string; to?: string; range: DashboardRange | "custom" } {
  if (opts.from || opts.to) return { from: opts.from, to: opts.to, range: "custom" };
  const range = (opts.range ?? "all") as DashboardRange;
  const days = DASHBOARD_RANGES[range] ?? 0;
  if (!days) return { range: "all" };
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const from = new Date(startOfToday.getTime() - (days - 1) * 86_400_000).toISOString();
  return { from, range };
}

/**
 * The dashboard over a date window.
 *
 * Deliberately **not** cached under a key of its own, which is the fix for a real bug: the
 * aggregate used to be stored as `dashboard:all`, written only once its loader resolved — so it
 * was stamped Δ later than the `summary:<id>` entries it was built from, where Δ is the whole
 * per-call fan-out. For Δ after the summaries expired the dashboard still rendered instantly from
 * its own entry while quietly declining to re-warm anything, and the next screen to read — in
 * practice the calls list, one drill-through click later — paid the entire cold load and sat on a
 * skeleton for about eight seconds.
 *
 * `aggregate()` is pure and O(N) over a few hundred summaries, so re-running it per render costs
 * nothing measurable, and every dashboard render now re-warms exactly the catalog and summary
 * entries the calls list reads next. Switching range is a re-aggregation of rows already in
 * memory, never a second pass over the Knowledge Box.
 */
export async function dashboard(
  rt: Runtime,
  opts: DashboardOptions = {},
): Promise<import("@/lib/aggregate").Dashboard & { window: DashboardWindow }> {
  const w = resolveWindow(opts);
  const all = await allSummaries(rt);
  const scoped = w.from || w.to ? filterByAttributes(all, { from: w.from, to: w.to }) : all;
  return {
    ...aggregate(scoped),
    window: { range: w.range, from: w.from, to: w.to, excluded: all.length - scoped.length },
  };
}
