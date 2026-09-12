import { preflight, route } from "@/lib/api";
import { taxonomy } from "@/services/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/taxonomy", method: "get" }, (ctx) => taxonomy(ctx.rt));

export const OPTIONS = preflight;
