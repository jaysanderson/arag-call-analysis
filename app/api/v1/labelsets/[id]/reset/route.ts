import { actorOf, preflight, route } from "@/lib/api";
import { audit } from "@/services/config";
import { putLabelset } from "@/services/labelsets";
import { restoreLabelset } from "@/services/taxonomy-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Put a shipped labelset back to the definition the product ships, and re-provision it.
 *
 * The same shape as `DELETE /api/v1/settings/{section}`: an edit is reversible without knowing
 * what the original was, which is the difference between a configuration surface someone will
 * experiment with and one they will not touch. Only labelsets the product ships can be reset —
 * there is nothing to reset a partner's own vocabulary *to*, so that returns 404.
 */
export const POST = route(
  { path: "/api/v1/labelsets/{id}/reset", method: "post", auth: "write" },
  async (ctx) => {
    const def = restoreLabelset(ctx.rt, ctx.params.id!);
    audit(ctx.rt, "labelset.reset", actorOf(ctx.auth), { id: def.id, labels: def.labels.length });
    let provisioned = true;
    let provisionError: string | undefined;
    try {
      await putLabelset(ctx.rt, def);
    } catch (err) {
      provisioned = false;
      provisionError = (err as Error).message;
      ctx.log.warn("labelset.provision.failed", { id: def.id, message: provisionError });
    }
    return { labelset: def, provisioned, ...(provisionError ? { provisionError } : {}) };
  },
);

export const OPTIONS = preflight;
