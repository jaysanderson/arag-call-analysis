import { describe, expect, it } from "vitest";
import { contextTextsFrom, reduceRemi } from "@/services/ask";

describe("reduceRemi", () => {
  it("takes the best grounding context, not the average", () => {
    const r = reduceRemi({ answer_relevance: { score: 4 }, groundedness: [1, 4, 2], context_relevance: [4, 2] });
    expect(r.answerRelevance).toBe(4);
    expect(r.groundedness).toBe(4);
    expect(r.contextRelevance).toBe(3);
  });

  it("ignores nulls in the arrays", () => {
    const r = reduceRemi({ answer_relevance: null, groundedness: [null, 3], context_relevance: [null, null] });
    expect(r.answerRelevance).toBeNull();
    expect(r.groundedness).toBe(3);
    expect(r.contextRelevance).toBeNull();
  });

  it("survives a completely empty response", () => {
    expect(reduceRemi({})).toEqual({ answerRelevance: null, groundedness: null, contextRelevance: null });
  });

  it("averages only the five most relevant contexts", () => {
    const r = reduceRemi({ context_relevance: [5, 5, 5, 5, 5, 0, 0, 0] });
    expect(r.contextRelevance).toBe(5);
  });
});

describe("contextTextsFrom", () => {
  it("flattens every retrieved paragraph in order", () => {
    const texts = contextTextsFrom({
      resources: {
        r1: {
          fields: {
            "/t/transcript": {
              paragraphs: { a: { text: "first" }, b: { text: "second" } },
            },
          },
        },
      },
    });
    expect(texts).toEqual(["first", "second"]);
  });

  it("skips empty paragraphs and handles an empty retrieval", () => {
    expect(contextTextsFrom({})).toEqual([]);
    expect(
      contextTextsFrom({ resources: { r: { fields: { f: { paragraphs: { a: { text: "  " } } } } } } }),
    ).toEqual([]);
  });
});
