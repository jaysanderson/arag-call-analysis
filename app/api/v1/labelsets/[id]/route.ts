import { actorOf, noContent, preflight, route } from "@/lib/api";
import { audit } from "@/services/config";
import { putLabelset, unprovisionLabelset } from "@/services/labelsets";
import { deleteLabelsetDef, labelsetDef, putLabelsetDef } from "@/services/taxonomy-store";
import { notFound } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/labelsets/{id}", method: "get" }, (ctx) => {
  const def = labelsetDef(ctx.rt, ctx.params.id!);
  if (!def) throw notFound("Labelset");
  return def;
});

export const PUT = route({ path: "/api/v1/labelsets/{id}", method: "put", auth: "write" }, async (ctx) => {
  const def = putLabelsetDef(ctx.rt, ctx.params.id!, (ctx.body ?? {}) as Record<string, unknown>);
  audit(ctx.rt, "labelset.update", actorOf(ctx.auth), { id: def.id, labels: def.labels.length });
  let provisioned = true;
  let provisionError: string | undefined;
  try {
    await putLabelset(ctx.rt, def);
  } catch (err) {
    provisioned = false;
    provisionError = (err as Error).message;
  }
  return { labelset: def, provisioned, ...(provisionError ? { provisionError } : {}) };
});

/**
 * Remove a labelset from the product's vocabulary.
 *
 * `?knowledge_box=true` also deletes it upstream, which removes the labels already applied to
 * analysed calls. That is data rather than configuration, so it is never the default — the
 * Taxonomy screen asks for it explicitly, with the count of affected calls in the confirmation.
 */
export const DELETE = route(
  { path: "/api/v1/labelsets/{id}", method: "delete", auth: "write" },
  async (ctx) => {
    const alsoKb = ctx.query.knowledge_box === true;
    deleteLabelsetDef(ctx.rt, ctx.params.id!);
    if (alsoKb) await unprovisionLabelset(ctx.rt, ctx.params.id!);
    audit(ctx.rt, "labelset.delete", actorOf(ctx.auth), { id: ctx.params.id!, knowledgeBox: alsoKb });
    return noContent();
  },
);

export const OPTIONS = preflight;
