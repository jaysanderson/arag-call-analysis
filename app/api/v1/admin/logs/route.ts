import { route } from "@/lib/api";
import { logs } from "@/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/admin/logs", method: "get", auth: "admin" }, (ctx) =>
  logs(ctx.rt, {
    level: ctx.query.level as string | undefined,
    contains: ctx.query.contains as string | undefined,
    limit: ctx.query.limit as number | undefined,
  }),
);
