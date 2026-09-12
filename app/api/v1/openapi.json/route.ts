import { openapi } from "@/lib/openapi";

export const runtime = "nodejs";
export const dynamic = "force-static";

/** The contract itself. Always public, never rate limited, CORS-open so external tools can read it. */
export function GET(): Response {
  return new Response(JSON.stringify(openapi), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
