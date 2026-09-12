import { swaggerHtml } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-static";

/** Swagger UI with try-it-out, rendered by the shared platform helper. */
export function GET(): Response {
  return new Response(swaggerHtml("Call Analysis API", "/api/v1/openapi.json"), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
