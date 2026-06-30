import { NextRequest } from "next/server";
import { downloadFileField } from "@/lib/arag";

export const dynamic = "force-dynamic";

/**
 * Streams the call's media file from ARAG through our server so the browser
 * never sees the API key. Forwards Range requests so the player can scrub.
 * The file field is "media" for audio/video resources.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const field = new URL(req.url).searchParams.get("field") ?? "media";
  const range = req.headers.get("range");

  const upstream = await downloadFileField(id, field, range);
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`media unavailable (${upstream.status})`, { status: upstream.status });
  }

  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");

  return new Response(upstream.body, { status: upstream.status, headers });
}
