"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CallSummary } from "@/lib/types";
import { CallCard } from "./CallCard";

type Datum = { name: string; value: number };

/**
 * Multi-row, category-led discovery (standard B35 / ui-polish-standard §B —
 * the Netflix pattern): each row is a real category with a LIVE count badge
 * and a horizontal rail of real call cards, backed by the same /api/calls
 * and /api/dashboard routes the rest of the app already uses (no new ARAG
 * calls — this reuses the existing labelset-filtered listCalls() call,
 * issued once per rail category).
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
  const href = `/calls?label=${encodeURIComponent(`${labelset}/${name}`)}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/calls?label=${encodeURIComponent(`${labelset}/${name}`)}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setCalls((d.calls ?? []).slice(0, 10)))
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
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">{count}</span>
        </h2>
        <Link href={href} className="text-xs font-medium text-brand-600 hover:underline">
          See all →
        </Link>
      </div>
      <div className="scroll-thin-x flex gap-3 overflow-x-auto pb-2">
        {calls === null &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[188px] w-56 shrink-0 animate-pulse rounded-lg border border-brand-100 bg-white/60" />
          ))}
        {calls?.length === 0 && <div className="py-6 text-sm text-slate-400">No calls in this category yet.</div>}
        {calls?.map((c) => (
          <div key={c.id} className="w-56 shrink-0">
            <CallCard call={c} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
