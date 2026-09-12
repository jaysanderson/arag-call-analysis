import { preflight, route } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The white-label identity for this deployment. Public and unauthenticated: the demo UI, the admin
 * console and any partner front-end all read it, and it contains no secrets.
 */
export const GET = route({ path: "/api/v1/branding", method: "get" }, (ctx) => ctx.rt.branding);

export const OPTIONS = preflight;
