import { noContent, preflight, route } from "@/lib/api";
import { deleteCall, getCall } from "@/services/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/calls/{id}", method: "get" }, (ctx) =>
  getCall(ctx.rt, ctx.params.id!),
);

export const DELETE = route({ path: "/api/v1/calls/{id}", method: "delete", auth: "write" }, async (ctx) => {
  await deleteCall(ctx.rt, ctx.params.id!);
  ctx.log.info("calls.deleted", { callId: ctx.params.id });
  return noContent();
});

export const OPTIONS = preflight;
