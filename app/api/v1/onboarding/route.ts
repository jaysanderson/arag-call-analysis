import { preflight, route } from "@/lib/api";
import { onboarding } from "@/services/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/onboarding", method: "get" }, (ctx) => onboarding(ctx.rt));

export const OPTIONS = preflight;
