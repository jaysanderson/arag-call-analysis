import { preflight, route } from "@/lib/api";
import { purgePreview } from "@/services/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/retention/preview", method: "get" }, (ctx) =>
  purgePreview(ctx.rt, ctx.query.days as number | undefined),
);

export const OPTIONS = preflight;
