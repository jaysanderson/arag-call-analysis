import { preflight, route } from "@/lib/api";
import { agentStatus } from "@/services/agents";
import { agentConfigs } from "@/services/taxonomy-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Configuration and live state in one read.
 *
 * The Knowledge Box call can fail while the configuration is perfectly readable, so the two are
 * merged rather than chained: an operator who cannot reach ARAG still needs to see — and edit —
 * what their agents are instructed to do.
 */
export const GET = route({ path: "/api/v1/agents", method: "get" }, async (ctx) => {
  const configs = agentConfigs(ctx.rt);
  const live = await agentStatus(ctx.rt).catch(() => null);
  const byKey = new Map((live?.agents ?? []).map((a) => [a.key, a]));
  return {
    items: configs.map((c) => {
      const state = byKey.get(c.key);
      return {
        key: c.key,
        type: c.type,
        description: c.description,
        enabled: c.enabled,
        model: c.model,
        prompts: c.prompts,
        state: state?.state ?? "absent",
        taskId: state?.taskId,
        operations: ((c.parameters.operations as unknown[]) ?? []).length,
        labelsets:
          c.type === "labeler"
            ? ((c.parameters.operations as Array<{ label?: { ident?: string } }>) ?? [])
                .map((o) => o.label?.ident ?? "")
                .filter(Boolean)
            : undefined,
      };
    }),
  };
});

export const OPTIONS = preflight;
