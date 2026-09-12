import { preflight, route } from "@/lib/api";
import { getCall } from "@/services/calls";
import { callToJson, toVtt, transcriptText } from "@/services/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
};

export const GET = route({ path: "/api/v1/calls/{id}/export", method: "get" }, async (ctx) => {
  const format = (ctx.query.format as string | undefined) ?? "json";
  const call = await getCall(ctx.rt, ctx.params.id!);
  const body = format === "txt" ? transcriptText(call) : format === "vtt" ? toVtt(call) : callToJson(call);
  const name = `${call.slug || call.id}.${format}`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": TYPES[format] ?? TYPES.json!,
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
});

export const OPTIONS = preflight;
