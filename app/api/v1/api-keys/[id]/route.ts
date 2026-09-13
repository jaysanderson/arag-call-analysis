import { actorOf, preflight, route } from "@/lib/api";
import { renameApiKey, revokeApiKey } from "@/services/apikeys";
import { audit } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route({ path: "/api/v1/api-keys/{id}", method: "put", auth: "admin" }, (ctx) => {
  const { name } = (ctx.body ?? {}) as { name?: string };
  const key = renameApiKey(ctx.rt, ctx.params.id!, name ?? "");
  audit(ctx.rt, "apikey.rename", actorOf(ctx.auth), { id: key.id, name: key.name });
  return key;
});

export const DELETE = route({ path: "/api/v1/api-keys/{id}", method: "delete", auth: "admin" }, (ctx) => {
  const key = revokeApiKey(ctx.rt, ctx.params.id!);
  audit(ctx.rt, "apikey.revoke", actorOf(ctx.auth), { id: key.id, name: key.name });
  return key;
});

export const OPTIONS = preflight;
