import { actorOf, preflight, route } from "@/lib/api";
import { audit } from "@/services/config";
import { reseedMissing } from "@/services/taxonomy-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add shipped labelsets this deployment's taxonomy store does not hold.
 *
 * Seeding happens once, so a labelset added to the product in a later release cannot otherwise
 * reach a deployment that has already been seeded — and making seeding run every *boot* would
 * resurrect anything an operator had deliberately deleted behind their back. This is the explicit
 * path across that line: it only adds, an edited definition survives untouched, a deleted one does
 * come back, and the response names exactly what arrived so it can be undone.
 *
 * Operator-only because it changes the vocabulary the whole deployment classifies with.
 */
export const POST = route({ path: "/api/v1/admin/reseed", method: "post", auth: "admin" }, (ctx) => {
  const result = reseedMissing(ctx.rt);
  audit(ctx.rt, "taxonomy.reseed", actorOf(ctx.auth), {
    added: result.added,
    skipped: result.skipped.length,
  });
  return result;
});

export const OPTIONS = preflight;
