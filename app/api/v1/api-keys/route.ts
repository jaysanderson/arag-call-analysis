import { actorOf, jsonResponse, preflight, route } from "@/lib/api";
import { createApiKey, listApiKeys } from "@/services/apikeys";
import { audit } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/api-keys", method: "get", auth: "admin" }, (ctx) => ({
  items: listApiKeys(ctx.rt),
}));

export const POST = route({ path: "/api/v1/api-keys", method: "post", auth: "admin" }, (ctx) => {
  const { name } = (ctx.body ?? {}) as { name?: string };
  const created = createApiKey(ctx.rt, name ?? "", actorOf(ctx.auth));
  audit(ctx.rt, "apikey.create", actorOf(ctx.auth), { id: created.key.id, name: created.key.name });
  // 201 with the secret — the one and only time it exists outside the caller's hands.
  return jsonResponse(created, 201, { Location: `/api/v1/api-keys/${created.key.id}` });
});

export const OPTIONS = preflight;
