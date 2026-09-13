import { actorOf, preflight, route } from "@/lib/api";
import { deleteApiKey, renameApiKey, revokeApiKey } from "@/services/apikeys";
import { audit } from "@/services/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route({ path: "/api/v1/api-keys/{id}", method: "put", auth: "admin" }, (ctx) => {
  const { name } = (ctx.body ?? {}) as { name?: string };
  const key = renameApiKey(ctx.rt, ctx.params.id!, name ?? "");
  audit(ctx.rt, "apikey.rename", actorOf(ctx.auth), { id: key.id, name: key.name });
  return key;
});

/**
 * Revoke by default; `?purge=true` removes the row entirely.
 *
 * The two are different operations with different consequences. Revoking stops the key working and
 * keeps the evidence — what it was called, when it was last used — which is what an incident review
 * needs. Purging destroys that record, and because key enforcement is sticky (D-CA-46) it is also
 * the only way to reopen an API that keys have closed. That is a deliberate act, so it is a
 * deliberate flag rather than a side effect of clicking Revoke.
 */
export const DELETE = route({ path: "/api/v1/api-keys/{id}", method: "delete", auth: "admin" }, (ctx) => {
  if (ctx.query.purge === true) {
    const key = revokeApiKey(ctx.rt, ctx.params.id!);
    deleteApiKey(ctx.rt, ctx.params.id!);
    audit(ctx.rt, "apikey.purge", actorOf(ctx.auth), { id: key.id, name: key.name });
    return { ...key, revoked: true, purged: true };
  }
  const key = revokeApiKey(ctx.rt, ctx.params.id!);
  audit(ctx.rt, "apikey.revoke", actorOf(ctx.auth), { id: key.id, name: key.name });
  return key;
});

export const OPTIONS = preflight;
