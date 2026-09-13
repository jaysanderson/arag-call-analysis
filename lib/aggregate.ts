/**
 * Pure dashboard aggregation over each call's generated `call_metrics` field.
 *
 * It lives in `lib/` with no I/O and no value imports so that the API, the React server components
 * and the Node-run `scripts/smoke.ts` all produce byte-identical numbers from the same code.
 */
import type { CallMetrics, CallSummary } from "./types";

export type Datum = { name: string; value: number };

/**
 * Per-agent / per-queue roll-up — the "who is driving this" answer a supervisor comes to the
 * dashboard for. Rates are computed over the calls in that group that actually carry metrics, so a
 * group with three analysed calls out of five is not reported as 40 % worse than it is.
 */
export interface Rollup {
  name: string;
  calls: number;
  analysed: number;
  fcrRate: number;
  complaintRate: number;
  escalationRate: number;
  avgCsat: number;
  avgCompliance: number;
}

export interface Dashboard {
  total: number;
  withMetrics: number;
  /**
   * The raw counts behind the rates above them.
   *
   * A rate cannot be compared with the length of a filtered list, so the drill-through contract
   * test — which asserts every figure equals the count its own link returns — needs the numerator
   * as well as the ratio. Keeping both here means the screen and the test read the same value
   * rather than one of them recovering it by multiplying and rounding.
   */
  counts: {
    fcr: number;
    complaint: number;
    escalated: number;
    crossSellOffered: number;
    crossSellAccepted: number;
  };
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
  byAgent: Rollup[];
  byQueue: Rollup[];
  recent: CallSummary[];
}

/** Group calls by an attribute and compute the roll-up metrics for each group. */
export function rollup(calls: CallSummary[], by: (c: CallSummary) => string | undefined): Rollup[] {
  const groups = new Map<string, CallSummary[]>();
  for (const c of calls) {
    const key = by(c);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  return [...groups.entries()]
    .map(([name, group]) => {
      const metrics = group.map((c) => c.metrics).filter((m): m is CallMetrics => !!m);
      // Divide by the analysed count, never the group size: an unanalysed call is not a "no".
      const n = metrics.length || 1;
      const rate = (pred: (m: CallMetrics) => boolean | undefined) =>
        metrics.filter((m) => pred(m)).length / n;
      const mean = (sel: (m: CallMetrics) => number | undefined) => {
        const vals = metrics.map(sel).filter((v): v is number => typeof v === "number");
        return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
      };
      return {
        name,
        calls: group.length,
        analysed: metrics.length,
        fcrRate: rate((m) => m.first_call_resolution),
        complaintRate: rate((m) => m.complaint),
        escalationRate: rate((m) => m.escalated),
        avgCsat: mean((m) => m.csat_estimate),
        avgCompliance: mean((m) => m.compliance_score),
      };
    })
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
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

  const counts = {
    fcr: count((m) => m.first_call_resolution),
    complaint: count((m) => m.complaint),
    escalated: count((m) => m.escalated),
    crossSellOffered: count((m) => m.cross_sell_offered),
    crossSellAccepted: count((m) => m.cross_sell_accepted),
  };

  return {
    total: calls.length,
    withMetrics: metrics.length,
    counts,
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
    byAgent: rollup(calls, (c) => c.agentName),
    byQueue: rollup(calls, (c) => c.queue),
    recent: byCreated.slice(0, recentLimit),
  };
}
