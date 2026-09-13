"use client";

import Link from "next/link";
import {
  AdminShell,
  KeyValues,
  Panel,
  StateBlock,
  StatusPill,
  useAdminData,
} from "@/components/admin/AdminShell";
import { StateChip, type StateTone } from "@/components/kit";
import { fmtDateTime } from "@/lib/format";

type Health = {
  ok: boolean;
  version: string;
  platformVersion: string;
  uptimeSec: number;
  mock: boolean;
  arag: {
    ok: boolean;
    kbId: string;
    baseUrl: string;
    resources?: number;
    generativeModel?: string;
    ms: number;
  };
  jobs: { queued: number; running: number; failed: number };
  cache: { entries: number; hits: number; misses: number };
};

type JobRow = { id: string; kind: string; status: string; message?: string; createdAt: string };

type LogRow = { ts: string; level: string; msg: string };

const JOB_TONE: Record<string, StateTone> = {
  queued: "muted",
  running: "neutral",
  succeeded: "ok",
  failed: "error",
  cancelled: "warn",
};

/**
 * Operator overview: is it up, what is it doing, and what has gone wrong lately — the three
 * questions an operator opens this panel to answer, on one screen, each linking to the detail.
 */
export default function AdminOverview() {
  const health = useAdminData<Health>("/api/v1/admin/health", 15_000);
  const jobs = useAdminData<{ items: JobRow[] }>("/api/v1/jobs?limit=6", 10_000);
  const errors = useAdminData<{ items: LogRow[] }>("/api/v1/admin/logs?level=error&limit=5", 20_000);
  const d = health.data;

  return (
    <AdminShell
      title="Overview"
      description="Every panel here is a live read of the running service through /api/v1/admin/*."
      actions={
        d ? (
          <StatusPill ok={d.ok} label={d.ok ? "Knowledge Box reachable" : "Knowledge Box unreachable"} />
        ) : undefined
      }
    >
      <StateBlock loading={health.loading} error={health.error}>
        {d && (
          <div className="arag-stack">
            <div className="arag-statstrip">
              <Link href="/admin/connection">
                <div className="label">Mode</div>
                <div className="value" style={{ fontSize: 20 }}>
                  {d.mock ? "Sample" : "Live"}
                </div>
                <div className="sub">{d.arag.ms} ms round trip</div>
              </Link>
              <Link href="/calls">
                <div className="label">Resources</div>
                <div className="value">{d.arag.resources ?? "—"}</div>
                <div className="sub">in the Knowledge Box</div>
              </Link>
              <Link href="/admin/jobs">
                <div className="label">Jobs running</div>
                <div className="value">{d.jobs.running}</div>
                <div className="sub">
                  {d.jobs.queued} queued, {d.jobs.failed} failed
                </div>
              </Link>
              <Link href="/admin/usage">
                <div className="label">Cache entries</div>
                <div className="value">{d.cache.entries}</div>
                <div className="sub">
                  {d.cache.hits} hits, {d.cache.misses} misses
                </div>
              </Link>
              <div>
                <div className="label">Uptime</div>
                <div className="value" style={{ fontSize: 20 }}>
                  {Math.floor(d.uptimeSec / 3600)}h {Math.floor((d.uptimeSec % 3600) / 60)}m
                </div>
                <div className="sub">v{d.version}</div>
              </div>
            </div>

            <Panel title="At a glance">
              <KeyValues
                rows={[
                  ["Knowledge Box", d.arag.kbId || "in-process"],
                  ["Endpoint", d.arag.baseUrl],
                  ["Generative model", d.arag.generativeModel ?? "Knowledge Box default"],
                  ["Platform", `arag-platform ${d.platformVersion}`],
                ]}
              />
            </Panel>
          </div>
        )}
      </StateBlock>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16, alignItems: "flex-start" }}>
        <Panel title="Recent jobs" className="flex-1">
          <StateBlock loading={jobs.loading} error={jobs.error} empty={jobs.data?.items.length === 0}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {(jobs.data?.items ?? []).map((j) => (
                <li key={j.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
                  <StateChip tone={JOB_TONE[j.status] ?? "neutral"} busy={j.status === "running"}>
                    {j.status}
                  </StateChip>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{j.kind}</span>
                    <div className="cell-sub">{j.message ?? fmtDateTime(j.createdAt)}</div>
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/admin/jobs" className="arag-btn ghost sm" style={{ marginTop: 10 }}>
              All jobs
            </Link>
          </StateBlock>
        </Panel>

        <Panel title="Recent errors" className="flex-1">
          <StateBlock loading={errors.loading} error={errors.error} empty={errors.data?.items.length === 0}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {(errors.data?.items ?? []).map((l, i) => (
                <li key={`${l.ts}-${i}`} style={{ fontSize: 12.5 }}>
                  <span className="mono" style={{ color: "var(--arag-text-subtle)" }}>
                    {fmtDateTime(l.ts)}
                  </span>
                  <div style={{ color: "var(--arag-danger-fg)" }}>{l.msg}</div>
                </li>
              ))}
            </ul>
            <Link href="/admin/logs" className="arag-btn ghost sm" style={{ marginTop: 10 }}>
              All logs
            </Link>
          </StateBlock>
        </Panel>
      </div>
    </AdminShell>
  );
}
