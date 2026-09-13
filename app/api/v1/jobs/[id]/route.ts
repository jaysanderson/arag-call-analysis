import { actorOf, preflight, route } from "@/lib/api";
import { audit } from "@/services/config";
import { jobView } from "@/services/jobs";
import { HttpError, notFound } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/jobs/{id}", method: "get" }, (ctx) => {
  const job = ctx.rt.jobs.get(ctx.params.id!);
  if (!job) throw notFound("Job");
  return jobView(job, { admin: ctx.auth.admin });
});

/**
 * Cancel a queued or running job.
 *
 * Work already committed upstream is not rolled back: a cancelled ingestion leaves the Knowledge
 * Box resource it had already created, which the call list then shows as incomplete. That is the
 * honest outcome — pretending the upload never happened would hide a resource that really is there
 * and really is costing storage.
 */
export const DELETE = route({ path: "/api/v1/jobs/{id}", method: "delete", auth: "write" }, (ctx) => {
  const job = ctx.rt.jobs.get(ctx.params.id!);
  if (!job) throw notFound("Job");
  if (!ctx.rt.jobs.cancel(ctx.params.id!))
    throw new HttpError(409, "Already finished", `This job is ${job.status} and can no longer be cancelled.`);
  audit(ctx.rt, "job.cancel", actorOf(ctx.auth), { id: job.id, kind: job.kind });
  return jobView(ctx.rt.jobs.get(ctx.params.id!) ?? job, { admin: ctx.auth.admin });
});

export const OPTIONS = preflight;
