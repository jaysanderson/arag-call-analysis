"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CallSummary } from "@/lib/types";
import { CallCard } from "./CallCard";
import { IconChevronRight } from "./icons";

type Datum = { name: string; value: number };

/**
 * Multi-row, category-led discovery (standard B35 / ui-polish-standard §B —
 * the Netflix pattern): each row is a real category with a LIVE count badge
 * and a horizontal rail of real call cards, backed by the same /api/v1/calls
 * and /api/v1/dashboard routes the rest of the app already uses. Each rail is one
 * cached service call: the catalog ids and every per-call summary behind it are
 * served from the 60 s cache, so rails cost no extra ARAG round-trips.
 */
export function CategoryRails({ byReason, bySentiment }: { byReason: Datum[]; bySentiment: Datum[] }) {
  const reasonRails = byReason.slice(0, 2);
  const sentimentRails = bySentiment.slice(0, 1);
  const rails = [
    ...sentimentRails.map((d) => ({ labelset: "sentiment", ...d })),
    ...reasonRails.map((d) => ({ labelset: "call_reason", ...d })),
  ];

  if (rails.length === 0) return null;

  return (
    <div className="space-y-6">
      {rails.map((r) => (
        <Rail key={`${r.labelset}/${r.name}`} labelset={r.labelset} name={r.name} count={r.value} />
      ))}
    </div>
  );
}

function Rail({ labelset, name, count }: { labelset: string; name: string; count: number }) {
  const [calls, setCalls] = useState<CallSummary[] | null>(null);
  /**
   * The badge shows the count the *rail's own query* returns, not the dashboard tally.
   *
   * The two can legitimately differ: the dashboard counts `call_metrics.call_reason`, written by
   * the ask agent, while a rail filters on the `call_reason/...` label, applied by the labeler
   * agent. A badge reading 6 above a rail of 3 cards is the product calling itself a liar, so the
   * dashboard number is only a placeholder until the real one arrives.
   */
  const [total, setTotal] = useState<number>(count);
  const href = `/calls?label=${encodeURIComponent(`${labelset}/${name}`)}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/calls?page_size=10&label=${encodeURIComponent(`${labelset}/${name}`)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setCalls((d.items ?? []).slice(0, 10));
        if (typeof d.total === "number") setTotal(d.total);
      })
      .catch(() => !cancelled && setCalls([]));
    return () => {
      cancelled = true;
    };
  }, [labelset, name]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink-950">
          {name}
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
            {total}
          </span>
        </h2>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
        >
          See all
          <IconChevronRight size={13} />
        </Link>
      </div>
      <div className="scroll-thin-x flex gap-3 overflow-x-auto pb-2">
        {calls === null &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[188px] w-56 shrink-0 animate-pulse rounded-lg border border-brand-100 bg-white/60"
            />
          ))}
        {calls?.length === 0 && (
          <div className="py-6 text-sm text-slate-400">No calls in this category yet.</div>
        )}
        {calls?.map((c) => (
          <div key={c.id} className="w-56 shrink-0">
            <CallCard call={c} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
