import { preflight, route } from "@/lib/api";
import { dashboard } from "@/services/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/dashboard", method: "get" }, (ctx) => dashboard(ctx.rt));

export const OPTIONS = preflight;
