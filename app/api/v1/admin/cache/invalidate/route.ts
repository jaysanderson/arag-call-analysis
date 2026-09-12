import { route } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(
  { path: "/api/v1/admin/cache/invalidate", method: "post", auth: "admin" },
  (ctx) => {
    const { prefix } = (ctx.body ?? {}) as { prefix?: string };
    const invalidated = prefix ? ctx.rt.cache.invalidatePrefix(prefix) : ctx.rt.cache.clear();
    ctx.log.info("admin.cache.invalidated", { prefix: prefix ?? "*", invalidated });
    return { invalidated };
  },
);
