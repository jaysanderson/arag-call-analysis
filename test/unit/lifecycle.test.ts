/**
 * The call lifecycle derivation — every state and every combination that produces it.
 *
 * This file exists because the first version of `deriveLifecycle` accepted an `analysis` argument
 * and never read it, so a call whose metrics agent finished before its narrative agent reported
 * itself "Analysed". Nothing caught it: the type-checker was satisfied, the e2e suite only
 * asserted that *some* row said "Analysed", and the bug is invisible until a real Knowledge Box
 * runs the two agents at different speeds. The table below is exhaustive over the inputs so the
 * same class of hole cannot reopen.
 */
import { describe, expect, it } from "vitest";
import type { LifecycleInput } from "@/lib/lifecycle";
import { CALL_LIFECYCLES, deriveLifecycle, isInFlight, LIFECYCLE_COPY } from "@/lib/lifecycle";

const LABEL = [{ labelset: "call_reason", label: "Claims" }];
const METRICS = { call_reason: "Claims" };
const NARRATIVE = { executive_summary: "The member called about a claim." };

function call(over: Partial<LifecycleInput> = {}): LifecycleInput {
  return { status: "PROCESSED", labels: [], ...over };
}

describe("deriveLifecycle", () => {
  it("reports a failed ingest job as failed, whatever the Knowledge Box says", () => {
    expect(deriveLifecycle(call({ labels: LABEL, metrics: METRICS }), "failed")).toBe("failed");
    expect(deriveLifecycle(call({ status: "PENDING" }), "failed")).toBe("failed");
  });

  it("reports an ARAG processing error as failed", () => {
    expect(deriveLifecycle(call({ status: "ERROR" }))).toBe("failed");
    expect(deriveLifecycle(call({ status: "error" }))).toBe("failed");
  });

  it("reports a queued ingest job as queued", () => {
    expect(deriveLifecycle(call(), "queued")).toBe("queued");
  });

  it("reports a call the Knowledge Box is still processing as transcribing", () => {
    expect(deriveLifecycle(call({ status: "PENDING" }))).toBe("transcribing");
    expect(deriveLifecycle(call({ status: "PROCESSING" }))).toBe("transcribing");
    // Even a running job does not override what the Knowledge Box is actually doing.
    expect(deriveLifecycle(call({ status: "PENDING" }), "running")).toBe("transcribing");
  });

  it("reports a processed call with no labels and no metrics as labelling", () => {
    expect(deriveLifecycle(call())).toBe("labelling");
    expect(deriveLifecycle(call({ analysis: null }))).toBe("labelling");
  });

  it("reports labels without metrics as partly analysed", () => {
    expect(deriveLifecycle(call({ labels: LABEL }))).toBe("partial");
  });

  /**
   * The regression this file was written for: metrics present, narrative looked for and absent.
   * `analysis: null` is the signal that the caller *did* look.
   */
  it("reports metrics without the written narrative as partly analysed", () => {
    expect(deriveLifecycle(call({ labels: LABEL, metrics: METRICS, analysis: null }))).toBe("partial");
    expect(deriveLifecycle(call({ labels: LABEL, metrics: METRICS, analysis: {} }))).toBe("partial");
    expect(
      deriveLifecycle(call({ labels: LABEL, metrics: METRICS, analysis: { executive_summary: "" } })),
    ).toBe("partial");
  });

  /**
   * A summary read never fetches the narrative, so `analysis: undefined` must not demote every
   * call in the table to "partly analysed" — otherwise the list would contradict the detail page.
   */
  it("does not demote a summary read that never looked for a narrative", () => {
    expect(deriveLifecycle(call({ labels: LABEL, metrics: METRICS }))).toBe("analysed");
  });

  it("reports labels, metrics and a narrative together as analysed", () => {
    expect(deriveLifecycle(call({ labels: LABEL, metrics: METRICS, analysis: NARRATIVE }))).toBe("analysed");
  });

  it("treats metrics with no call reason as no metrics at all", () => {
    // `sanitizeMetrics` drops values that fail the taxonomy check, so a metrics object can survive
    // with nothing usable in it.
    expect(deriveLifecycle(call({ labels: LABEL, metrics: { csat_estimate: 4 } }))).toBe("partial");
  });

  it("only ever returns a declared state", () => {
    const inputs: Array<[LifecycleInput, string | undefined]> = [
      [call(), undefined],
      [call(), "queued"],
      [call(), "failed"],
      [call({ status: "PENDING" }), undefined],
      [call({ status: "ERROR" }), undefined],
      [call({ labels: LABEL }), undefined],
      [call({ labels: LABEL, metrics: METRICS }), undefined],
      [call({ labels: LABEL, metrics: METRICS, analysis: null }), undefined],
      [call({ labels: LABEL, metrics: METRICS, analysis: NARRATIVE }), undefined],
    ];
    for (const [input, job] of inputs) {
      expect(CALL_LIFECYCLES).toContain(deriveLifecycle(input, job));
    }
  });
});

describe("lifecycle copy and flags", () => {
  it("gives every state a label and a next step", () => {
    for (const state of CALL_LIFECYCLES) {
      const copy = LIFECYCLE_COPY[state];
      expect(copy.label.length).toBeGreaterThan(0);
      // Colour is never the only signal, and a state chip must say what to do about it.
      expect(copy.hint.length).toBeGreaterThan(10);
    }
  });

  it("marks exactly the states that are still moving as in flight", () => {
    expect(CALL_LIFECYCLES.filter(isInFlight)).toEqual(["queued", "transcribing", "labelling"]);
  });
});
