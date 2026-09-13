/**
 * Data-augmentation agent (ARAG "task") status and provisioning.
 *
 * ARAG allows exactly one *running* task per operation type, so the three agents in the taxonomy
 * (resource labeler, paragraph labeler, call-insights ask) must be started one at a time with a
 * wait in between — which is why provisioning is a job, not a request/response call.
 */

import { AGENTS, type AgentDef } from "@/lib/domain/taxonomy";
import type { Runtime } from "@/lib/runtime";
import type { TaskInfo } from "@/vendor/arag-platform/src/arag/types.ts";
import { agentConfigs } from "./taxonomy-store";

export interface AgentStatus {
  key: string;
  type: "labeler" | "ask";
  description: string;
  /** Configured / running / done / absent, derived from GET /tasks. */
  state: "running" | "completed" | "failed" | "configured" | "absent";
  taskId?: string;
  operations: number;
  /** False when an operator has switched this agent off in Taxonomy. */
  enabled: boolean;
  /** Editable instructions, keyed by the resource field the operation writes (ask agents only). */
  prompts?: Record<string, string>;
  model?: string;
}

function taskName(t: TaskInfo): string {
  const params = (t.parameters ?? {}) as { name?: string };
  return params.name ?? t.task?.name ?? "";
}

/** Map the KB's task buckets onto the product's three named agents. */
export function classifyAgents(
  tasks: { configs?: TaskInfo[]; running?: TaskInfo[]; done?: TaskInfo[] },
  defs: AgentDef[] = AGENTS,
): AgentStatus[] {
  const find = (bucket: TaskInfo[] | undefined, key: string) =>
    (bucket ?? []).find((t) => taskName(t) === key);
  return defs.map((def) => {
    const running = find(tasks.running, def.key);
    const done = find(tasks.done, def.key);
    const configured = find(tasks.configs, def.key);
    const hit = running ?? done ?? configured;
    let state: AgentStatus["state"] = "absent";
    if (running) state = "running";
    else if (done) state = done.failed ? "failed" : "completed";
    else if (configured) state = "configured";
    return {
      key: def.key,
      type: def.type,
      description: def.description,
      state,
      taskId: hit?.id,
      operations: ((def.parameters.operations as unknown[]) ?? []).length,
      enabled: (def as { enabled?: boolean }).enabled ?? true,
      ...((def as { prompts?: Record<string, string> }).prompts
        ? { prompts: (def as { prompts?: Record<string, string> }).prompts }
        : {}),
      ...((def as { model?: string }).model ? { model: (def as { model?: string }).model } : {}),
    };
  });
}

/** Live agent status straight from the KB (never cached — this is an operational view). */
export async function agentStatus(rt: Runtime): Promise<{
  agents: AgentStatus[];
  running: number;
  raw: { configs: number; running: number; done: number };
}> {
  const tasks = await rt.arag.listTasks();
  const agents = classifyAgents(tasks, agentConfigs(rt));
  return {
    agents,
    running: agents.filter((a) => a.state === "running").length,
    raw: {
      configs: (tasks.configs ?? []).length,
      running: (tasks.running ?? []).length,
      done: (tasks.done ?? []).length,
    },
  };
}

/** Start one agent. */
export async function startAgent(rt: Runtime, def: AgentDef): Promise<string> {
  const res = await rt.arag.startTask({ name: def.type, parameters: def.parameters });
  return res.id;
}

/** Delete every configured/running/done task (used before a re-provision). */
export async function deleteAllTasks(rt: Runtime): Promise<number> {
  const tasks = await rt.arag.listTasks();
  const ids = new Set<string>();
  for (const bucket of [tasks.configs, tasks.running, tasks.done]) {
    for (const t of bucket ?? []) if (t.id) ids.add(t.id);
  }
  for (const id of ids) await rt.arag.deleteTask(id);
  return ids.size;
}
