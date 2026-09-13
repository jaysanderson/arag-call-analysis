/**
 * Retention and purge.
 *
 * A contact centre keeps call recordings for as long as its regulator and its contracts say it
 * may, and not a day longer. This product therefore has to be able to answer two questions in the
 * UI: *what would be deleted under this policy*, and *delete it now*. Both are here.
 *
 * The design rule is that retention never deletes anything without a person or an explicit policy
 * asking it to. There is no background sweeper: `enabled` records the intent, the preview is
 * always available, and the purge runs when someone presses the button or a scheduler calls the
 * endpoint. A timer quietly removing a partner's evidence on a Sunday night is the failure mode
 * this avoids — and a purge that reports what it *would* do before it does it is the difference
 * between a retention feature and an accident.
 *
 * A purge deletes the Knowledge Box resource, which is irreversible; the share links pointing at
 * a purged call are revoked in the same pass so no live URL is left resolving to nothing.
 */

import type { Runtime } from "@/lib/runtime";
import type { CallSummary } from "@/lib/types";
import { badRequest } from "@/vendor/arag-platform/src/index.ts";
import { allSummaries, deleteCall } from "./calls";
import { effective } from "./config";
import { listShares, revokeShare } from "./shares";

export interface PurgeCandidate {
  id: string;
  title: string;
  createdISO?: string;
  ageDays: number;
}

export interface PurgePreview {
  /** The policy the preview was computed against. */
  days: number;
  enabled: boolean;
  cutoffISO: string;
  candidates: PurgeCandidate[];
  total: number;
  /** Calls the policy keeps. */
  retained: number;
}

export interface PurgeResult {
  days: number;
  cutoffISO: string;
  deleted: string[];
  failed: Array<{ id: string; error: string }>;
  sharesRevoked: number;
  dryRun: boolean;
  /** Calls this run was asked to delete: the policy's candidates, narrowed by `ids` if given. */
  scoped: number;
  /**
   * Of those, how many are still outstanding afterwards — the per-run cap, plus anything that
   * failed. Non-zero means "run again"; reporting a capped run as finished is the failure this
   * field exists to prevent.
   */
  remaining: number;
}

/**
 * One run deletes at most this many calls, so a purge is a bounded request rather than an
 * open-ended job holding a connection for minutes. `remaining` reports the rest, because telling
 * an operator an irreversible job has finished when it has not is the worse failure.
 */
export const MAX_PURGE_PER_RUN = 200;

export function ageDays(call: CallSummary, now = Date.now()): number {
  const t = call.createdISO ? Date.parse(call.createdISO) : Number.NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/**
 * Which calls a policy of `days` would remove. `days` defaults to the saved policy; passing it
 * explicitly is what lets the UI preview a policy before saving it.
 */
export async function purgePreview(rt: Runtime, days?: number, now = Date.now()): Promise<PurgePreview> {
  const policy = effective(rt).retention;
  const effectiveDays = days ?? policy.days;
  if (!Number.isFinite(effectiveDays) || effectiveDays < 0) throw badRequest("days must be 0 or more");
  const all = await allSummaries(rt);
  const cutoffISO = new Date(now - effectiveDays * 86_400_000).toISOString();
  // A policy of 0 days means "no retention limit", not "delete everything" — the destructive
  // reading of a default-valued field is never the right one.
  const candidates: PurgeCandidate[] =
    effectiveDays === 0
      ? []
      : all
          .filter((c) => (c.createdISO ?? "") !== "" && (c.createdISO as string) < cutoffISO)
          .map((c) => ({
            id: c.id,
            title: c.title,
            createdISO: c.createdISO,
            ageDays: ageDays(c, now),
          }))
          .sort((a, b) => b.ageDays - a.ageDays);
  return {
    days: effectiveDays,
    enabled: policy.enabled,
    cutoffISO,
    candidates,
    total: candidates.length,
    retained: all.length - candidates.length,
  };
}

/**
 * Apply the policy. `dryRun` returns the same shape without deleting, so the confirm dialog and
 * the real run share one code path and cannot disagree about what is in scope.
 */
export async function runPurge(
  rt: Runtime,
  opts: { days?: number; dryRun?: boolean; ids?: string[] } = {},
  now = Date.now(),
): Promise<PurgeResult> {
  const preview = await purgePreview(rt, opts.days, now);
  const scope = opts.ids?.length
    ? preview.candidates.filter((c) => opts.ids?.includes(c.id))
    : preview.candidates;
  const batch = scope.slice(0, MAX_PURGE_PER_RUN);

  const result: PurgeResult = {
    days: preview.days,
    cutoffISO: preview.cutoffISO,
    deleted: [],
    failed: [],
    sharesRevoked: 0,
    dryRun: Boolean(opts.dryRun),
    scoped: scope.length,
    remaining: scope.length,
  };
  if (opts.dryRun) {
    result.deleted = batch.map((c) => c.id);
    result.remaining = scope.length - batch.length;
    return result;
  }

  for (const c of batch) {
    try {
      await deleteCall(rt, c.id);
    } catch (err) {
      result.failed.push({ id: c.id, error: (err as Error).message });
      continue;
    }
    // Recorded as deleted before the share sweep, and the sweep is outside the try: the call is
    // gone either way, and a failure to revoke a link must not report the same id as both deleted
    // and failed.
    result.deleted.push(c.id);
    for (const share of listShares(rt, c.id)) {
      if (share.revoked) continue;
      revokeShare(rt, share.id);
      result.sharesRevoked++;
    }
  }
  result.remaining = scope.length - result.deleted.length;
  if (result.deleted.length) rt.cache.clear();
  return result;
}
