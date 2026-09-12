import { describe, expect, it } from "vitest";
import { deriveConfidence, deriveConfidenceFromRemi, isDeclinedAnswer } from "@/lib/confidence";

describe("deriveConfidence (citation coverage floor)", () => {
  it("reports no grounding when there are no citation ranges", () => {
    const r = deriveConfidence(200, []);
    expect(r.level).toBe("none");
    expect(r.citationCount).toBe(0);
    expect(r.coveragePct).toBe(0);
  });

  it("merges overlapping ranges rather than double counting coverage", () => {
    const r = deriveConfidence(100, [
      [0, 60],
      [40, 80],
    ]);
    expect(r.coveragePct).toBe(80);
    expect(r.level).toBe("high");
  });

  it("normalises inverted and empty ranges", () => {
    const r = deriveConfidence(100, [
      [60, 20],
      [10, 10],
    ]);
    expect(r.citationCount).toBe(1);
    expect(r.coveragePct).toBe(40);
  });

  it("grades moderate and low coverage", () => {
    expect(deriveConfidence(100, [[0, 20]]).level).toBe("moderate");
    expect(deriveConfidence(100, [[0, 5]]).level).toBe("low");
  });

  it("never divides by zero for an empty answer", () => {
    expect(deriveConfidence(0, [[0, 10]]).coveragePct).toBe(0);
  });
});

describe("deriveConfidenceFromRemi", () => {
  it("returns null when REMi produced no usable score", () => {
    expect(deriveConfidenceFromRemi({ answerRelevance: null, groundedness: null, contextRelevance: null }, 2)).toBeNull();
  });

  it("takes the max of relevance and groundedness so synthesis is not punished", () => {
    const r = deriveConfidenceFromRemi({ answerRelevance: 5, groundedness: 2, contextRelevance: 3 }, 3);
    expect(r?.level).toBe("high");
  });

  it("buckets moderate and low scores", () => {
    expect(deriveConfidenceFromRemi({ answerRelevance: 2.5, groundedness: null, contextRelevance: null }, 1)?.level).toBe("moderate");
    expect(deriveConfidenceFromRemi({ answerRelevance: 1, groundedness: null, contextRelevance: null }, 1)?.level).toBe("low");
    expect(deriveConfidenceFromRemi({ answerRelevance: 0, groundedness: 0, contextRelevance: null }, 1)?.level).toBe("none");
  });
});

describe("isDeclinedAnswer", () => {
  it("detects ARAG's own honest refusal", () => {
    expect(isDeclinedAnswer("Not enough data to answer this.")).toBe(true);
    expect(isDeclinedAnswer("not enough data to answer this")).toBe(true);
  });

  it("does not flag a real answer", () => {
    expect(isDeclinedAnswer("The member was charged twice for the June premium.")).toBe(false);
  });
});
