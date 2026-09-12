/**
 * Dashboard service: cached I/O around the pure aggregation in `lib/aggregate.ts`.
 */
import { aggregate } from "@/lib/aggregate";
import type { Runtime } from "@/lib/runtime";
import { cacheKeys } from "./cache";
import { allSummaries } from "./calls";

export type { Dashboard, Datum } from "@/lib/aggregate";
export { aggregate, tally } from "@/lib/aggregate";

/** Cached dashboard: one catalog walk + cached per-call summaries, not N+1 per view. */
export async function dashboard(rt: Runtime): Promise<import("@/lib/aggregate").Dashboard> {
  return rt.cache.getOrLoad(cacheKeys.dashboard(), async () => aggregate(await allSummaries(rt)));
}
