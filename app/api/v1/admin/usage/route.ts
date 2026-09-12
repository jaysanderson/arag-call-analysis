import { preflight, route } from "@/lib/api";
import { usage } from "@/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/admin/usage", method: "get", auth: "admin" }, (ctx) =>
  usage(ctx.rt),
);

export const OPTIONS = preflight;
