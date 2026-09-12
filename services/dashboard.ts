/**
 * Dashboard aggregation over each call's generated `call_metrics` field.
 *
 * Pure aggregation (`aggregate`) is separated from I/O (`dashboard`) so it is unit-testable and so
 * the server component and the API produce byte-identical numbers.
 */
import type { Runtime } from "@/lib/runtime";
import type { CallMetrics, CallSummary } from "@/lib/types";
import { cacheKeys } from "./cache";
import { allSummaries } from "./calls";

export type Datum = { name: string; value: number };

export interface Dashboard {
  total: number;
  withMetrics: number;
  fcrRate: number;
  complaintRate: number;
  crossSellOfferRate: number;
  crossSellAcceptRate: number;
  escalationRate: number;
  avgCompliance: number;
  avgCsat: number;
  byReason: Datum[];
  bySentiment: Datum[];
  byOutcome: Datum[];
  byLob: Datum[];
  complaintsByCategory: Datum[];
  crossSell: { offered: number; accepted: number };
  recent: CallSummary[];
}

export function tally(items: (string | undefined | null)[]): Datum[] {
  const m = new Map<string, number>();
  for (const it of items) {
    if (!it) continue;
    m.set(it, (m.get(it) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Aggregate a set of call summaries into the dashboard view model. */
export function aggregate(calls: CallSummary[], recentLimit = 8): Dashboard {
  const metrics: CallMetrics[] = calls.map((c) => c.metrics).filter((m): m is CallMetrics => !!m);
  const n = metrics.length || 1;
  const count = (pred: (m: CallMetrics) => boolean | undefined) => metrics.filter((m) => pred(m)).length;
  const avg = (sel: (m: CallMetrics) => number | undefined) => {
    const vals = metrics.map(sel).filter((v): v is number => typeof v === "number");
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  };
  const byCreated = [...calls].sort((a, b) => (b.createdISO ?? "").localeCompare(a.createdISO ?? ""));

  return {
    total: calls.length,
    withMetrics: metrics.length,
    fcrRate: count((m) => m.first_call_resolution) / n,
    complaintRate: count((m) => m.complaint) / n,
    crossSellOfferRate: count((m) => m.cross_sell_offered) / n,
    crossSellAcceptRate: count((m) => m.cross_sell_accepted) / n,
    escalationRate: count((m) => m.escalated) / n,
    avgCompliance: avg((m) => m.compliance_score),
    avgCsat: avg((m) => m.csat_estimate),
    byReason: tally(metrics.map((m) => m.call_reason)),
    bySentiment: tally(metrics.map((m) => m.sentiment)),
    byOutcome: tally(metrics.map((m) => m.outcome)),
    byLob: tally(metrics.map((m) => m.line_of_business)),
    complaintsByCategory: tally(metrics.filter((m) => m.complaint).map((m) => m.complaint_category)),
    crossSell: {
      offered: count((m) => m.cross_sell_offered),
      accepted: count((m) => m.cross_sell_accepted),
    },
    recent: byCreated.slice(0, recentLimit),
  };
}

/** Cached dashboard: one catalog walk + cached per-call summaries, not N+1 per view. */
export async function dashboard(rt: Runtime): Promise<Dashboard> {
  return rt.cache.getOrLoad(cacheKeys.dashboard(), async () => aggregate(await allSummaries(rt)));
}
