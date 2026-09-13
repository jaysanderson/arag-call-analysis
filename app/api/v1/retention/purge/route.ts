import { actorOf, preflight, route } from "@/lib/api";
import { audit } from "@/services/config";
import { runPurge } from "@/services/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route({ path: "/api/v1/retention/purge", method: "post", auth: "admin" }, async (ctx) => {
  const body = (ctx.body ?? {}) as { days?: number; dryRun?: boolean; ids?: string[] };
  const result = await runPurge(ctx.rt, body);
  if (!result.dryRun)
    audit(ctx.rt, "retention.purge", actorOf(ctx.auth), {
      days: result.days,
      deleted: result.deleted.length,
      failed: result.failed.length,
    });
  return result;
});

export const OPTIONS = preflight;
