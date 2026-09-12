"use client";

import { useState } from "react";
import { AdminShell, JsonView, Panel, StateBlock, useAdminData } from "@/components/admin/AdminShell";

type JobEvent = { ts: string; stage: string; status: string; message?: string; ms?: number };
type Job = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  stage?: string;
  message?: string;
  ref?: string;
  createdAt: string;
  finishedAt?: string;
  error?: { message: string };
  events: JobEvent[];
  durationsMs: Record<string, number>;
};

const STATUS_STYLE: Record<string, string> = {
  succeeded: "bg-accent-fill-soft text-accent-fg-light",
  running: "bg-warn-bg text-warn-fg",
  queued: "bg-brand-50 text-brand-700",
  failed: "bg-danger-bg text-danger-fg",
  cancelled: "bg-slate-100 text-slate-600",
};

export default function AdminJobsPage() {
  const { data, error, loading } = useAdminData<{ items: Job[] }>("/api/v1/jobs?limit=50", 5_000);
  const [selected, setSelected] = useState<string | null>(null);
  const job = data?.items.find((j) => j.id === selected) ?? null;

  return (
    <AdminShell title="Jobs" description="Call ingestion and provisioning runs, with per-stage timings.">
      <StateBlock loading={loading} error={error} empty={data?.items.length === 0}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Recent jobs">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Kind</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Stage</th>
                  <th className="pb-2">Started</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => setSelected(j.id)}
                    className={`cursor-pointer border-b border-brand-50 last:border-0 hover:bg-brand-50/60 ${
                      selected === j.id ? "bg-brand-50" : ""
                    }`}
                  >
                    <td className="py-1.5 font-mono text-xs">{j.kind}</td>
                    <td className="py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[j.status] ?? ""}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-xs text-slate-500">{j.stage ?? "—"}</td>
                    <td className="py-1.5 text-xs text-slate-400">{new Date(j.createdAt).toISOString().slice(11, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title={job ? `Job ${job.id.slice(0, 8)}…` : "Select a job"}>
            {job ? (
              <div className="space-y-3">
                {job.error && (
                  <div className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">{job.error.message}</div>
                )}
                <ol className="space-y-1.5">
                  {job.events.map((e, i) => (
                    <li key={`${e.ts}-${i}`} className="flex items-baseline gap-2 text-sm">
                      <span className="font-mono text-[11px] text-slate-400">{e.ts.slice(11, 19)}</span>
                      <span className="font-medium text-ink-950">{e.stage}</span>
                      <span className="text-xs text-slate-500">{e.status}</span>
                      {typeof e.ms === "number" && <span className="text-xs text-slate-400">{e.ms} ms</span>}
                      {e.message && <span className="truncate text-xs text-slate-500">{e.message}</span>}
                    </li>
                  ))}
                </ol>
                <JsonView data={job} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">Pick a job on the left to see its stages.</p>
            )}
          </Panel>
        </div>
      </StateBlock>
    </AdminShell>
  );
}
