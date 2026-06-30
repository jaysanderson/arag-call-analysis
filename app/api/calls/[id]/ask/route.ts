import { NextRequest } from "next/server";
import { askResourceStream } from "@/lib/arag";

export const dynamic = "force-dynamic";

/**
 * Proxy a resource-scoped ask. Streams the upstream NDJSON straight back to the
 * browser so the client can render the answer incrementally and resolve
 * citations to transcript paragraphs / media timestamps.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return new Response(JSON.stringify({ error: "question required" }), { status: 400 });
  }
  const upstream = await askResourceStream(id, question);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
