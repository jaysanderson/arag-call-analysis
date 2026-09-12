import { preflight, route } from "@/lib/api";
import { listOptionsFrom } from "@/lib/query";
import { matchingCalls } from "@/services/calls";
import { type ExportFormat, exportFilename, toCsv, toJson } from "@/services/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export the filtered call list.
 *
 * Served as an attachment with `Content-Disposition`, so a browser downloads it rather than
 * rendering it, and with `X-Content-Type-Options: nosniff` (applied to every response by
 * `lib/api.ts`) so a CSV cell can never be sniffed into markup.
 */
export const GET = route({ path: "/api/v1/calls/export", method: "get" }, async (ctx) => {
  const format = ((ctx.query.format as string | undefined) ?? "csv") as ExportFormat;
  const limit = (ctx.query.limit as number | undefined) ?? 1000;
  const calls = (await matchingCalls(ctx.rt, listOptionsFrom(ctx.query))).slice(0, limit);
  const body = format === "json" ? toJson(calls) : toCsv(calls);
  ctx.log.info("calls.exported", { format, rows: calls.length });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(format)}"`,
      "Cache-Control": "no-store",
    },
  });
});

export const OPTIONS = preflight;
