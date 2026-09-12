import Link from "next/link";
import { CallCard } from "@/components/CallCard";
import { DashboardCharts } from "@/components/DashboardCharts";
import { Button, Card, Kpi, SectionTitle } from "@/components/ui";
import { pct } from "@/lib/format";
import { getRuntime } from "@/lib/runtime";
import { dashboard } from "@/services/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  let d: Awaited<ReturnType<typeof dashboard>>;
  try {
    // Server components call the same service layer the API does — no duplicated ARAG logic.
    d = await dashboard(await getRuntime());
  } catch {
    return (
      <Card className="p-6">
        <h1 className="font-display text-lg font-semibold text-ink-950">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">
          Could not reach the Knowledge Box right now. Open{" "}
          <Link href="/admin/health" className="text-brand-600 underline">
            admin health
          </Link>{" "}
          for the connection test.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-950">Call Analytics</h1>
          <p className="text-sm text-slate-500">
            Aggregated across {d.total} analyzed call{d.total === 1 ? "" : "s"}
            {d.withMetrics < d.total ? ` (${d.withMetrics} with AI metrics)` : ""}.
          </p>
        </div>
        <Button href="/calls">Browse calls →</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Total calls" value={String(d.total)} href="/calls" />
        <Kpi
          label="First-call resolution"
          value={pct(d.fcrRate)}
          accent="text-accent-fg-light"
          href={lc("disposition_flags", "First-Call Resolution")}
        />
        <Kpi
          label="Complaint rate"
          value={pct(d.complaintRate)}
          accent="text-danger-fg"
          href={lc("disposition_flags", "Complaint Raised")}
        />
        <Kpi
          label="Cross-sell accept"
          value={pct(d.crossSellAcceptRate)}
          sub={`${pct(d.crossSellOfferRate)} offered`}
          accent="text-brand-600"
          href={lc("disposition_flags", "Cross-sell Accepted")}
        />
        <Kpi label="Avg compliance" value={String(d.avgCompliance)} sub="0–100" href="/calls" />
        <Kpi label="Avg CSAT" value={d.avgCsat ? `${d.avgCsat}/5` : "n/a"} href="/calls" />
      </div>

      <DashboardCharts
        byReason={d.byReason}
        bySentiment={d.bySentiment}
        byOutcome={d.byOutcome}
        byLob={d.byLob}
        complaintsByCategory={d.complaintsByCategory}
        crossSell={d.crossSell}
      />

      <div>
        <SectionTitle
          count={d.recent.length}
          right={
            <Link href="/calls" className="text-xs font-medium text-brand-600 hover:underline">
              View all
            </Link>
          }
        >
          Recent calls
        </SectionTitle>
        {d.recent.length === 0 ? (
          <Card className="p-8 text-center text-sm text-slate-400">No calls yet.</Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {d.recent.map((c) => (
              <CallCard key={c.id} call={c} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Drill-down link into the filtered calls list.
function lc(labelset: string, label: string) {
  return `/calls?label=${encodeURIComponent(`${labelset}/${label}`)}`;
}
