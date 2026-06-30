import { catalog, find, getResource } from "./arag";
import { parseDetail, parseSummary } from "./parse";
import type { CallSummary, CallDetail, CallMetrics } from "./types";

// Light show set for list/dashboard: basic (incl. computedmetadata labels),
// values (generated JSON fields), extra (call metadata). No paragraphs.
const SUMMARY_SHOW = ["basic", "values", "extra"];
// Full set for the detail page.
const DETAIL_SHOW = ["basic", "values", "extracted", "origin", "extra"];

async function allResourceIds(): Promise<string[]> {
  const d: any = await catalog({ page_size: 200 });
  return Object.keys(d.resources ?? {});
}

async function summariesFor(ids: string[]): Promise<CallSummary[]> {
  const results = await Promise.all(
    ids.map((id) =>
      getResource(id, SUMMARY_SHOW, ["metadata"]).then(parseSummary).catch(() => null),
    ),
  );
  return results.filter((c): c is CallSummary => !!c);
}

export async function listCalls({ query, labels }: { query?: string; labels?: string[] }): Promise<CallSummary[]> {
  let ids: string[];
  if (query && query.trim()) {
    const f: any = await find({ query, features: ["keyword", "semantic"], top_k: 60 });
    ids = Object.keys(f.resources ?? {});
  } else {
    ids = await allResourceIds();
  }
  let calls = await summariesFor(ids);

  if (labels && labels.length) {
    const wanted = labels.map((l) => {
      const i = l.indexOf("/");
      return { labelset: l.slice(0, i), label: l.slice(i + 1) };
    });
    calls = calls.filter((c) =>
      wanted.every((w) => c.labels.some((l) => l.labelset === w.labelset && l.label === w.label)),
    );
  }

  calls.sort((a, b) => (b.createdISO ?? "").localeCompare(a.createdISO ?? ""));
  return calls;
}

export async function getCall(id: string): Promise<CallDetail> {
  const res = await getResource(id, DETAIL_SHOW, ["text", "metadata"]);
  return parseDetail(res);
}

// ---- Dashboard aggregation over each call's call_metrics JSON ----

export type Dashboard = {
  total: number;
  withMetrics: number;
  fcrRate: number;
  complaintRate: number;
  crossSellOfferRate: number;
  crossSellAcceptRate: number;
  escalationRate: number;
  avgCompliance: number;
  avgCsat: number;
  byReason: { name: string; value: number }[];
  bySentiment: { name: string; value: number }[];
  byOutcome: { name: string; value: number }[];
  byLob: { name: string; value: number }[];
  complaintsByCategory: { name: string; value: number }[];
  crossSell: { offered: number; accepted: number };
  recent: CallSummary[];
};

function tally(items: (string | undefined | null)[]): { name: string; value: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    if (!it) continue;
    m.set(it, (m.get(it) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export async function dashboard(): Promise<Dashboard> {
  const ids = await allResourceIds();
  const calls = await summariesFor(ids);
  const metrics: CallMetrics[] = calls.map((c) => c.metrics).filter((m): m is CallMetrics => !!m);
  const n = metrics.length || 1;

  const count = (pred: (m: CallMetrics) => boolean | undefined) => metrics.filter((m) => pred(m)).length;
  const avg = (sel: (m: CallMetrics) => number | undefined) => {
    const vals = metrics.map(sel).filter((v): v is number => typeof v === "number");
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  };

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
    crossSell: { offered: count((m) => m.cross_sell_offered), accepted: count((m) => m.cross_sell_accepted) },
    recent: calls.sort((a, b) => (b.createdISO ?? "").localeCompare(a.createdISO ?? "")).slice(0, 8),
  };
}
