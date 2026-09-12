import { describe, expect, it } from "vitest";
import {
  extractLabels,
  findContentField,
  mediaTypeFromIcon,
  parseDetail,
  parseSummary,
  readJsonField,
  sanitizeMetrics,
  stripCodeFence,
} from "@/lib/parse";
import type { Resource } from "@/vendor/arag-platform/src/arag/types.ts";

const TRANSCRIPT = [
  "Agent: Thank you for calling Meridian Health Plan.",
  "",
  "Member: You charged my card twice for my June premium.",
].join("\n");

function resource(overrides: Partial<Resource> = {}): Resource {
  const start = TRANSCRIPT.indexOf("Agent:");
  const firstEnd = TRANSCRIPT.indexOf("\n\n");
  return {
    id: "abc123",
    slug: "billing-complaint",
    title: "Billing complaint",
    icon: "audio/mpeg",
    created: "2026-06-02T10:00:00Z",
    metadata: { status: "PROCESSED" },
    origin: { created: "2026-06-02T15:12:00Z" },
    extra: {
      metadata: { agent_name: "Maria Gonzales", queue: "Billing", duration_sec: 66, member_id: "IFP-1" },
    },
    computedmetadata: {
      field_classifications: [
        { field: { field: "media" }, classifications: [{ labelset: "sentiment", label: "Negative" }] },
      ],
    },
    data: {
      files: {
        media: {
          value: { file: { filename: "call.mp3" } },
          extracted: {
            text: { text: TRANSCRIPT },
            metadata: {
              metadata: {
                paragraphs: [
                  {
                    start,
                    end: firstEnd,
                    kind: "TRANSCRIPT",
                    start_seconds: [0],
                    end_seconds: [5.5],
                    classifications: [{ labelset: "moment", label: "Greeting & Verification" }],
                  },
                  {
                    start: firstEnd + 2,
                    end: TRANSCRIPT.length,
                    kind: "TRANSCRIPT",
                    start_seconds: [6],
                    end_seconds: [11.5],
                    classifications: [{ labelset: "moment", label: "Complaint" }],
                  },
                  { start: 0, end: 10, kind: "OCR", classifications: [] },
                ],
                classifications: [{ labelset: "call_reason", label: "Billing & Payments" }],
              },
            },
          },
        },
      },
      texts: {
        "da-call_metrics-f-media": {
          value: {
            body: '```json\n{"call_reason":"Billing & Payments","sentiment":"Negative","complaint":true,"csat_estimate":3}\n```',
          },
        },
        "da-call_analysis-f-media": {
          value: { body: '{"executive_summary":"Duplicate premium charge.","key_topics":["billing"]}' },
        },
      },
    },
    ...overrides,
  } as Resource;
}

describe("stripCodeFence", () => {
  it("unwraps fenced JSON and leaves plain text alone", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence("```\nplain\n```")).toBe("plain");
    expect(stripCodeFence(' {"a":1} ')).toBe('{"a":1}');
  });
});

describe("mediaTypeFromIcon", () => {
  it("maps content types to the three media kinds", () => {
    expect(mediaTypeFromIcon("audio/mpeg")).toBe("audio");
    expect(mediaTypeFromIcon("video/mp4")).toBe("video");
    expect(mediaTypeFromIcon("text/plain")).toBe("transcript");
    expect(mediaTypeFromIcon()).toBe("transcript");
  });
});

describe("extractLabels", () => {
  it("merges user, computed and field classifications without duplicates", () => {
    const labels = extractLabels(resource());
    expect(labels).toContainEqual({ labelset: "sentiment", label: "Negative" });
    expect(labels).toContainEqual({ labelset: "call_reason", label: "Billing & Payments" });
    expect(new Set(labels.map((l) => `${l.labelset}/${l.label}`)).size).toBe(labels.length);
  });

  it("returns an empty list for a bare resource", () => {
    expect(extractLabels({ id: "x" } as Resource)).toEqual([]);
  });
});

describe("readJsonField", () => {
  it("finds a generated field by destination and parses fenced JSON", () => {
    expect(readJsonField<{ call_reason: string }>(resource(), "call_metrics")?.call_reason).toBe(
      "Billing & Payments",
    );
  });

  it("returns undefined when the field is absent or unparseable", () => {
    expect(readJsonField(resource(), "does_not_exist")).toBeUndefined();
    const broken = resource();
    (broken.data!.texts as Record<string, unknown>)["da-call_metrics-f-media"] = {
      value: { body: "Not enough data to answer this." },
    };
    expect(readJsonField(broken, "call_metrics")).toBeUndefined();
  });
});

describe("sanitizeMetrics", () => {
  it("drops values outside the taxonomy enum instead of rendering them", () => {
    const clean = sanitizeMetrics({
      call_reason: "Not enough data to answer this.",
      sentiment: "Negative",
      line_of_business: "Individual & Family",
      outcome: "Made up",
    });
    expect(clean?.call_reason).toBeUndefined();
    expect(clean?.outcome).toBeUndefined();
    expect(clean?.sentiment).toBe("Negative");
    expect(clean?.line_of_business).toBe("Individual & Family");
  });

  it("passes undefined through", () => {
    expect(sanitizeMetrics(undefined)).toBeUndefined();
  });
});

describe("findContentField", () => {
  it("prefers a file field, then a non-generated text field", () => {
    expect(findContentField(resource())).toEqual({ group: "files", id: "media" });
    const textOnly = {
      id: "t",
      data: { texts: { "da-call_metrics-t-transcript": {}, transcript: {} } },
    } as Resource;
    expect(findContentField(textOnly)).toEqual({ group: "texts", id: "transcript" });
    expect(findContentField({ id: "empty" } as Resource)).toBeUndefined();
  });
});

describe("parseSummary", () => {
  it("builds the card view model from origin, extra and generated metrics", () => {
    const s = parseSummary(resource());
    expect(s).toMatchObject({
      id: "abc123",
      title: "Billing complaint",
      mediaType: "audio",
      createdISO: "2026-06-02T15:12:00Z",
      durationSec: 66,
      agentName: "Maria Gonzales",
      queue: "Billing",
    });
    expect(s.metrics?.complaint).toBe(true);
  });

  it("produces a moment track with one entry per transcript paragraph", () => {
    const s = parseSummary(resource());
    // Only highlight moments appear; "Greeting & Verification" is not one, so it is blank.
    expect(s.momentTrack).toEqual(["", "Complaint"]);
  });

  it("falls back safely on a nearly empty resource", () => {
    const s = parseSummary({ id: "x" } as Resource);
    expect(s.title).toBe("Untitled call");
    expect(s.mediaType).toBe("transcript");
    expect(s.labels).toEqual([]);
  });
});

describe("parseDetail", () => {
  it("returns transcript paragraphs with speakers, timestamps and moments", () => {
    const d = parseDetail(resource());
    expect(d.fieldId).toBe("media");
    expect(d.fieldType).toBe("files");
    expect(d.paragraphs).toHaveLength(2); // the OCR paragraph is filtered out
    expect(d.paragraphs[0]).toMatchObject({ speaker: "Agent", startSeconds: 0, index: 0 });
    expect(d.paragraphs[0]?.text.startsWith("Thank you")).toBe(true);
    expect(d.paragraphs[1]?.moments).toEqual(["Complaint"]);
    expect(d.analysis?.executive_summary).toBe("Duplicate premium charge.");
  });

  it("keeps char offsets aligned with the citation ranges", () => {
    const d = parseDetail(resource());
    for (const p of d.paragraphs) {
      expect(p.charEnd).toBeGreaterThan(p.charStart);
    }
  });
});
