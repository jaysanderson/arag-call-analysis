import { describe, expect, it } from "vitest";
import { AGENTS } from "@/lib/domain/taxonomy";
import type { CallSummary } from "@/lib/types";
import { classifyAgents } from "@/services/agents";
import { filterByLabels, MEDIA_FIELD_ALLOWLIST, mediaTypeFor } from "@/services/calls";
import { orderFacets, toView } from "@/services/labelsets";

const base = (id: string, labels: Array<[string, string]>): CallSummary => ({
  id,
  slug: id,
  title: id,
  icon: "text/plain",
  mediaType: "transcript",
  labels: labels.map(([labelset, label]) => ({ labelset, label })),
});

describe("filterByLabels", () => {
  const calls = [
    base("a", [
      ["call_reason", "Claims"],
      ["sentiment", "Negative"],
    ]),
    base("b", [
      ["call_reason", "Claims"],
      ["sentiment", "Positive"],
    ]),
    base("c", [["call_reason", "Billing & Payments"]]),
  ];

  it("returns everything when no facet is selected", () => {
    expect(filterByLabels(calls, [])).toHaveLength(3);
  });

  it("ANDs across facets", () => {
    expect(filterByLabels(calls, ["call_reason/Claims"]).map((c) => c.id)).toEqual(["a", "b"]);
    expect(filterByLabels(calls, ["call_reason/Claims", "sentiment/Positive"]).map((c) => c.id)).toEqual([
      "b",
    ]);
  });

  it("handles labels containing a slash", () => {
    const withSlash = [base("d", [["moment", "Sensitive / PII"]])];
    expect(filterByLabels(withSlash, ["moment/Sensitive / PII"])).toHaveLength(1);
  });

  it("ignores malformed filters rather than returning nothing", () => {
    expect(filterByLabels(calls, ["garbage"])).toHaveLength(3);
    expect(filterByLabels(calls, ["/leading"])).toHaveLength(3);
  });
});

describe("mediaTypeFor", () => {
  it("classifies uploads", () => {
    expect(mediaTypeFor({ title: "t", transcript: "x" })).toBe("transcript");
    expect(
      mediaTypeFor({
        title: "t",
        recording: { bytes: new Uint8Array(), filename: "a.mp3", contentType: "audio/mpeg" },
      }),
    ).toBe("audio");
    expect(
      mediaTypeFor({
        title: "t",
        recording: { bytes: new Uint8Array(), filename: "a.mp4", contentType: "video/mp4" },
      }),
    ).toBe("video");
  });
});

describe("MEDIA_FIELD_ALLOWLIST", () => {
  it("is exactly media and transcript", () => {
    expect([...MEDIA_FIELD_ALLOWLIST]).toEqual(["media", "transcript"]);
  });
});

describe("classifyAgents", () => {
  it("maps KB task buckets onto the three product agents", () => {
    const status = classifyAgents({
      running: [{ id: "1", parameters: { name: "resource-labeler" } }],
      done: [{ id: "2", parameters: { name: "call-insights" }, completed: true }],
      configs: [{ id: "3", parameters: { name: "paragraph-labeler" } }],
    });
    expect(status.map((s) => s.state)).toEqual(["running", "configured", "completed"]);
    expect(status[0]?.taskId).toBe("1");
  });

  it("reports absent agents rather than omitting them", () => {
    const status = classifyAgents({});
    expect(status).toHaveLength(AGENTS.length);
    expect(status.every((s) => s.state === "absent")).toBe(true);
  });

  it("marks a failed task as failed", () => {
    const status = classifyAgents({
      done: [{ id: "9", parameters: { name: "call-insights" }, failed: true }],
    });
    expect(status.find((s) => s.key === "call-insights")?.state).toBe("failed");
  });
});

describe("labelset views", () => {
  it("flattens a KB labelset into the facet view", () => {
    expect(
      toView("call_reason", {
        title: "Call Reason",
        multiple: false,
        kind: ["RESOURCES"],
        labels: [{ title: "Claims" }],
      }),
    ).toEqual({
      id: "call_reason",
      title: "Call Reason",
      color: undefined,
      multiple: false,
      kind: ["RESOURCES"],
      labels: ["Claims"],
    });
  });

  it("falls back to the id when the labelset has no title", () => {
    expect(toView("moment", { title: "" }).title).toBe("moment");
  });

  it("orders the known facets first and the rest alphabetically", () => {
    const ordered = orderFacets(
      ["zzz", "sentiment", "call_reason", "aaa"].map((id) => toView(id, { title: id })),
    );
    expect(ordered.map((l) => l.id)).toEqual(["call_reason", "sentiment", "aaa", "zzz"]);
  });
});
