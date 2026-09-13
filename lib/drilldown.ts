/**
 * The dashboard's drill-throughs, derived from the same predicate each figure was computed from.
 *
 * The defect this module exists to prevent: every tile and chart on the dashboard is a tally over
 * the generated `call_metrics` field, written by the `call-insights` ask agent — but the
 * drill-through links used to filter on ARAG *labels*, written by the labeler agent. Both agents
 * read the same transcript and they routinely disagree, so the product could show "Cross-sell
 * accepted 0 %" above a link to ten calls, and "Complaint rate 23 %" above a link to none. A
 * number that contradicts the list behind it is worse than no link at all, because the reader has
 * no way to tell which of the two is lying.
 *
 * So a figure and its link are defined together, once, here. `dashboardFigures()` enumerates every
 * number the dashboard renders with the filter that reproduces it, `callsHref()` turns that filter
 * into a URL, and a contract test walks the whole list asserting each figure equals the count its
 * own link returns. Adding a tile without adding it to `dashboardFigures` leaves it untested;
 * adding it with the wrong filter fails the test.
 *
 * Pure, with no value imports outside `lib/`, so the CLI scripts and the contract tests can both
 * load it (see `test/unit/script-imports.test.ts`).
 */

import type { Dashboard, Datum } from "./aggregate";

/** The calls-list filters a dashboard figure can be expressed in. Wire names, not camelCase. */
export interface CallFilters {
  call_reason?: string;
  outcome?: string;
  sentiment?: string;
  line_of_business?: string;
  complaint_category?: string;
  complaint?: boolean;
  fcr?: boolean;
  escalated?: boolean;
  cross_sell_offered?: boolean;
  cross_sell_accepted?: boolean;
  sort?: string;
  order?: string;
}

/**
 * Build a calls-list URL from a filter set and the dashboard's date window.
 *
 * `scope` is the window as `&from=…&to=…` (or empty), produced by the dashboard page: the list has
 * to be narrowed to the same calls the figure was computed over, or the count disagrees for a
 * second, unrelated reason.
 */
export function callsHref(filters: CallFilters, scope = ""): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    params.set(key, typeof value === "boolean" ? String(value) : value);
  }
  const query = params.toString();
  const tail = scope.startsWith("&") ? scope.slice(1) : scope;
  const joined = [query, tail].filter(Boolean).join("&");
  return joined ? `/calls?${joined}` : "/calls";
}

/** One number on the dashboard, with the filter that reproduces it. */
export interface DashboardFigure {
  /** Stable identifier, used by the contract test's failure messages. */
  id: string;
  /** What the screen calls it. */
  label: string;
  /** How many calls the figure counts — never a rate, so it can be compared with a list total. */
  count: number;
  filters: CallFilters;
}

function fromTally(prefix: string, data: Datum[], key: keyof CallFilters): DashboardFigure[] {
  return data.map((d) => ({
    id: `${prefix}:${d.name}`,
    label: d.name,
    count: d.value,
    filters: { [key]: d.name } as CallFilters,
  }));
}

/**
 * Every figure the dashboard renders as a link, with the count it displays and the filter that
 * must reproduce it.
 *
 * Deliberately excludes the averages (compliance, CSAT): a mean is not a count, so there is no
 * subset of calls it could be checked against. Those two tiles link to the list sorted by that
 * column ascending — "show me the worst" — which is an honest action rather than a filter
 * pretending to explain the number.
 */
export function dashboardFigures(d: Dashboard): DashboardFigure[] {
  return [
    { id: "total", label: "Calls", count: d.total, filters: {} },
    { id: "fcr", label: "First-call resolution", count: d.counts.fcr, filters: { fcr: true } },
    { id: "complaint", label: "Complaint rate", count: d.counts.complaint, filters: { complaint: true } },
    {
      id: "cross-sell-accepted",
      label: "Cross-sell accepted",
      count: d.counts.crossSellAccepted,
      filters: { cross_sell_accepted: true },
    },
    {
      id: "cross-sell-offered",
      label: "Cross-sell offered",
      count: d.counts.crossSellOffered,
      filters: { cross_sell_offered: true },
    },
    { id: "escalated", label: "Escalated", count: d.counts.escalated, filters: { escalated: true } },
    ...fromTally("reason", d.byReason, "call_reason"),
    ...fromTally("sentiment", d.bySentiment, "sentiment"),
    ...fromTally("outcome", d.byOutcome, "outcome"),
    ...fromTally("lob", d.byLob, "line_of_business"),
    // A complaint category is only meaningful among complaints, and the tally is computed that
    // way, so the filter carries both halves of the predicate.
    ...d.complaintsByCategory.map((c) => ({
      id: `complaint-category:${c.name}`,
      label: c.name,
      count: c.value,
      filters: { complaint: true, complaint_category: c.name } as CallFilters,
    })),
  ];
}

/** The two tiles that show an average rather than a count: sort, do not filter. */
export const SORT_ONLY_TILES = {
  compliance: { sort: "compliance", order: "asc" } satisfies CallFilters,
  csat: { sort: "csat", order: "asc" } satisfies CallFilters,
};
