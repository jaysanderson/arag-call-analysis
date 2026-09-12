import { preflight, route } from "@/lib/api";
import { listLabelsets } from "@/services/labelsets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/labelsets", method: "get" }, async (ctx) => ({
  items: await listLabelsets(ctx.rt),
}));

export const OPTIONS = preflight;
