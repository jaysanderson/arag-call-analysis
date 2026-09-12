import { route } from "@/lib/api";
import { jobView } from "@/services/jobs";
import { notFound } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/jobs/{id}", method: "get" }, (ctx) => {
  const job = ctx.rt.jobs.get(ctx.params.id!);
  if (!job) throw notFound("Job");
  return jobView(job);
});
