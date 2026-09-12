/**
 * The Agents & Taxonomy read model: what the product classifies calls with, which agents apply it,
 * and whether the Knowledge Box has actually been provisioned with either.
 *
 * This is one endpoint rather than three because the question a user asks on that screen is a
 * single one — "is my taxonomy live?" — and answering it needs the shipped definitions, the
 * labelsets the Knowledge Box really holds, and the agent task state compared against each other.
 * Doing that comparison in the browser would put the product's own correctness rules in the client.
 */

import { AGENTS, ALL_LABELSETS, type LabelsetDef } from "@/lib/domain/taxonomy";
import type { Runtime } from "@/lib/runtime";
import { type AgentStatus, agentStatus } from "./agents";
import { type LabelsetView, listLabelsets } from "./labelsets";

export interface LabelsetDetail extends LabelsetView {
  /** True when this labelset is part of the shipped taxonomy (as opposed to one ARAG created). */
  shipped: boolean;
  /** True when the Knowledge Box holds it. A shipped-but-absent labelset needs provisioning. */
  provisioned: boolean;
  definitions: Array<{ label: string; description?: string; present: boolean; calls?: number }>;
}

export type ProvisioningState = "provisioned" | "partial" | "absent" | "running";

export interface TaxonomyView {
  labelsets: LabelsetDetail[];
  agents: AgentStatus[];
  provisioning: {
    state: ProvisioningState;
    missingLabelsets: string[];
    missingAgents: string[];
    /** The most recent provisioning job, when this process ran one. */
    lastJobId?: string;
    lastRunISO?: string;
  };
}

function detailFor(
  def: LabelsetDef | undefined,
  live: LabelsetView | undefined,
  counts: Map<string, number>,
) {
  const liveLabels = new Set(live?.labels ?? []);
  const id = (def?.id ?? live?.id) as string;
  const definitions = def
    ? def.labels.map((l) => ({
        label: l.label,
        description: l.description,
        present: liveLabels.has(l.label),
        calls: counts.get(`${id}/${l.label}`),
      }))
    : // A labelset ARAG created implicitly has no shipped definitions; its live labels are all
      // there is to show, and by definition each one is present.
      (live?.labels ?? []).map((label) => ({ label, present: true, calls: counts.get(`${id}/${label}`) }));

  const view: LabelsetDetail = {
    id,
    title: def?.title ?? live?.title ?? id,
    color: def?.color ?? live?.color,
    multiple: def?.multiple ?? live?.multiple ?? false,
    kind: def ? [def.kind] : (live?.kind ?? []),
    labels: live?.labels ?? def?.labels.map((l) => l.label) ?? [],
    shipped: Boolean(def),
    provisioned: Boolean(live),
    definitions,
  };
  return view;
}

/**
 * Labelsets, agents and provisioning state in one read.
 *
 * `counts` are the live per-label call tallies, so the screen can say "Complaint: 3 calls" rather
 * than listing a vocabulary nobody can tell is being used. They are best-effort: a failure to
 * compute them must not take the taxonomy screen down with it.
 */
export async function taxonomy(rt: Runtime): Promise<TaxonomyView> {
  const [live, agentsView, counts] = await Promise.all([
    listLabelsets(rt).catch(() => [] as LabelsetView[]),
    agentStatus(rt).catch(() => ({ agents: [] as AgentStatus[], running: 0, raw: null })),
    labelCounts(rt).catch(() => new Map<string, number>()),
  ]);

  const liveById = new Map(live.map((l) => [l.id, l]));
  const ids = [...new Set([...ALL_LABELSETS.map((d) => d.id), ...live.map((l) => l.id)])];
  const labelsets = ids.map((id) =>
    detailFor(
      ALL_LABELSETS.find((d) => d.id === id),
      liveById.get(id),
      counts,
    ),
  );

  const missingLabelsets = labelsets.filter((l) => l.shipped && !l.provisioned).map((l) => l.id);
  const missingAgents = agentsView.agents.filter((a) => a.state === "absent").map((a) => a.key);
  const running =
    agentsView.agents.some((a) => a.state === "running") ||
    rt.jobs.list({ status: "running" }).some((j) => j.kind === "provision");

  const lastProvision = rt.jobs.list({ kind: "provision" })[0];

  let state: ProvisioningState = "provisioned";
  if (running) state = "running";
  else if (missingLabelsets.length === ALL_LABELSETS.length && missingAgents.length === AGENTS.length)
    state = "absent";
  else if (missingLabelsets.length > 0 || missingAgents.length > 0) state = "partial";

  return {
    labelsets,
    agents: agentsView.agents,
    provisioning: {
      state,
      missingLabelsets,
      missingAgents,
      lastJobId: lastProvision?.id,
      lastRunISO: lastProvision?.createdAt,
    },
  };
}

/** How many calls currently carry each `labelset/label`, from the cached call summaries. */
async function labelCounts(rt: Runtime): Promise<Map<string, number>> {
  const { allSummaries } = await import("./calls");
  const counts = new Map<string, number>();
  for (const c of await allSummaries(rt)) {
    for (const l of c.labels) {
      const key = `${l.labelset}/${l.label}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
