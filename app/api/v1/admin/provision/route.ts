import { jsonResponse, route } from "@/lib/api";
import { JOB_PROVISION, jobView, type ProvisionJobInput } from "@/services/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provision the taxonomy: labelsets, then the data-augmentation agents one at a time (ARAG allows
 * a single running task per operation type). Idempotent and safe to re-run.
 */
export const POST = route(
  { path: "/api/v1/admin/provision", method: "post", auth: "admin" },
  (ctx) => {
    const input = (ctx.body ?? {}) as ProvisionJobInput;
    const job = ctx.rt.jobs.submit(JOB_PROVISION, input);
    ctx.log.info("admin.provision.started", { jobId: job.id });
    return jsonResponse(jobView(job), 202, { Location: `/api/v1/jobs/${job.id}` });
  },
);
