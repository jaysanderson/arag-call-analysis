import { route } from "@/lib/api";
import { jobView } from "@/services/jobs";
import type { JobStatus } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/jobs", method: "get" }, (ctx) => ({
  items: ctx.rt.jobs
    .list({
      kind: ctx.query.kind as string | undefined,
      status: ctx.query.status as JobStatus | undefined,
      limit: (ctx.query.limit as number | undefined) ?? 50,
    })
    .map(jobView),
}));
