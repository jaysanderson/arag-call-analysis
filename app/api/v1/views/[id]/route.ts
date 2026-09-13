import { noContent, preflight, route } from "@/lib/api";
import { deleteView, updateView } from "@/services/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route({ path: "/api/v1/views/{id}", method: "put", auth: "api" }, (ctx) =>
  updateView(ctx.rt, ctx.params.id!, (ctx.body ?? {}) as { name?: string; query?: string }),
);

export const DELETE = route({ path: "/api/v1/views/{id}", method: "delete", auth: "api" }, (ctx) => {
  deleteView(ctx.rt, ctx.params.id!);
  return noContent();
});

export const OPTIONS = preflight;
