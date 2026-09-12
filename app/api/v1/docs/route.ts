import { redocHtml } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-static";

/** Redoc reference rendered by the shared platform helper. */
export function GET(): Response {
  return new Response(redocHtml("Call Analysis API", "/api/v1/openapi.json"), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
