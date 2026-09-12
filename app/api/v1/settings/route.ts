import { preflight, route } from "@/lib/api";
import { settings } from "@/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/settings", method: "get" }, (ctx) => settings(ctx.rt));

export const OPTIONS = preflight;
