/**
 * Query-string → `ListOptions` for the two routes that share the call filter surface
 * (`GET /api/v1/calls` and `GET /api/v1/calls/export`).
 *
 * The values arriving here have already been coerced and validated against the OpenAPI document
 * by `lib/api.ts`, so this is a pure rename from wire names (`media_type`, `min_duration`) to the
 * service's option names — kept in one place so the two routes can never disagree about what a
 * filter means.
 */

import type { CallSort, ListOptions } from "@/services/calls";

export function listOptionsFrom(query: Record<string, unknown>): ListOptions {
  const str = (k: string) => (typeof query[k] === "string" && query[k] ? (query[k] as string) : undefined);
  const num = (k: string) => (typeof query[k] === "number" ? (query[k] as number) : undefined);
  const bool = (k: string) => (typeof query[k] === "boolean" ? (query[k] as boolean) : undefined);
  return {
    q: str("q"),
    labels: (query.label as string[] | undefined) ?? [],
    ids: (query.ids as string[] | undefined) ?? undefined,
    agent: str("agent"),
    queue: str("queue"),
    mediaType: str("media_type") as ListOptions["mediaType"],
    from: str("from"),
    to: str("to"),
    minDuration: num("min_duration"),
    maxDuration: num("max_duration"),
    complaint: bool("complaint"),
    fcr: bool("fcr"),
    escalated: bool("escalated"),
    // Wire names match the `call_metrics` field names exactly, so a reader of the URL can see
    // which generated value a filter is testing.
    callReason: str("call_reason"),
    outcome: str("outcome"),
    sentiment: str("sentiment"),
    lineOfBusiness: str("line_of_business"),
    complaintCategory: str("complaint_category"),
    crossSellOffered: bool("cross_sell_offered"),
    crossSellAccepted: bool("cross_sell_accepted"),
    lifecycle: str("lifecycle") as ListOptions["lifecycle"],
    sort: str("sort") as CallSort | undefined,
    order: str("order") as "asc" | "desc" | undefined,
  };
}
