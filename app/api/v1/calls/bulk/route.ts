import { preflight, route } from "@/lib/api";
import { deleteCall } from "@/services/calls";
import { JOB_REANALYSE, jobView } from "@/services/jobs";
import type { Job } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BulkBody {
  action: "delete" | "reanalyze";
  ids: string[];
}

/**
 * Bulk actions on a table selection.
 *
 * Partial success is the normal case for a batch that touches an upstream system, so each id is
 * attempted independently and the outcome is reported per id. Failing the whole request on the
 * first bad id would leave the operator unable to tell which of fifty calls were actually deleted.
 */
export const POST = route({ path: "/api/v1/calls/bulk", method: "post", auth: "write" }, async (ctx) => {
  const { action, ids } = ctx.body as BulkBody;
  // De-duplicate: a selection restored from the URL can repeat an id, and deleting twice would
  // report a spurious 404 for a call that was in fact removed.
  const unique = [...new Set(ids)];
  const failed: Array<{ id: string; error: string }> = [];
  const jobs: Job[] = [];
  let succeeded = 0;

  for (const id of unique) {
    try {
      if (action === "delete") {
        await deleteCall(ctx.rt, id);
      } else {
        jobs.push(ctx.rt.jobs.submit(JOB_REANALYSE, { callId: id }, { ref: id }));
      }
      succeeded++;
    } catch (err) {
      failed.push({ id, error: (err as Error).message });
    }
  }

  ctx.log.info("calls.bulk", { action, requested: unique.length, succeeded, failed: failed.length });
  return {
    action,
    requested: unique.length,
    succeeded,
    failed,
    jobs: jobs.map((j) => jobView(j, { admin: ctx.auth.admin })),
  };
});

export const OPTIONS = preflight;
