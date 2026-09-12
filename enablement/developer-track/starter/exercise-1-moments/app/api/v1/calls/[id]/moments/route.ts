// Starter skeleton for Exercise 1 (enablement/developer-track/exercises/01-add-endpoint.md).
//
// Copy this file to app/api/v1/calls/[id]/moments/route.ts in the real repo and fill in the TODOs.
// Compare with the working GET handler in app/api/v1/calls/[id]/route.ts for the pattern.

import { route } from "@/lib/api";
// TODO: import your new service function once you've written it, e.g.:
// import { momentsOf } from "@/services/calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO: add the matching path + method to lib/openapi.ts (see ../../../../../openapi-fragment.md)
// and to the API_ROUTES list at the bottom of that file, before this will validate correctly.
export const GET = route({ path: "/api/v1/calls/{id}/moments", method: "get" }, async (ctx) => {
  // TODO: call your service function with ctx.rt and ctx.params.id, and return its result.
  // The handler itself should be one line — all the real work belongs in services/calls.ts.
  throw new Error("not implemented");
});
