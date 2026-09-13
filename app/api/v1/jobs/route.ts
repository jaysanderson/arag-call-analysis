import { preflight, route } from "@/lib/api";
import { jobView } from "@/services/jobs";
import type { JobStatus } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `ref` is the object the job is about — a call id for an ingestion. Filtering on it server-side is
 * what lets a screen ask "is this call still processing?" in one request instead of pulling the
 * last fifty jobs and sieving them in the browser.
 */
export const GET = route({ path: "/api/v1/jobs", method: "get" }, (ctx) => ({
  items: ctx.rt.jobs
    .list({
      kind: ctx.query.kind as string | undefined,
      status: ctx.query.status as JobStatus | undefined,
      ref: ctx.query.ref as string | undefined,
      limit: (ctx.query.limit as number | undefined) ?? 50,
    })
    .map((j) => jobView(j, { admin: ctx.auth.admin })),
}));

export const OPTIONS = preflight;
