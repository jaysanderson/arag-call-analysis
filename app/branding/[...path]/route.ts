import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves partner branding assets from `DATA_DIR/branding/`, so a white-label deployment can mount
 * a logo on a volume without rebuilding the image (`BRAND_LOGO_URL=/branding/logo.svg`).
 *
 * Deliberately narrow: image types only, no directory listing, and every resolved path must stay
 * inside the branding directory — a `..` segment can never escape it.
 */
const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

export async function GET(_req: Request, args: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const rt = await getRuntime();
  const root = resolve(rt.env.dataDir, "branding");
  const rel = ((await args.params).path ?? []).join("/");
  const file = normalize(resolve(root, `.${sep}${rel}`));
  if (file !== root && !file.startsWith(root + sep)) return new Response("Not found", { status: 404 });

  const type = TYPES[extname(file).toLowerCase()];
  if (!type || !existsSync(file) || !statSync(file).isFile())
    return new Response("Not found", { status: 404 });

  const stat = statSync(file);
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
