import { actorOf, noContent, preflight, route } from "@/lib/api";
import { deleteCall, getCall, tryGetCall } from "@/services/calls";
import { audit } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/calls/{id}", method: "get" }, (ctx) =>
  getCall(ctx.rt, ctx.params.id!),
);

export const DELETE = route({ path: "/api/v1/calls/{id}", method: "delete", auth: "write" }, async (ctx) => {
  // The title is read before the delete so the audit entry is legible afterwards: "call
  // 7f3a… deleted" tells a reviewer nothing a month later. Best-effort — a call that is already
  // half-gone must still be deletable.
  const title = await tryGetCall(ctx.rt, ctx.params.id!)
    .then((c) => c?.title)
    .catch(() => undefined);
  await deleteCall(ctx.rt, ctx.params.id!);
  ctx.log.info("calls.deleted", { callId: ctx.params.id });
  audit(ctx.rt, "call.delete", actorOf(ctx.auth), { callId: ctx.params.id, title });
  return noContent();
});

export const OPTIONS = preflight;
