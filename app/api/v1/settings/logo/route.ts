import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { actorOf, preflight, route } from "@/lib/api";
import { audit, updateSettings } from "@/services/config";
import { settings } from "@/services/settings";
import { badRequest, HttpError } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The logo is written to `DATA_DIR/branding/` rather than into the store, because it is a file and
 * the store is a JSON document — a base64 image in a settings row would be reloaded on every read
 * of every unrelated setting. `GET /branding/{path}` serves it with `Content-Security-Policy:
 * sandbox` and `X-Content-Type-Options: nosniff`, which is what makes accepting an SVG safe: an SVG
 * is a document that can carry script, and the sandbox is what stops it running with this origin's
 * privileges.
 */
const TYPES: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const MAX_LOGO_BYTES = 512 * 1024;

export const POST = route(
  {
    path: "/api/v1/settings/logo",
    method: "post",
    auth: "admin",
    body: "multipart",
    bodyLimit: MAX_LOGO_BYTES,
  },
  async (ctx) => {
    const file = ctx.form?.get("logo");
    if (!(file instanceof File) || file.size === 0) throw badRequest("A `logo` file is required");
    const ext = TYPES[(file.type || "").toLowerCase()];
    if (!ext)
      throw new HttpError(
        415,
        "Unsupported media type",
        `logo must be one of: ${Object.keys(TYPES).join(", ")}`,
      );
    if (file.size > MAX_LOGO_BYTES)
      throw new HttpError(413, "Payload too large", `logo exceeds ${MAX_LOGO_BYTES} bytes`);

    const dir = resolve(ctx.rt.env.dataDir, "branding");
    mkdirSync(dir, { recursive: true });
    // A fixed name per extension, with a cache-busting query on the stored URL: a partner who
    // re-uploads their mark must see the new one without clearing their browser cache, and an
    // accumulating pile of orphaned uploads is not a feature.
    const name = `logo.${ext}`;
    writeFileSync(resolve(dir, name), Buffer.from(await file.arrayBuffer()));
    for (const other of Object.values(TYPES)) {
      if (other !== ext) rmSync(resolve(dir, `logo.${other}`), { force: true });
    }
    updateSettings(
      ctx.rt,
      "branding",
      { logoUrl: `/branding/${name}?v=${Date.now().toString(36)}` },
      actorOf(ctx.auth),
    );
    audit(ctx.rt, "settings.logo.upload", actorOf(ctx.auth), { type: file.type, bytes: file.size });
    return settings(ctx.rt);
  },
);

export const DELETE = route({ path: "/api/v1/settings/logo", method: "delete", auth: "admin" }, (ctx) => {
  const dir = resolve(ctx.rt.env.dataDir, "branding");
  for (const ext of Object.values(TYPES)) rmSync(resolve(dir, `logo.${ext}`), { force: true });
  updateSettings(ctx.rt, "branding", { logoUrl: "" }, actorOf(ctx.auth));
  audit(ctx.rt, "settings.logo.remove", actorOf(ctx.auth));
  return settings(ctx.rt);
});

export const OPTIONS = preflight;
