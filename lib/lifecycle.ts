/**
 * The call lifecycle — one word for "where has this call got to", derived from what the Knowledge
 * Box actually reports rather than stored alongside it.
 *
 * ARAG has no notion of "this call has been analysed": it has a processing status, a set of
 * applied labels, and whatever generated fields the data-augmentation agents have written so far.
 * Those three arrive independently and at different times, which is exactly why a reviewer looking
 * at a list needs a single state word and a "what do I do next" rather than three raw signals.
 *
 * The states are ordered by how far through the pipeline the call is, and the derivation is a
 * pure function so the table, the detail header and the ingest history all agree.
 */

import type { CallSummary } from "./types.ts";

export const CALL_LIFECYCLES = [
  "queued",
  "transcribing",
  "labelling",
  "partial",
  "analysed",
  "failed",
] as const;
export type CallLifecycle = (typeof CALL_LIFECYCLES)[number];

/** What each state means, and what the reader should do about it. One sentence each. */
export const LIFECYCLE_COPY: Record<CallLifecycle, { label: string; hint: string }> = {
  queued: {
    label: "Queued",
    hint: "Accepted and waiting for the Knowledge Box to pick it up.",
  },
  transcribing: {
    label: "Transcribing",
    hint: "The recording is being turned into a timestamped transcript. Nothing to do.",
  },
  labelling: {
    label: "Labelling",
    hint: "Transcribed. The agents have not finished classifying it yet.",
  },
  partial: {
    label: "Partly analysed",
    hint: "Labelled, but the written analysis has not arrived. Re-run analysis if it stays this way.",
  },
  analysed: { label: "Analysed", hint: "Fully processed: labels, metrics and a written analysis." },
  failed: {
    label: "Failed",
    hint: "The Knowledge Box could not process this call. Check the ingest job, then re-run analysis.",
  },
};

/** The shape `deriveLifecycle` reads. A `CallDetail` satisfies it; so does a `CallSummary`. */
export type LifecycleInput = Pick<CallSummary, "status" | "labels" | "metrics"> & {
  analysis?: { executive_summary?: string } | null;
};

/**
 * Derive the lifecycle state of a call.
 *
 * `jobStatus` is the status of the call's own ingest job when the caller knows it — the list
 * service looks it up, and the upload and ingest-history screens have it in hand. It only ever
 * moves a call *earlier* in the pipeline or to `failed`, never later, so a stale job record can
 * never make an analysed call look unfinished.
 *
 * The order of the checks is the order of the pipeline, and `analysed` is deliberately the
 * narrowest state: it requires labels, the flat metrics AND the written narrative, because that
 * is exactly what the word promises a reviewer. A call whose metrics agent has finished while the
 * ask agent has not is `partial` — usable, and visibly incomplete, with Re-run analysis offered.
 */
export function deriveLifecycle(call: LifecycleInput, jobStatus?: string): CallLifecycle {
  if (jobStatus === "failed") return "failed";
  const status = (call.status ?? "").toUpperCase();
  if (status === "ERROR") return "failed";
  if (jobStatus === "queued") return "queued";
  if (status === "PENDING" || status === "PROCESSING") return "transcribing";

  const hasLabels = call.labels.length > 0;
  const hasMetrics = Boolean(call.metrics?.call_reason);
  const hasNarrative = Boolean(call.analysis?.executive_summary);
  if (!hasLabels && !hasMetrics) return "labelling";

  // A summary read (`parseSummary`) never carries the narrative, so requiring it there would
  // report every call as partial. The narrative is only a *demotion* signal when the caller
  // actually looked for it — which `parseDetail` does, and only it does.
  const narrativeKnown = call.analysis !== undefined;
  if (!hasMetrics || (narrativeKnown && !hasNarrative)) return "partial";
  return "analysed";
}

/** True when the call is still moving; the UI polls these and shows a progress affordance. */
export function isInFlight(state: CallLifecycle): boolean {
  return state === "queued" || state === "transcribing" || state === "labelling";
}
