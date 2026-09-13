import { preflight, route } from "@/lib/api";
import { listShares } from "@/services/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The whole share register, so links can be reviewed and revoked from Settings rather than only
 * from the call each one points at — "which links are live?" is a question about the deployment,
 * not about one call.
 */
export const GET = route({ path: "/api/v1/shares", method: "get" }, (ctx) => {
  const state = (ctx.query.state as string | undefined) ?? "all";
  const items = listShares(ctx.rt, ctx.query.call_id as string | undefined).filter((s) => {
    if (state === "active") return !s.revoked && !s.expired;
    if (state === "revoked") return s.revoked;
    if (state === "expired") return s.expired && !s.revoked;
    return true;
  });
  return { items };
});

export const OPTIONS = preflight;
