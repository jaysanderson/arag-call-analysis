import { preflight, route } from "@/lib/api";
import { config } from "@/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/admin/config", method: "get", auth: "admin" }, (ctx) =>
  config(ctx.rt),
);

export const OPTIONS = preflight;
