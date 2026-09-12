import { route } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SEC = 12 * 3600;

/**
 * Issue a signed, same-origin session cookie so the demo UI can call API-key-protected routes
 * without a key ever reaching the browser. Rate-limited like any other public route.
 */
export const POST = route({ path: "/api/v1/session", method: "post", body: "none" }, (ctx) => {
  const token = ctx.rt.app.issueSession(TTL_SEC, "demo");
  ctx.setCookie("arag_session", token, { maxAge: TTL_SEC, sameSite: "Lax" });
  return { ok: true, expiresIn: TTL_SEC };
});
