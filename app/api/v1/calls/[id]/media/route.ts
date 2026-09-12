import { route } from "@/lib/api";
import { MEDIA_FIELD_ALLOWLIST, mediaStream } from "@/services/calls";
import { badRequest } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Headers worth forwarding from the upstream file response so the player can seek. */
const PASS_THROUGH = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

export const GET = route(
  { path: "/api/v1/calls/{id}/media", method: "get", noRateLimit: true },
  async (ctx) => {
    const field = (ctx.query.field as string | undefined) ?? "media";
    // Defence in depth: the OpenAPI enum already rejects anything else, but the service layer
    // re-checks so a caller can never name an arbitrary field on someone else's resource.
    if (!(MEDIA_FIELD_ALLOWLIST as readonly string[]).includes(field))
      throw badRequest(`field must be one of ${MEDIA_FIELD_ALLOWLIST.join(", ")}`);

    const upstream = await mediaStream(
      ctx.rt,
      ctx.params.id!,
      field,
      ctx.req.headers.get("range"),
      ctx.req.signal,
    );
    const headers = new Headers();
    for (const h of PASS_THROUGH) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "private, max-age=3600");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
);
