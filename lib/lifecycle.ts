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

/**
 * Derive the lifecycle state of a call.
 *
 * `jobStatus` is the status of the call's own ingest job when one is known (the upload screen and
 * the ingest history have it; a plain list read does not). It only ever moves a call *earlier* in
 * the pipeline or to `failed`, never later, so a stale job record cannot make an analysed call
 * look unfinished.
 */
export function deriveLifecycle(
  call: Pick<CallSummary, "status" | "labels" | "metrics"> & { analysis?: unknown },
  jobStatus?: string,
): CallLifecycle {
  if (jobStatus === "failed") return "failed";
  const status = (call.status ?? "").toUpperCase();
  if (status === "ERROR") return "failed";
  if (jobStatus === "queued") return "queued";
  if (status === "PENDING" || status === "PROCESSING") return "transcribing";

  const hasLabels = call.labels.length > 0;
  const hasMetrics = Boolean(call.metrics?.call_reason);
  if (!hasLabels && !hasMetrics) return "labelling";
  // Labelled but the ask agent has not written the narrative yet: usable, visibly incomplete.
  if (!hasMetrics) return "partial";
  return "analysed";
}

/** True when the call is still moving; the UI polls these and shows a progress affordance. */
export function isInFlight(state: CallLifecycle): boolean {
  return state === "queued" || state === "transcribing" || state === "labelling";
}
