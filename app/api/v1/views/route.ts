import { actorOf, jsonResponse, preflight, route } from "@/lib/api";
import { createView, listViews } from "@/services/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/views", method: "get" }, (ctx) => ({
  items: listViews(ctx.rt),
}));

export const POST = route({ path: "/api/v1/views", method: "post", auth: "api" }, (ctx) => {
  const body = (ctx.body ?? {}) as { name?: string; query?: string; description?: string };
  const view = createView(ctx.rt, {
    name: body.name ?? "",
    query: body.query ?? "",
    description: body.description,
    createdBy: actorOf(ctx.auth),
  });
  return jsonResponse(view, 201, { Location: `/api/v1/views/${view.id}` });
});

export const OPTIONS = preflight;
