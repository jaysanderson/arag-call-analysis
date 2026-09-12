import { preflight, route } from "@/lib/api";
import { constantTimeEqual, forbidden, unauthorized } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SEC = 8 * 3600;

/**
 * Exchange the admin token for an HttpOnly cookie so the admin pages never hold the token in
 * JavaScript. The comparison is constant-time; failures are logged (without the attempt value).
 */
export const POST = route({ path: "/api/v1/admin/login", method: "post" }, (ctx) => {
  const { token } = ctx.body as { token: string };
  const expected = ctx.rt.env.adminToken;
  if (!expected) throw forbidden("Admin access is disabled: set ADMIN_TOKEN to enable the admin panel.");
  if (!constantTimeEqual(token, expected)) {
    ctx.log.warn("admin.login.failed", { ip: ctx.ip });
    throw unauthorized("Invalid admin token");
  }
  ctx.setCookie("arag_admin", expected, { maxAge: TTL_SEC, sameSite: "Lax" });
  ctx.log.info("admin.login.ok", { ip: ctx.ip });
  return { ok: true };
});

export const OPTIONS = preflight;
