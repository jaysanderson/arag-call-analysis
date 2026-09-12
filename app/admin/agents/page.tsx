"use client";

import { useState } from "react";
import { adminFetch, AdminShell, Panel, StateBlock, useAdminData } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui";

type Agent = {
  key: string;
  type: "labeler" | "ask";
  description: string;
  state: "running" | "completed" | "failed" | "configured" | "absent";
  taskId?: string;
  operations: number;
};
type AgentsView = { agents: Agent[]; running: number; raw: Record<string, number> };
type Job = { id: string; status: string; stage?: string; message?: string; progress: number };

const STATE_STYLE: Record<Agent["state"], string> = {
  running: "bg-warn-bg text-warn-fg",
  completed: "bg-accent-fill-soft text-accent-fg-light",
  failed: "bg-danger-bg text-danger-fg",
  configured: "bg-brand-50 text-brand-700",
  absent: "bg-slate-100 text-slate-600",
};

export default function AdminAgentsPage() {
  const { data, error, loading, reload } = useAdminData<AgentsView>("/api/v1/admin/agents", 10_000);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function provision() {
    setBusy(true);
    setProblem(null);
    try {
      const started = await adminFetch<Job>("/api/v1/admin/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: true }),
      });
      setJob(started);
      // Follow the job's own SSE stream rather than polling.
      const es = new EventSource(`/api/v1/jobs/${started.id}/events`);
      es.addEventListener("job", (e) => {
        const next = JSON.parse((e as MessageEvent).data) as Job;
        setJob(next);
        if (["succeeded", "failed", "cancelled"].includes(next.status)) {
          es.close();
          setBusy(false);
          reload();
        }
      });
      es.onerror = () => {
        es.close();
        setBusy(false);
      };
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Agents"
      description="The three data-augmentation tasks that label calls and generate the analysis and metrics fields."
      actions={
        <Button onClick={provision} disabled={busy}>
          {busy ? "Provisioning…" : "Re-provision labelsets + agents"}
        </Button>
      }
    >
      {problem && (
        <div className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg" role="alert">
          {problem}
        </div>
      )}
      {job && (
        <Panel title="Provisioning job">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-50">
              <div
                className="h-2 rounded-full bg-brand-600 transition-[width]"
                style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }}
              />
            </div>
            <span className="font-mono text-xs text-slate-500">{job.status}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {job.stage ? `${job.stage}${job.message ? ` — ${job.message}` : ""}` : "Queued…"}
          </p>
        </Panel>
      )}

      <StateBlock loading={loading} error={error}>
        {data && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {data.agents.map((a) => (
              <Panel key={a.key}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-base font-semibold text-ink-950">{a.key}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">{a.type}</div>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[a.state]}`}>
                    {a.state}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{a.description}</p>
                <div className="mt-3 text-xs text-slate-400">
                  {a.operations} operation{a.operations === 1 ? "" : "s"}
                  {a.taskId ? ` · task ${a.taskId.slice(0, 8)}…` : ""}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </StateBlock>
    </AdminShell>
  );
}
