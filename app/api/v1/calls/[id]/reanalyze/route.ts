import { jsonResponse, preflight, route } from "@/lib/api";
import { getCall } from "@/services/calls";
import { JOB_REANALYSE, jobView } from "@/services/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-run the analysis for one call. The call is read first so an unknown id is a 404 here rather
 * than a job that fails a second later — the caller learns immediately.
 */
export const POST = route(
  { path: "/api/v1/calls/{id}/reanalyze", method: "post", auth: "write" },
  async (ctx) => {
    const call = await getCall(ctx.rt, ctx.params.id!);
    const job = ctx.rt.jobs.submit(JOB_REANALYSE, { callId: call.id, title: call.title }, { ref: call.id });
    ctx.log.info("calls.reanalyze", { callId: call.id, jobId: job.id });
    return jsonResponse(jobView(job, { admin: ctx.auth.admin }), 202, {
      Location: `/api/v1/jobs/${job.id}`,
    });
  },
);

export const OPTIONS = preflight;
