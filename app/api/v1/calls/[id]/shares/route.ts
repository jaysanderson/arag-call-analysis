import { jsonResponse, preflight, route } from "@/lib/api";
import { getCall } from "@/services/calls";
import { createShare, listShares } from "@/services/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/calls/{id}/shares", method: "get", auth: "api" }, async (ctx) => ({
  items: listShares(ctx.rt, ctx.params.id!),
}));

export const POST = route({ path: "/api/v1/calls/{id}/shares", method: "post", auth: "api" }, async (ctx) => {
  // Resolve the call first: a link to a call that does not exist is a broken promise, and the
  // title is stored on the link so the share list is readable after the call is deleted.
  const call = await getCall(ctx.rt, ctx.params.id!);
  const body = (ctx.body ?? {}) as { ttlDays?: number; note?: string };
  const share = createShare(ctx.rt, {
    callId: call.id,
    callTitle: call.title,
    ttlDays: body.ttlDays,
    note: body.note,
  });
  // The token itself is never logged: it is the only secret in the link.
  ctx.log.info("shares.created", { callId: call.id, expiresISO: share.expiresISO });
  return jsonResponse(share, 201, { Location: share.url });
});

export const OPTIONS = preflight;
