export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness: the process is up. Used by the Fly health check and Playwright's webServer probe. */
export function GET(): Response {
  return Response.json({ ok: true });
}
