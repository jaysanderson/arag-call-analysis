import { route } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/admin/cache", method: "get", auth: "admin" }, (ctx) => ({
  stats: ctx.rt.cache.stats(),
  keys: ctx.rt.cache.keys().slice(0, 200),
}));
