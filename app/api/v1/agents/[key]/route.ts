import { actorOf, preflight, route } from "@/lib/api";
import { agentStatus } from "@/services/agents";
import { audit } from "@/services/config";
import { agentConfig, updateAgent } from "@/services/taxonomy-store";
import { badRequest } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route({ path: "/api/v1/agents/{key}", method: "put", auth: "write" }, (ctx) => {
  const next = updateAgent(ctx.rt, ctx.params.key!, (ctx.body ?? {}) as Record<string, unknown>);
  audit(ctx.rt, "agent.update", actorOf(ctx.auth), {
    agent: next.key,
    enabled: next.enabled,
    prompts: Object.keys((ctx.body as { prompts?: object })?.prompts ?? {}),
  });
  return {
    key: next.key,
    type: next.type,
    description: next.description,
    enabled: next.enabled,
    model: next.model,
    prompts: next.prompts,
  };
});

/** Stop the agent's Knowledge Box task, leaving its configuration alone. */
export const DELETE = route(
  { path: "/api/v1/agents/{key}", method: "delete", auth: "write" },
  async (ctx) => {
    const cfg = agentConfig(ctx.rt, ctx.params.key!);
    const live = await agentStatus(ctx.rt);
    const hit = live.agents.find((a) => a.key === cfg.key);
    if (!hit?.taskId) throw badRequest(`${cfg.key} has no task in the Knowledge Box to stop`);
    await ctx.rt.arag.deleteTask(hit.taskId);
    audit(ctx.rt, "agent.stop", actorOf(ctx.auth), { agent: cfg.key, taskId: hit.taskId });
    return {
      key: cfg.key,
      type: cfg.type,
      description: cfg.description,
      enabled: cfg.enabled,
      model: cfg.model,
      prompts: cfg.prompts,
      state: "absent",
    };
  },
);

export const OPTIONS = preflight;
