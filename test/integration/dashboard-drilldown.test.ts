/**
 * Every number on the dashboard equals the number of calls its own drill-through returns.
 *
 * This is the test the defect deserved. The tiles and charts are tallies over the generated
 * `call_metrics` field; the drill-through links used to filter on ARAG *labels* of similar names,
 * written by a different agent from the same transcript. The two disagree routinely — the
 * enablement run found "Cross-sell accepted 0 %" linking to ten calls and "Complaint rate 23 %"
 * linking to none — and a figure that contradicts the list behind it is worse than no link at all,
 * because the reader cannot tell which half is lying.
 *
 * `lib/drilldown.ts` defines each figure together with the filter that reproduces it, and this
 * walks the whole enumeration against the live API. A tile added without an entry there is simply
 * untested; a tile added with the wrong filter fails here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Dashboard } from "@/lib/aggregate";
import { callsHref, dashboardFigures } from "@/lib/drilldown";
import { makeClient, startAppServer, type TestClient, type TestServer } from "../helpers/server";

let server: TestServer;
let api: TestClient;
let dash: Dashboard;

beforeAll(async () => {
  server = await startAppServer();
  api = makeClient(server.baseUrl);
  dash = (await api.get<Dashboard>("/api/v1/dashboard")).json;
}, 180_000);

afterAll(async () => {
  await server?.stop();
});

/** `callsHref` returns a page path; the same query drives the API. */
const queryOf = (href: string) => href.replace(/^\/calls\??/, "");

describe("the dashboard drills into what it counted", () => {
  it("has something to check", () => {
    expect(dash.total).toBeGreaterThan(0);
    expect(dash.withMetrics).toBeGreaterThan(0);
    expect(dashboardFigures(dash).length).toBeGreaterThan(6);
  });

  it("matches every figure against the list its link opens", async () => {
    const mismatches: string[] = [];
    for (const figure of dashboardFigures(dash)) {
      const query = queryOf(callsHref(figure.filters));
      const res = await api.get<{ total: number }>(`/api/v1/calls${query ? `?${query}` : ""}`);
      expect(res.status, `${figure.id}: ${query}`).toBe(200);
      if (res.json.total !== figure.count) {
        mismatches.push(
          `${figure.id} ("${figure.label}") shows ${figure.count} but ?${query} returns ${res.json.total}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("reports the counts behind the rates, so a rate can be checked at all", () => {
    const rate = (numerator: number) => numerator / (dash.withMetrics || 1);
    expect(rate(dash.counts.fcr)).toBeCloseTo(dash.fcrRate, 10);
    expect(rate(dash.counts.complaint)).toBeCloseTo(dash.complaintRate, 10);
    expect(rate(dash.counts.escalated)).toBeCloseTo(dash.escalationRate, 10);
    expect(rate(dash.counts.crossSellOffered)).toBeCloseTo(dash.crossSellOfferRate, 10);
    expect(rate(dash.counts.crossSellAccepted)).toBeCloseTo(dash.crossSellAcceptRate, 10);
    // The funnel renders these two, so they have to be the same numbers.
    expect(dash.crossSell.offered).toBe(dash.counts.crossSellOffered);
    expect(dash.crossSell.accepted).toBe(dash.counts.crossSellAccepted);
  });

  it("keeps the date window on the drill-through, so the list covers the same calls", async () => {
    // A window that excludes everything must produce a dashboard of zeroes *and* an empty list —
    // the failure mode being guarded is a figure computed over a window and a link that forgets it.
    const window = "from=2099-01-01T00:00:00.000Z";
    const scoped = (await api.get<Dashboard>(`/api/v1/dashboard?${window}`)).json;
    expect(scoped.total).toBe(0);
    for (const figure of dashboardFigures(scoped)) {
      const query = queryOf(callsHref(figure.filters, `&${window}`));
      const res = await api.get<{ total: number }>(`/api/v1/calls?${query}`);
      expect(res.json.total, `${figure.id} inside an empty window`).toBe(0);
    }
  });

  it("filters on the metric, not on the label of the same name", async () => {
    // The distinction the whole change turns on: `?call_reason=` tests the generated metric and
    // `?label=call_reason/…` tests what the labeler applied. Both are legitimate filters and the
    // API offers both; the dashboard must use the first, because that is what it counted.
    const reason = dash.byReason[0];
    expect(reason, "the sample corpus has at least one classified reason").toBeTruthy();
    const byMetric = await api.get<{ total: number }>(
      `/api/v1/calls?call_reason=${encodeURIComponent(reason?.name ?? "")}`,
    );
    expect(byMetric.json.total).toBe(reason?.value);

    const byLabel = await api.get<{ total: number }>(
      `/api/v1/calls?label=${encodeURIComponent(`call_reason/${reason?.name}`)}`,
    );
    // Not asserted equal: they are allowed to differ, and that they can is the reason this exists.
    expect(byLabel.status).toBe(200);
  });
});
