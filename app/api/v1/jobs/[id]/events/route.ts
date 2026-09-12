import { notFound } from "@/vendor/arag-platform/src/index.ts";
import { route } from "@/lib/api";
import { jobView } from "@/services/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

/** Live job progress as Server-Sent Events; closes as soon as the job reaches a terminal state. */
export const GET = route(
  { path: "/api/v1/jobs/{id}/events", method: "get", noRateLimit: true },
  (ctx) => {
    const id = ctx.params.id!;
    const job = ctx.rt.jobs.get(id);
    if (!job) throw notFound("Job");

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (event: string, data: unknown) => {
          if (closed) return;
          const payload = JSON.stringify(data).replace(/\n/g, "\ndata: ");
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
        };
        const finish = () => {
          if (closed) return;
          closed = true;
          clearInterval(keepalive);
          unsub();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        const keepalive = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
        }, 15_000);

        const unsub = ctx.rt.jobs.subscribe(id, (e) => {
          if ("job" in e) {
            send("job", jobView(e.job));
            if (TERMINAL.has(e.job.status)) finish();
          } else {
            send("event", e);
          }
        });

        send("job", jobView(job));
        for (const e of job.events) send("event", e);
        if (TERMINAL.has(job.status)) finish();
        ctx.req.signal.addEventListener("abort", finish);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  },
);
