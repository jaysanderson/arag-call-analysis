"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, SectionTitle } from "./ui";

type Datum = { name: string; value: number };
type HrefFor = (name: string) => string | null;

const BARS = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#db2777", "#ca8a04", "#475569", "#0d9488", "#dc2626"];
const SENTIMENT_COLORS: Record<string, string> = {
  Positive: "#16a34a", Neutral: "#94a3b8", Negative: "#e11d48", Mixed: "#f59e0b",
};

function clickable(href: string | null, key: string, className: string, children: React.ReactNode) {
  if (href) {
    return (
      <Link key={key} href={href} className={`${className} cursor-pointer`}>
        {children}
      </Link>
    );
  }
  return <div key={key} className={className}>{children}</div>;
}

function HBar({ data, hrefFor }: { data: Datum[]; hrefFor?: HrefFor }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) =>
        clickable(
          hrefFor?.(d.name) ?? null,
          d.name,
          "flex items-center gap-2 group",
          <>
            <div className="w-32 shrink-0 truncate text-right text-xs text-slate-600 group-hover:text-brand-600" title={d.name}>{d.name}</div>
            <div className="h-5 flex-1 rounded bg-slate-100">
              <div
                className="flex h-5 items-center justify-end rounded px-1.5 text-[10px] font-semibold text-white transition-[filter] group-hover:brightness-110"
                style={{ width: `${Math.max((d.value / max) * 100, 6)}%`, background: BARS[i % BARS.length] }}
              >
                {d.value}
              </div>
            </div>
          </>,
        ),
      )}
    </div>
  );
}

function Donut({ data, hrefFor }: { data: Datum[]; hrefFor?: HrefFor }) {
  const router = useRouter();
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
          const href = hrefFor?.(d.name) ?? null;
          const seg = (
            <circle key={d.name} cx="80" cy="80" r={R} fill="none"
              stroke={SENTIMENT_COLORS[d.name] ?? BARS[i % BARS.length]}
              strokeWidth="24" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
              onClick={href ? () => router.push(href) : undefined}
              className={href ? "cursor-pointer transition-opacity hover:opacity-80" : ""}>
              {href && <title>{`${d.name} (${d.value}) — view calls`}</title>}
            </circle>
          );
          offset += dash;
          return seg;
        })}
        <circle cx="80" cy="80" r="44" fill="white" className="pointer-events-none" />
      </svg>
      <div className="space-y-1 text-xs">
        {data.map((d, i) =>
          clickable(
            hrefFor?.(d.name) ?? null,
            d.name,
            "flex items-center gap-1.5 text-slate-600 hover:text-brand-600",
            <>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SENTIMENT_COLORS[d.name] ?? BARS[i % BARS.length] }} />
              {d.name} <span className="text-slate-400">({d.value})</span>
            </>,
          ),
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="flex h-24 items-center justify-center text-sm text-slate-400">No data yet</div>;
}

function Funnel({ label, value, max, color, href }: { label: string; value: number; max: number; color: string; href: string | null }) {
  const h = Math.round((value / max) * 110) + 10;
  const inner = (
    <>
      <div className="w-16 rounded-t-md transition-[filter] group-hover:brightness-110" style={{ height: h, background: color }} />
      <div className="text-sm font-semibold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </>
  );
  return clickable(href, label, "flex flex-col items-center gap-1 group", inner);
}

export function DashboardCharts({
  byReason, bySentiment, byOutcome, byLob, complaintsByCategory, crossSell,
}: {
  byReason: Datum[]; bySentiment: Datum[]; byOutcome: Datum[]; byLob: Datum[];
  complaintsByCategory: Datum[]; crossSell: { offered: number; accepted: number };
}) {
  const link = (labelset: string, label: string) => `/calls?label=${encodeURIComponent(`${labelset}/${label}`)}`;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="p-4">
        <SectionTitle>Calls by reason</SectionTitle>
        <HBar data={byReason} hrefFor={(n) => link("call_reason", n)} />
      </Card>
      <Card className="p-4">
        <SectionTitle>Sentiment mix</SectionTitle>
        <Donut data={bySentiment} hrefFor={(n) => link("sentiment", n)} />
      </Card>
      <Card className="p-4">
        <SectionTitle>Outcomes</SectionTitle>
        <HBar data={byOutcome} hrefFor={(n) => link("call_outcome", n)} />
      </Card>
      <Card className="p-4">
        <SectionTitle>Line of business</SectionTitle>
        <HBar data={byLob} hrefFor={(n) => link("line_of_business", n)} />
      </Card>
      <Card className="p-4">
        <SectionTitle>Complaints by category</SectionTitle>
        {/* category is not a label; drill into all complaint calls */}
        <HBar data={complaintsByCategory} hrefFor={() => link("disposition_flags", "Complaint Raised")} />
      </Card>
      <Card className="p-4">
        <SectionTitle>Cross-sell funnel</SectionTitle>
        <div className="flex items-end gap-6 px-2 pt-4">
          <Funnel label="Offered" value={crossSell.offered} max={Math.max(crossSell.offered, 1)} color="#2563eb" href={link("disposition_flags", "Cross-sell Offered")} />
          <Funnel label="Accepted" value={crossSell.accepted} max={Math.max(crossSell.offered, 1)} color="#16a34a" href={link("disposition_flags", "Cross-sell Accepted")} />
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
