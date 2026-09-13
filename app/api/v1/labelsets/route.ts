import { actorOf, jsonResponse, preflight, route } from "@/lib/api";
import { audit } from "@/services/config";
import { listLabelsets, putLabelset } from "@/services/labelsets";
import { createLabelset } from "@/services/taxonomy-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/labelsets", method: "get" }, async (ctx) => ({
  items: await listLabelsets(ctx.rt),
}));

/**
 * Create a labelset and write it to the Knowledge Box in the same request.
 *
 * The definition is saved first and provisioned second, and a failed provision is reported rather
 * than thrown: losing the operator's typed-out vocabulary because the Knowledge Box was briefly
 * unreachable would be the worse failure, and "saved, not yet in the Knowledge Box" is a state the
 * Taxonomy screen already knows how to show and how to retry.
 */
export const POST = route({ path: "/api/v1/labelsets", method: "post", auth: "write" }, async (ctx) => {
  const def = createLabelset(ctx.rt, (ctx.body ?? {}) as Record<string, unknown>);
  audit(ctx.rt, "labelset.create", actorOf(ctx.auth), { id: def.id, labels: def.labels.length });
  let provisioned = true;
  let provisionError: string | undefined;
  try {
    await putLabelset(ctx.rt, def);
  } catch (err) {
    provisioned = false;
    provisionError = (err as Error).message;
    ctx.log.warn("labelset.provision.failed", { id: def.id, message: provisionError });
  }
  return jsonResponse({ labelset: def, provisioned, ...(provisionError ? { provisionError } : {}) }, 201, {
    Location: `/api/v1/labelsets/${def.id}`,
  });
});

export const OPTIONS = preflight;
