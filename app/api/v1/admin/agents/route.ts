import { route } from "@/lib/api";
import { agentStatus } from "@/services/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/admin/agents", method: "get", auth: "admin" }, (ctx) =>
  agentStatus(ctx.rt),
);
