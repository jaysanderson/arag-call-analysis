import { preflight, route } from "@/lib/api";
import { listAudit } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/admin/audit", method: "get", auth: "admin" }, (ctx) => ({
  items: listAudit(
    ctx.rt,
    (ctx.query.limit as number | undefined) ?? 100,
    ctx.query.action as string | undefined,
  ),
}));

export const OPTIONS = preflight;
