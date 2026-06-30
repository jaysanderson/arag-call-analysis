import Link from "next/link";
import { dashboard } from "@/lib/calls";
import { Kpi, Card, Chip, SectionTitle, MediaBadge } from "@/components/ui";
import { DashboardCharts } from "@/components/DashboardCharts";
import { pct, fmtDate, colorFor, SENTIMENT_COLOR } from "@/lib/format";

export const dynamic = "force-dynamic";

// Drill-down link into the filtered calls list.
const lc = (labelset: string, label: string) => `/calls?label=${encodeURIComponent(`${labelset}/${label}`)}`;

export default async function Home() {
  let d;
  try {
    d = await dashboard();
  } catch (e) {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">Could not reach the knowledge box: {String(e)}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Call Analytics</h1>
          <p className="text-sm text-slate-500">
            Aggregated across {d.total} analyzed call{d.total === 1 ? "" : "s"}
            {d.withMetrics < d.total ? ` (${d.withMetrics} with AI metrics)` : ""}.
          </p>
        </div>
        <Link href="/calls" className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Browse calls →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Total calls" value={String(d.total)} href="/calls" />
        <Kpi label="First-call resolution" value={pct(d.fcrRate)} accent="text-emerald-600" href={lc("disposition_flags", "First-Call Resolution")} />
        <Kpi label="Complaint rate" value={pct(d.complaintRate)} accent="text-rose-600" href={lc("disposition_flags", "Complaint Raised")} />
        <Kpi label="Cross-sell accept" value={pct(d.crossSellAcceptRate)} sub={`${pct(d.crossSellOfferRate)} offered`} accent="text-brand-600" href={lc("disposition_flags", "Cross-sell Accepted")} />
        <Kpi label="Avg compliance" value={String(d.avgCompliance)} sub="0–100" href="/calls" />
        <Kpi label="Avg CSAT" value={d.avgCsat ? `${d.avgCsat}/5` : "—"} href="/calls" />
      </div>

      <DashboardCharts
        byReason={d.byReason}
        bySentiment={d.bySentiment}
        byOutcome={d.byOutcome}
        byLob={d.byLob}
        complaintsByCategory={d.complaintsByCategory}
        crossSell={d.crossSell}
      />

      <Card className="p-4">
        <SectionTitle right={<Link href="/calls" className="text-xs text-brand-600 hover:underline">View all</Link>}>
          Recent calls
        </SectionTitle>
        <div className="divide-y divide-slate-100">
          {d.recent.map((c) => (
            <Link key={c.id} href={`/calls/${c.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded">
              <MediaBadge type={c.mediaType} />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{c.title}</span>
              {c.metrics?.sentiment && (
                <Chip label={c.metrics.sentiment} className={SENTIMENT_COLOR[c.metrics.sentiment]} />
              )}
              {c.metrics?.call_reason && <Chip label={c.metrics.call_reason} className={colorFor(c.metrics.call_reason)} />}
              <span className="shrink-0 text-xs text-slate-400">{fmtDate(c.createdISO)}</span>
            </Link>
          ))}
          {d.recent.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No calls yet.</div>}
        </div>
      </Card>
    </div>
  );
}
