import Link from "next/link";
import { redirect } from "next/navigation";
import { CallCard } from "@/components/CallCard";
import { DashboardCharts } from "@/components/DashboardCharts";
import { RangePicker } from "@/components/dashboard/RangePicker";
import { RollupTable } from "@/components/dashboard/RollupTable";
import { ErrorState } from "@/components/kit";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { pct } from "@/lib/format";
import { getRuntime } from "@/lib/runtime";
import { DASHBOARD_RANGES, type DashboardRange, dashboard } from "@/services/dashboard";
import { onboarding } from "@/services/onboarding";

export const dynamic = "force-dynamic";

/**
 * The date window, as extra query parameters carried into every drill-through.
 *
 * The calls list already filters on `from`/`to`, so appending the window is what stops a chart
 * saying "12 complaints" and the list it links to showing forty.
 */
function scopeOf(w: { from?: string; to?: string }): string {
  const s = new URLSearchParams();
  if (w.from) s.set("from", w.from);
  if (w.to) s.set("to", w.to);
  const q = s.toString();
  return q ? `&${q}` : "";
}

/** Drill-down link into the filtered calls table, inside the current window. */
function lc(labelset: string, label: string, scope: string) {
  return `/calls?label=${encodeURIComponent(`${labelset}/${label}`)}${scope}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const rt = await getRuntime();
  const sp = await searchParams;
  const range = (sp.range && sp.range in DASHBOARD_RANGES ? sp.range : undefined) as
    | DashboardRange
    | undefined;

  let d: Awaited<ReturnType<typeof dashboard>>;
  try {
    // Server components call the same service layer the API does — no duplicated ARAG logic.
    d = await dashboard(rt, { range, from: sp.from, to: sp.to });
  } catch (err) {
    return (
      <>
        <PageHeader title="Dashboard" breadcrumb={[{ label: "Home" }]} />
        <div className="arag-content">
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

  const scope = scopeOf(d.window);

  // First run: an empty Knowledge Box has nothing to aggregate, so the useful screen is the one
  // that gets calls into it. Onboarding is a route, not a modal, so it is linkable and resumable.
  // A *window* with no calls is not a first run, so it must not redirect to onboarding.
  if (d.total === 0 && d.window.excluded === 0) {
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
              href={`/api/v1/calls/export?format=csv${scope}`}
              className="arag-btn secondary sm"
              download
              data-testid="dashboard-export"
            >
              Export
            </a>
            <Link href={`/calls?${scope.slice(1)}`} className="arag-btn sm">
              Browse calls
            </Link>
          </>
        }
      />

      <div className="arag-content">
        <div style={{ marginBottom: 16 }}>
          <RangePicker excluded={d.window.excluded} />
        </div>
        <div className="arag-statstrip" data-testid="stat-strip">
          <Stat
            label="Calls"
            value={String(d.total)}
            sub={`${d.withMetrics} analysed`}
            href={`/calls?${scope.slice(1)}`}
          />
          <Stat
            label="First-call resolution"
            value={pct(d.fcrRate)}
            sub="of analysed calls"
            href={lc("disposition_flags", "First-Call Resolution", scope)}
          />
          <Stat
            label="Complaint rate"
            value={pct(d.complaintRate)}
            sub="of analysed calls"
            href={lc("disposition_flags", "Complaint Raised", scope)}
          />
          <Stat
            label="Cross-sell accepted"
            value={pct(d.crossSellAcceptRate)}
            sub={`${pct(d.crossSellOfferRate)} offered`}
            href={lc("disposition_flags", "Cross-sell Accepted", scope)}
          />
          <Stat
            label="Avg compliance"
            value={String(d.avgCompliance)}
            sub="out of 100"
            href={`/calls?sort=compliance&order=asc${scope}`}
          />
          <Stat
            label="Avg CSAT"
            value={d.avgCsat ? `${d.avgCsat}` : "n/a"}
            sub={d.avgCsat ? "out of 5" : "no estimate yet"}
            href={`/calls?sort=csat&order=asc${scope}`}
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
            scope={scope}
          />
        </div>

        <div style={{ marginTop: 24 }}>
          <RollupTable byAgent={d.byAgent} byQueue={d.byQueue} scope={scope} />
        </div>

        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "var(--arag-ink-950)" }}>
              Recent calls
            </h2>
            <Link href={`/calls?${scope.slice(1)}`} className="small" style={{ marginLeft: "auto" }}>
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
    <Link href={href} prefetch={false}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </Link>
  );
}
