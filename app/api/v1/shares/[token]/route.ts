import { preflight, route } from "@/lib/api";
import { resolveShare, revokeShare } from "@/services/shares";
import { notFound } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve a share token. Unknown, revoked and expired tokens are all a plain 404: telling an
 * anonymous caller which of the three applies would confirm that a token once existed.
 */
export const GET = route({ path: "/api/v1/shares/{token}", method: "get" }, async (ctx) => {
  const share = resolveShare(ctx.rt, ctx.params.token!);
  if (!share) throw notFound("Share link");
  return share;
});

export const DELETE = route(
  { path: "/api/v1/shares/{token}", method: "delete", auth: "api" },
  async (ctx) => {
    const share = revokeShare(ctx.rt, ctx.params.token!);
    ctx.log.info("shares.revoked", { callId: share.callId });
    return share;
  },
);

export const OPTIONS = preflight;
