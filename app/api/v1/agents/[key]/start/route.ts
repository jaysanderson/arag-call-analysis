import { actorOf, preflight, route } from "@/lib/api";
import { startAgent } from "@/services/agents";
import { audit } from "@/services/config";
import { agentConfig } from "@/services/taxonomy-store";
import { badRequest } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(
  { path: "/api/v1/agents/{key}/start", method: "post", auth: "write" },
  async (ctx) => {
    const cfg = agentConfig(ctx.rt, ctx.params.key!);
    if (!cfg.enabled) throw badRequest(`${cfg.key} is disabled. Enable it before starting it.`);
    const taskId = await startAgent(ctx.rt, cfg);
    audit(ctx.rt, "agent.start", actorOf(ctx.auth), { agent: cfg.key, taskId });
    return {
      key: cfg.key,
      type: cfg.type,
      description: cfg.description,
      enabled: cfg.enabled,
      model: cfg.model,
      prompts: cfg.prompts,
      state: "running",
      taskId,
    };
  },
);

export const OPTIONS = preflight;
