import Link from "next/link";
import { redirect } from "next/navigation";
import { CallCard } from "@/components/CallCard";
import { DashboardCharts } from "@/components/DashboardCharts";
import { RollupTable } from "@/components/dashboard/RollupTable";
import { ErrorState } from "@/components/kit";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { pct } from "@/lib/format";
import { getRuntime } from "@/lib/runtime";
import { dashboard } from "@/services/dashboard";
import { onboarding } from "@/services/onboarding";

export const dynamic = "force-dynamic";

/** Drill-down link into the filtered calls table. */
function lc(labelset: string, label: string) {
  return `/calls?label=${encodeURIComponent(`${labelset}/${label}`)}`;
}

export default async function DashboardPage() {
  const rt = await getRuntime();

  let d: Awaited<ReturnType<typeof dashboard>>;
  try {
    // Server components call the same service layer the API does — no duplicated ARAG logic.
    d = await dashboard(rt);
  } catch (err) {
    return (
      <>
        <PageHeader title="Dashboard" breadcrumb={[{ label: "Home" }]} />
        <div className="arag-pagebody">
          <ErrorState
            title="The dashboard could not be built."
            detail={`The Knowledge Box did not answer. ${(err as Error).message}`}
            action={
              <Link href="/settings/connection" className="arag-btn secondary sm">
                Check the connection
              </Link>
            }
          />
        </div>
      </>
    );
  }

  // First run: an empty Knowledge Box has nothing to aggregate, so the useful screen is the one
  // that gets calls into it. Onboarding is a route, not a modal, so it is linkable and resumable.
  if (d.total === 0) {
    const state = await onboarding(rt).catch(() => null);
    if (!state?.complete) redirect("/welcome");
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Aggregated across ${d.total} call${d.total === 1 ? "" : "s"}${
          d.withMetrics < d.total ? `, ${d.withMetrics} of them fully analysed` : ""
        }.`}
        breadcrumb={[{ label: "Home" }]}
        actions={
          <>
            <a
              href="/api/v1/calls/export?format=csv"
              className="arag-btn secondary sm"
              download
              data-testid="dashboard-export"
            >
              Export
            </a>
            <Link href="/calls" className="arag-btn sm">
              Browse calls
            </Link>
          </>
        }
      />

      <div className="arag-pagebody">
        <div className="arag-stat-strip" data-testid="stat-strip">
          <Stat label="Calls" value={String(d.total)} sub={`${d.withMetrics} analysed`} href="/calls" />
          <Stat
            label="First-call resolution"
            value={pct(d.fcrRate)}
            sub="of analysed calls"
            href={lc("disposition_flags", "First-Call Resolution")}
          />
          <Stat
            label="Complaint rate"
            value={pct(d.complaintRate)}
            sub="of analysed calls"
            href={lc("disposition_flags", "Complaint Raised")}
          />
          <Stat
            label="Cross-sell accepted"
            value={pct(d.crossSellAcceptRate)}
            sub={`${pct(d.crossSellOfferRate)} offered`}
            href={lc("disposition_flags", "Cross-sell Accepted")}
          />
          <Stat
            label="Avg compliance"
            value={String(d.avgCompliance)}
            sub="out of 100"
            href="/calls?sort=compliance&order=asc"
          />
          <Stat
            label="Avg CSAT"
            value={d.avgCsat ? `${d.avgCsat}` : "n/a"}
            sub={d.avgCsat ? "out of 5" : "no estimate yet"}
            href="/calls?sort=csat&order=asc"
          />
        </div>

        <div style={{ marginTop: 24 }}>
          <DashboardCharts
            byReason={d.byReason}
            bySentiment={d.bySentiment}
            byOutcome={d.byOutcome}
            byLob={d.byLob}
            complaintsByCategory={d.complaintsByCategory}
            crossSell={d.crossSell}
          />
        </div>

        <div style={{ marginTop: 24 }}>
          <RollupTable byAgent={d.byAgent} byQueue={d.byQueue} />
        </div>

        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "var(--arag-ink-950)" }}>
              Recent calls
            </h2>
            <Link href="/calls" className="small" style={{ marginLeft: "auto" }}>
              View all
            </Link>
          </div>
          <div className="arag-grid cols-4">
            {d.recent.map((c) => (
              <CallCard key={c.id} call={c} compact />
            ))}
          </div>
        </section>

        <ApiMeta>
          <code>GET /api/v1/dashboard</code>
        </ApiMeta>
      </div>
    </>
  );
}

function Stat({ label, value, sub, href }: { label: string; value: string; sub?: string; href: string }) {
  return (
    <Link href={href}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </Link>
  );
}
