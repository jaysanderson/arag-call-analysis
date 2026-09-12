import { route } from "@/lib/api";
import { health } from "@/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/admin/health", method: "get", auth: "admin" }, (ctx) =>
  health(ctx.rt),
);
