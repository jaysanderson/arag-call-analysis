import { actorOf, preflight, route } from "@/lib/api";
import { audit } from "@/services/config";
import { putLabelset } from "@/services/labelsets";
import { labelsetDef } from "@/services/taxonomy-store";
import { notFound } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(
  { path: "/api/v1/labelsets/{id}/provision", method: "post", auth: "write" },
  async (ctx) => {
    const def = labelsetDef(ctx.rt, ctx.params.id!);
    if (!def) throw notFound("Labelset");
    await putLabelset(ctx.rt, def);
    audit(ctx.rt, "labelset.provision", actorOf(ctx.auth), { id: def.id });
    return { labelset: def, provisioned: true };
  },
);

export const OPTIONS = preflight;
