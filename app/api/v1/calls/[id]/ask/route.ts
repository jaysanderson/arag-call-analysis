import { route } from "@/lib/api";
import { askCall } from "@/services/ask";
import { getCall } from "@/services/calls";
import { badRequest, notFound } from "@/vendor/arag-platform/src/index.ts";

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
  // 404 before streaming: a 200 NDJSON body carrying an error is far harder to consume.
  const call = await getCall(ctx.rt, id).catch(() => null);
  if (!call) throw notFound("Call");

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
