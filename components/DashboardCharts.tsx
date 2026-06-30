"use client";

import { Card, SectionTitle } from "./ui";

type Datum = { name: string; value: number };

const BARS = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#db2777", "#ca8a04", "#475569", "#0d9488", "#dc2626"];
const SENTIMENT_COLORS: Record<string, string> = {
  Positive: "#16a34a", Neutral: "#94a3b8", Negative: "#e11d48", Mixed: "#f59e0b",
};

function HBar({ data }: { data: Datum[] }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={d.name} className="flex items-center gap-2">
          <div className="w-32 shrink-0 truncate text-right text-xs text-slate-600" title={d.name}>{d.name}</div>
          <div className="h-5 flex-1 rounded bg-slate-100">
            <div
              className="flex h-5 items-center justify-end rounded px-1.5 text-[10px] font-semibold text-white"
              style={{ width: `${Math.max((d.value / max) * 100, 6)}%`, background: BARS[i % BARS.length] }}
            >
              {d.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Donut({ data }: { data: Datum[] }) {
  if (!data.length) return <Empty />;
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const R = 60, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * C;
          const seg = (
            <circle
              key={d.name}
              cx="80" cy="80" r={R}
              fill="none"
              stroke={SENTIMENT_COLORS[d.name] ?? BARS[i % BARS.length]}
              strokeWidth="24"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return seg;
        })}
        <circle cx="80" cy="80" r="44" fill="white" />
      </svg>
      <div className="space-y-1 text-xs text-slate-600">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SENTIMENT_COLORS[d.name] ?? BARS[i % BARS.length] }} />
            {d.name} <span className="text-slate-400">({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="flex h-24 items-center justify-center text-sm text-slate-400">No data yet</div>;
}

function Funnel({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const h = Math.round((value / max) * 110) + 10;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-16 rounded-t-md transition-all" style={{ height: h, background: color }} />
      <div className="text-sm font-semibold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export function DashboardCharts({
  byReason, bySentiment, byOutcome, byLob, complaintsByCategory, crossSell,
}: {
  byReason: Datum[]; bySentiment: Datum[]; byOutcome: Datum[]; byLob: Datum[];
  complaintsByCategory: Datum[]; crossSell: { offered: number; accepted: number };
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="p-4"><SectionTitle>Calls by reason</SectionTitle><HBar data={byReason} /></Card>
      <Card className="p-4"><SectionTitle>Sentiment mix</SectionTitle><Donut data={bySentiment} /></Card>
      <Card className="p-4"><SectionTitle>Outcomes</SectionTitle><HBar data={byOutcome} /></Card>
      <Card className="p-4"><SectionTitle>Line of business</SectionTitle><HBar data={byLob} /></Card>
      <Card className="p-4"><SectionTitle>Complaints by category</SectionTitle><HBar data={complaintsByCategory} /></Card>
      <Card className="p-4">
        <SectionTitle>Cross-sell funnel</SectionTitle>
        <div className="flex items-end gap-6 px-2 pt-4">
          <Funnel label="Offered" value={crossSell.offered} max={Math.max(crossSell.offered, 1)} color="#2563eb" />
          <Funnel label="Accepted" value={crossSell.accepted} max={Math.max(crossSell.offered, 1)} color="#16a34a" />
          <div className="ml-auto text-right">
            <div className="text-3xl font-semibold text-slate-900">
              {crossSell.offered ? Math.round((crossSell.accepted / crossSell.offered) * 100) : 0}%
            </div>
            <div className="text-xs text-slate-500">accept rate</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
