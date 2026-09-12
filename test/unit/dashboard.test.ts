import { describe, expect, it } from "vitest";
import type { CallMetrics, CallSummary } from "@/lib/types";
import { aggregate, tally } from "@/services/dashboard";

function call(id: string, metrics?: CallMetrics, createdISO?: string): CallSummary {
  return {
    id,
    slug: id,
    title: `Call ${id}`,
    icon: "audio/mpeg",
    mediaType: "audio",
    createdISO,
    labels: [],
    metrics,
  };
}

const complaintCall = call(
  "1",
  {
    call_reason: "Billing & Payments",
    outcome: "Follow-up Required",
    sentiment: "Negative",
    line_of_business: "Individual & Family",
    complaint: true,
    complaint_category: "Billing error",
    cross_sell_offered: true,
    cross_sell_accepted: false,
    csat_estimate: 3,
    compliance_score: 96,
    first_call_resolution: false,
    escalated: false,
  },
  "2026-06-02T10:00:00Z",
);

const happyCall = call(
  "2",
  {
    call_reason: "Benefits & Coverage",
    outcome: "Resolved",
    sentiment: "Positive",
    line_of_business: "Medicare Advantage",
    complaint: false,
    cross_sell_offered: true,
    cross_sell_accepted: true,
    csat_estimate: 5,
    compliance_score: 100,
    first_call_resolution: true,
    escalated: false,
  },
  "2026-06-05T10:00:00Z",
);

describe("tally", () => {
  it("counts and sorts by frequency then name", () => {
    expect(tally(["a", "b", "a", undefined, null, "c", "b", "a"])).toEqual([
      { name: "a", value: 3 },
      { name: "b", value: 2 },
      { name: "c", value: 1 },
    ]);
  });

  it("ignores empty values so a dropped enum never becomes a category", () => {
    expect(tally([undefined, null, ""])).toEqual([]);
  });
});

describe("aggregate", () => {
  it("computes rates over calls that actually have metrics", () => {
    const d = aggregate([complaintCall, happyCall, call("3")]);
    expect(d.total).toBe(3);
    expect(d.withMetrics).toBe(2);
    expect(d.fcrRate).toBe(0.5);
    expect(d.complaintRate).toBe(0.5);
    expect(d.crossSellOfferRate).toBe(1);
    expect(d.crossSellAcceptRate).toBe(0.5);
    expect(d.escalationRate).toBe(0);
  });

  it("averages scores, ignoring calls without them", () => {
    const d = aggregate([complaintCall, happyCall, call("3")]);
    expect(d.avgCompliance).toBe(98);
    expect(d.avgCsat).toBe(4);
  });

  it("never divides by zero on an empty knowledge box", () => {
    const d = aggregate([]);
    expect(d.total).toBe(0);
    expect(d.fcrRate).toBe(0);
    expect(d.avgCsat).toBe(0);
    expect(d.byReason).toEqual([]);
    expect(d.recent).toEqual([]);
  });

  it("groups by reason, sentiment, outcome and line of business", () => {
    const d = aggregate([complaintCall, happyCall]);
    expect(d.byReason).toEqual([
      { name: "Benefits & Coverage", value: 1 },
      { name: "Billing & Payments", value: 1 },
    ]);
    expect(d.bySentiment.map((x) => x.name).sort()).toEqual(["Negative", "Positive"]);
    expect(d.byOutcome).toHaveLength(2);
    expect(d.byLob).toHaveLength(2);
  });

  it("counts complaint categories only for complaint calls", () => {
    const d = aggregate([complaintCall, happyCall]);
    expect(d.complaintsByCategory).toEqual([{ name: "Billing error", value: 1 }]);
  });

  it("reports the cross-sell funnel", () => {
    const d = aggregate([complaintCall, happyCall]);
    expect(d.crossSell).toEqual({ offered: 2, accepted: 1 });
  });

  it("returns the most recent calls first, honouring the limit", () => {
    const d = aggregate([complaintCall, happyCall], 1);
    expect(d.recent).toHaveLength(1);
    expect(d.recent[0]?.id).toBe("2");
  });

  it("sorts undated calls last rather than throwing", () => {
    const d = aggregate([call("x"), happyCall]);
    expect(d.recent[0]?.id).toBe("2");
  });
});
