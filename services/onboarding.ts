/**
 * First-run onboarding: what still has to happen before this deployment is useful, expressed as
 * four steps with a real state each.
 *
 * The states are computed from the live system, never stored — a deployment that loses its data
 * directory, or one someone provisioned by script, must show the truth rather than a checklist
 * nobody ticked. That also means onboarding cannot get "stuck done" after a Knowledge Box is
 * emptied.
 */

import type { Runtime } from "@/lib/runtime";
import { catalogIds } from "./calls";
import { taxonomy } from "./taxonomy";

export type StepState = "done" | "current" | "blocked" | "pending";

export interface OnboardingStep {
  key: "connect" | "taxonomy" | "calls" | "analysis";
  title: string;
  detail: string;
  state: StepState;
  actionLabel?: string;
  actionHref?: string;
}

export interface OnboardingState {
  complete: boolean;
  mode: "mock" | "live";
  callCount: number;
  analysedCount: number;
  steps: OnboardingStep[];
  sample: { available: boolean; count: number; seeded: boolean; jobId?: string };
}

/** The sample dataset the "Try with sample calls" path loads. */
export const SAMPLE_SLUG_PREFIX = "sample-";

export async function onboarding(rt: Runtime): Promise<OnboardingState> {
  const mode = rt.env.arag.mock ? "mock" : "live";
  const [ids, tax] = await Promise.all([
    catalogIds(rt).catch(() => [] as string[]),
    taxonomy(rt).catch(() => null),
  ]);
  const { allSummaries } = await import("./calls");
  const calls = ids.length ? await allSummaries(rt).catch(() => []) : [];
  const analysedCount = calls.filter((c) => c.lifecycle === "analysed").length;

  const connected = rt.env.arag.mock || Boolean(rt.arag.kbId);
  const provisioned = tax?.provisioning.state === "provisioned";
  const seedJob = rt.jobs.list({ kind: "seed-samples" })[0];

  const steps: OnboardingStep[] = [
    {
      key: "connect",
      title: "Connect a Knowledge Box",
      detail: rt.env.arag.mock
        ? "Running against the in-process sample Knowledge Box. No credentials needed to evaluate."
        : connected
          ? `Connected to ${rt.arag.kbId.slice(0, 8)}…`
          : "Set ARAG_KB_ID and ARAG_API_KEY, or run with ARAG_MOCK=1 to evaluate without credentials.",
      state: connected ? "done" : "blocked",
      actionLabel: "Connection settings",
      actionHref: "/settings/connection",
    },
    {
      key: "taxonomy",
      title: "Provision the taxonomy",
      detail: provisioned
        ? `${tax?.labelsets.filter((l) => l.provisioned).length ?? 0} labelsets and ${tax?.agents.filter((a) => a.state !== "absent").length ?? 0} agents are live.`
        : "Create the labelsets and start the data-augmentation agents that classify every call.",
      state: !connected ? "pending" : provisioned ? "done" : "current",
      actionLabel: "Agents & taxonomy",
      actionHref: "/taxonomy",
    },
    {
      key: "calls",
      title: "Add calls",
      detail:
        ids.length > 0
          ? `${ids.length} call${ids.length === 1 ? "" : "s"} in the Knowledge Box.`
          : "Upload a recording or a transcript, or load the sample dataset to see the product working.",
      state: !connected ? "pending" : ids.length > 0 ? "done" : "current",
      actionLabel: "Upload a call",
      actionHref: "/upload",
    },
    {
      key: "analysis",
      title: "Review the analysis",
      detail:
        analysedCount > 0
          ? `${analysedCount} call${analysedCount === 1 ? "" : "s"} fully analysed. Open one and ask it a question.`
          : ids.length > 0
            ? "Calls are in, but the agents have not finished classifying them yet."
            : "Once a call is analysed you can ask it a question and click the citation to hear the moment.",
      state: analysedCount > 0 ? "done" : ids.length > 0 ? "current" : "pending",
      actionLabel: "Browse calls",
      actionHref: "/calls",
    },
  ];

  return {
    complete: steps.every((s) => s.state === "done"),
    mode,
    callCount: ids.length,
    analysedCount,
    steps,
    sample: {
      // The sample dataset is a local fixture, so it is always available to load; in mock mode it
      // is already there.
      available: true,
      count: 24,
      seeded: rt.env.arag.mock ? ids.length > 0 : calls.some((c) => c.slug?.startsWith(SAMPLE_SLUG_PREFIX)),
      jobId: seedJob?.id,
    },
  };
}
