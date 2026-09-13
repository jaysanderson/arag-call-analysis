import { preflight, route } from "@/lib/api";
import { type DashboardRange, dashboard } from "@/services/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/dashboard", method: "get" }, (ctx) =>
  dashboard(ctx.rt, {
    range: ctx.query.range as DashboardRange | undefined,
    from: ctx.query.from as string | undefined,
    to: ctx.query.to as string | undefined,
  }),
);

export const OPTIONS = preflight;
