import { jsonResponse, preflight, route } from "@/lib/api";
import { JOB_SEED_SAMPLES, jobView } from "@/services/jobs";
import { HttpError } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Load the sample dataset. Guarded against a second concurrent run: two seeding jobs would race to
 * create the same slugs and the loser would report failures that are not real.
 */
export const POST = route({ path: "/api/v1/samples", method: "post", auth: "write" }, async (ctx) => {
  const running = ctx.rt.jobs
    .list({ kind: JOB_SEED_SAMPLES })
    .find((j) => j.status === "running" || j.status === "queued");
  if (running)
    throw new HttpError(409, "Already running", `A seeding job is already in progress (${running.id}).`);

  const body = (ctx.body ?? {}) as { count?: number; provision?: boolean };
  const job = ctx.rt.jobs.submit(JOB_SEED_SAMPLES, { count: body.count, provision: body.provision });
  ctx.log.info("samples.seeding", { jobId: job.id, count: body.count ?? "all" });
  return jsonResponse(jobView(job, { admin: ctx.auth.admin }), 202, {
    Location: `/api/v1/jobs/${job.id}`,
  });
});

export const OPTIONS = preflight;
