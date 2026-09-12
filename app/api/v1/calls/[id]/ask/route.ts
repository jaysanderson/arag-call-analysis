import { preflight, route } from "@/lib/api";
import { askCall } from "@/services/ask";
import { getCall } from "@/services/calls";
import { AragError, badRequest, HttpError, notFound } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = route({ path: "/api/v1/calls/{id}/ask", method: "post" }, async (ctx) => {
  const id = ctx.params.id!;
  const { question } = ctx.body as { question: string };
  // The spec caps the question at 500 characters; a deployment can tighten that further with
  // CALLS_MAX_QUESTION_CHARS (an over-long question costs retrieval and generation tokens).
  if (question.length > ctx.rt.env.maxQuestionChars)
    throw badRequest(`question must be at most ${ctx.rt.env.maxQuestionChars} characters`);
  // 404 before streaming: a 200 NDJSON body carrying an error is far harder to consume. Only a
  // genuine "no such call" is swallowed — an upstream outage must still surface as 502/504 rather
  // than masquerading as a missing call.
  await getCall(ctx.rt, id).catch((err: unknown) => {
    if (err instanceof HttpError && err.status === 404) throw notFound("Call");
    if (err instanceof AragError && err.status === 404) throw notFound("Call");
    throw err;
  });

  const stream = askCall(ctx.rt, id, question, { signal: ctx.req.signal });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});

export const OPTIONS = preflight;
