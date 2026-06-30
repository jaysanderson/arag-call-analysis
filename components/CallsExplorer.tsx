"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CallSummary } from "@/lib/types";
import { Card, Chip, MediaBadge } from "./ui";
import { fmtDate, fmtTime, colorFor, SENTIMENT_COLOR } from "@/lib/format";

type Labelset = { title: string; labels: { title: string }[] };
type LabelsetMap = Record<string, Labelset>;

// Labelsets we expose as filter facets (resource-level only).
const FILTER_ORDER = ["call_reason", "call_outcome", "sentiment", "line_of_business", "disposition_flags"];

export function CallsExplorer() {
  const searchParams = useSearchParams();
  const [labelsets, setLabelsets] = useState<LabelsetMap>({});
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Initial filters come from the URL so dashboard / label drill-downs apply.
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [active, setActive] = useState<Set<string>>(() => new Set(searchParams.getAll("label"))); // "labelset/label"

  useEffect(() => {
    fetch("/api/labelsets").then((r) => r.json()).then((d) => setLabelsets(d.labelsets ?? {}));
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
    () => FILTER_ORDER.filter((id) => labelsets[id]).map((id) => ({ id, ...labelsets[id] })),
    [labelsets],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      {/* Filters */}
      <aside className="lg:col-span-1 space-y-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search transcripts…"
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        {active.size > 0 && (
          <button onClick={() => setActive(new Set())} className="text-xs text-brand-600 hover:underline">
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
                return (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium transition ${
                      on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {l.title}
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </aside>

      {/* Results */}
      <div className="lg:col-span-3">
        <div className="mb-2 text-sm text-slate-500">{loading ? "Loading…" : `${calls.length} calls`}</div>
        <Card className="divide-y divide-slate-100">
          {calls.map((c) => (
            <Link key={c.id} href={`/calls/${c.id}`} className="block p-4 hover:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MediaBadge type={c.mediaType} />
                    <h3 className="truncate font-medium text-slate-900">{c.title}</h3>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.labels
                      .filter((l) => l.labelset !== "moment")
                      .slice(0, 6)
                      .map((l) => (
                        <Chip
                          key={`${l.labelset}-${l.label}`}
                          label={l.label}
                          className={l.labelset === "sentiment" ? SENTIMENT_COLOR[l.label] : colorFor(l.labelset)}
                        />
                      ))}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500">
                  <div>{fmtDate(c.createdISO)}</div>
                  {c.durationSec && <div>{fmtTime(c.durationSec)}</div>}
                  {c.agentName && <div className="text-slate-400">{c.agentName}</div>}
                </div>
              </div>
            </Link>
          ))}
          {!loading && calls.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">No calls match your filters.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
