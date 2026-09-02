"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CallSummary } from "@/lib/types";
import { Card, Empty, SectionTitle } from "./ui";
import { CallCard } from "./CallCard";
import { CategoryRails } from "./CategoryRails";
import type { Dashboard } from "@/lib/calls";

type Labelset = { title: string; labels: { title: string }[] };
type LabelsetMap = Record<string, Labelset>;

// Labelsets we expose as filter facets (resource-level only).
const FILTER_ORDER = ["call_reason", "call_outcome", "sentiment", "line_of_business", "disposition_flags"];

// Maps a labelset id to its dashboard tally, so facet chips can show a live count (standard B36).
function countsFor(d: Dashboard | null, labelset: string): Record<string, number> {
  if (!d) return {};
  const src =
    labelset === "call_reason" ? d.byReason : labelset === "sentiment" ? d.bySentiment : labelset === "call_outcome" ? d.byOutcome : labelset === "line_of_business" ? d.byLob : [];
  return Object.fromEntries(src.map((x) => [x.name, x.value]));
}

export function CallsExplorer() {
  const searchParams = useSearchParams();
  const [labelsets, setLabelsets] = useState<LabelsetMap>({});
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Initial filters come from the URL so dashboard / label drill-downs apply.
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [active, setActive] = useState<Set<string>>(() => new Set(searchParams.getAll("label"))); // "labelset/label"

  useEffect(() => {
    fetch("/api/labelsets").then((r) => r.json()).then((d) => setLabelsets(d.labelsets ?? {}));
    fetch("/api/dashboard").then((r) => r.json()).then(setDashboard).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      active.forEach((a) => params.append("label", a));
      // Keep the address bar in sync so the view is shareable / back-navigable.
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/calls?${qs}` : "/calls");
      fetch(`/api/calls?${params}`)
        .then((r) => r.json())
        .then((d) => setCalls(d.calls ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, active]);

  const toggle = (key: string) =>
    setActive((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const filterSets = useMemo(
    () => FILTER_ORDER.filter((id) => labelsets[id]).map((id) => ({ id, ...labelsets[id], counts: countsFor(dashboard, id) })),
    [labelsets, dashboard],
  );

  const showRails = active.size === 0 && !q.trim() && dashboard;

  return (
    <div className="space-y-8">
      {showRails && <CategoryRails byReason={dashboard!.byReason} bySentiment={dashboard!.bySentiment} />}

      <div>
        <SectionTitle count={dashboard?.total}>All calls</SectionTitle>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
          {/* Filters */}
          <aside className="space-y-4 lg:col-span-1">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search transcripts…"
              className="w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-sm text-ink-950 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {active.size > 0 && (
              <button onClick={() => setActive(new Set())} className="text-xs font-medium text-brand-600 hover:underline">
                Clear {active.size} filter{active.size > 1 ? "s" : ""}
              </button>
            )}
            {filterSets.map((ls) => (
              <Card key={ls.id} className="p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{ls.title}</div>
                <div className="flex flex-wrap gap-1.5">
                  {ls.labels.map((l) => {
                    const key = `${ls.id}/${l.title}`;
                    const on = active.has(key);
                    const c = ls.counts[l.title];
                    return (
                      <button
                        key={key}
                        onClick={() => toggle(key)}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                          on ? "bg-brand-600 text-white" : "bg-brand-50 text-slate-700 hover:bg-brand-100"
                        }`}
                      >
                        {l.title}
                        {typeof c === "number" && (
                          <span className={`text-[10px] ${on ? "text-white/80" : "text-slate-400"}`}>{c}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}
          </aside>

          {/* Results */}
          <div className="lg:col-span-3">
            <div className="mb-2 text-sm text-slate-500">{loading ? "Loading…" : `${calls.length} call${calls.length === 1 ? "" : "s"}`}</div>
            {calls.length === 0 && !loading ? (
              <Empty>No calls match your filters.</Empty>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {calls.map((c) => (
                  <CallCard key={c.id} call={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
