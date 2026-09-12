/**
 * The pure logic behind the calls data table: structural filters, column sorting and facet
 * tallies, plus the CSV/JSON export rendering. All of it runs without a server or a Knowledge Box.
 */
import { describe, expect, it } from "vitest";
import type { CallSummary } from "@/lib/types";
import { facetsFor, filterByAttributes, filterByLabels, sortCalls } from "@/services/calls";
import { csvCell, EXPORT_COLUMNS, exportFilename, toCsv, toJson } from "@/services/export";

function call(over: Partial<CallSummary> = {}): CallSummary {
  return {
    id: over.id ?? "c1",
    slug: "slug",
    title: "A call",
    icon: "text/plain",
    mediaType: "transcript",
    createdISO: "2026-06-10T09:00:00.000Z",
    durationSec: 120,
    agentName: "Sofia Marchetti",
    queue: "Billing",
    labels: [],
    ...over,
  };
}

const rows: CallSummary[] = [
  call({
    id: "a",
    title: "Zebra billing question",
    createdISO: "2026-06-01T09:00:00.000Z",
    durationSec: 300,
    agentName: "Alice Ng",
    queue: "Billing",
    mediaType: "audio",
    labels: [
      { labelset: "sentiment", label: "Negative" },
      { labelset: "call_reason", label: "Billing & Payments" },
    ],
    metrics: { sentiment: "Negative", complaint: true, compliance_score: 40, csat_estimate: 2 },
  }),
  call({
    id: "b",
    title: "apple coverage query",
    createdISO: "2026-06-05T09:00:00.000Z",
    durationSec: 60,
    agentName: "Bob Reed",
    queue: "Claims",
    mediaType: "video",
    labels: [
      { labelset: "sentiment", label: "Positive" },
      { labelset: "call_reason", label: "Benefits & Coverage" },
    ],
    metrics: {
      sentiment: "Positive",
      complaint: false,
      first_call_resolution: true,
      compliance_score: 95,
      csat_estimate: 5,
    },
  }),
  call({
    id: "c",
    title: "Mango enrolment",
    createdISO: "2026-06-09T09:00:00.000Z",
    durationSec: 180,
    agentName: "Alice Ng",
    queue: "Enrollment",
    mediaType: "transcript",
    labels: [{ labelset: "sentiment", label: "Neutral" }],
    metrics: { sentiment: "Neutral", escalated: true, compliance_score: 70 },
  }),
];

describe("filterByAttributes", () => {
  it("narrows by agent, queue and media type", () => {
    expect(filterByAttributes(rows, { agent: "Alice Ng" }).map((c) => c.id)).toEqual(["a", "c"]);
    expect(filterByAttributes(rows, { queue: "Claims" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterByAttributes(rows, { mediaType: "video" }).map((c) => c.id)).toEqual(["b"]);
  });

  it("applies inclusive ISO date bounds", () => {
    const within = filterByAttributes(rows, {
      from: "2026-06-02T00:00:00.000Z",
      to: "2026-06-09T23:59:59.000Z",
    });
    expect(within.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("applies duration bounds", () => {
    expect(filterByAttributes(rows, { minDuration: 100, maxDuration: 200 }).map((c) => c.id)).toEqual(["c"]);
  });

  it("treats a missing metric as false rather than dropping the row silently", () => {
    // `b` has complaint:false, `c` has no complaint key at all — both are "not a complaint".
    expect(filterByAttributes(rows, { complaint: false }).map((c) => c.id)).toEqual(["b", "c"]);
    expect(filterByAttributes(rows, { complaint: true }).map((c) => c.id)).toEqual(["a"]);
    expect(filterByAttributes(rows, { fcr: true }).map((c) => c.id)).toEqual(["b"]);
    expect(filterByAttributes(rows, { escalated: true }).map((c) => c.id)).toEqual(["c"]);
  });

  it("restricts to an explicit id selection", () => {
    expect(filterByAttributes(rows, { ids: ["c", "a"] }).map((c) => c.id)).toEqual(["a", "c"]);
    // An empty selection is "no selection", not "select nothing".
    expect(filterByAttributes(rows, { ids: [] })).toHaveLength(3);
  });
});

describe("sortCalls", () => {
  it("defaults to newest first", () => {
    expect(sortCalls(rows).map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts titles case-insensitively", () => {
    expect(sortCalls(rows, "title", "asc").map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts duration, compliance and csat numerically", () => {
    expect(sortCalls(rows, "duration", "asc").map((c) => c.durationSec)).toEqual([60, 180, 300]);
    expect(sortCalls(rows, "compliance", "desc").map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(sortCalls(rows, "csat", "desc").map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("treats sentiment as ordinal, worst first when ascending", () => {
    expect(sortCalls(rows, "sentiment", "asc").map((c) => c.metrics?.sentiment)).toEqual([
      "Negative",
      "Neutral",
      "Positive",
    ]);
  });

  it("does not mutate its input", () => {
    const before = rows.map((c) => c.id);
    sortCalls(rows, "title", "asc");
    expect(rows.map((c) => c.id)).toEqual(before);
  });

  it("breaks ties on call time so paging is stable", () => {
    const tied = [
      call({ id: "x", title: "same", createdISO: "2026-06-01T00:00:00.000Z" }),
      call({ id: "y", title: "same", createdISO: "2026-06-02T00:00:00.000Z" }),
    ];
    expect(sortCalls(tied, "title", "asc").map((c) => c.id)).toEqual(["y", "x"]);
    expect(sortCalls([...tied].reverse(), "title", "asc").map((c) => c.id)).toEqual(["y", "x"]);
  });
});

describe("facetsFor", () => {
  it("tallies labels per labelset, most common first", () => {
    const facets = facetsFor([...rows, rows[0]!]);
    const sentiment = facets.filter((f) => f.labelset === "sentiment");
    expect(sentiment[0]).toEqual({ labelset: "sentiment", label: "Negative", count: 2 });
    expect(facets.filter((f) => f.labelset === "call_reason")).toHaveLength(2);
  });

  it("returns nothing for calls with no labels", () => {
    expect(facetsFor([call()])).toEqual([]);
  });
});

describe("filterByLabels", () => {
  it("ANDs across facets", () => {
    expect(filterByLabels(rows, ["sentiment/Negative"]).map((c) => c.id)).toEqual(["a"]);
    expect(filterByLabels(rows, ["sentiment/Negative", "call_reason/Benefits & Coverage"])).toEqual([]);
  });

  it("ignores a malformed filter rather than returning nothing", () => {
    expect(filterByLabels(rows, ["nonsense"])).toHaveLength(3);
  });
});

describe("export", () => {
  it("quotes separators and newlines per RFC 4180", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('has "quotes", commas')).toBe('"has ""quotes"", commas"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(undefined)).toBe("");
  });

  it("neutralises spreadsheet formula injection", () => {
    // A transcript line starting with = would otherwise be executed by a spreadsheet.
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
  });

  it("writes one header row and one row per call", () => {
    const csv = toCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(rows.length + 1);
    expect(lines[0]).toBe(EXPORT_COLUMNS.map((c) => c.header).join(","));
    expect(lines[1]).toContain("Zebra billing question");
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("renders labels as a pipe-joined list and booleans as words", () => {
    const row = toCsv([rows[0]!]).split("\n")[1]!;
    expect(row).toContain("sentiment/Negative|call_reason/Billing & Payments");
    expect(row).toContain("true");
  });

  it("wraps JSON exports in a dated envelope", () => {
    const parsed = JSON.parse(toJson(rows)) as { count: number; calls: CallSummary[]; exportedISO: string };
    expect(parsed.count).toBe(3);
    expect(parsed.calls[0]!.id).toBe("a");
    expect(Number.isNaN(Date.parse(parsed.exportedISO))).toBe(false);
  });

  it("dates the filename so two exports do not collide", () => {
    expect(exportFilename("csv")).toMatch(/^calls-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(exportFilename("json", "call")).toMatch(/^call-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
