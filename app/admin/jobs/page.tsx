"use client";

import { useState } from "react";
import {
  AdminShell,
  adminFetch,
  JsonView,
  Panel,
  StateBlock,
  useAdminData,
} from "@/components/admin/AdminShell";
import { IconRefresh, IconStop } from "@/components/icons";
import { ConfirmDialog, StateChip, type StateTone, useToast } from "@/components/kit";

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

const TONE: Record<string, StateTone> = {
  succeeded: "ok",
  running: "warn",
  queued: "neutral",
  failed: "error",
  cancelled: "muted",
};

/** A job that has not finished can still be stopped. */
const isLive = (status: string) => status === "queued" || status === "running";

export default function AdminJobsPage() {
  const { data, error, loading, reload } = useAdminData<{ items: Job[] }>("/api/v1/jobs?limit=50", 5_000);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();
  const job = data?.items.find((j) => j.id === selected) ?? null;

  const cancel = async (target: Job) => {
    setBusy(true);
    try {
      await adminFetch(`/api/v1/jobs/${target.id}`, { method: "DELETE" });
      show(`${target.kind} cancelled`);
      reload();
    } catch (e) {
      // A job that finished between the click and the request returns 409; the operator needs to
      // see that, not a generic failure.
      show((e as Error).message, "error");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <AdminShell
      title="Jobs"
      description="Call ingestion and provisioning runs, with per-stage timings."
      actions={
        <button type="button" className="arag-btn secondary sm" onClick={reload}>
          <IconRefresh size={14} /> Refresh
        </button>
      }
    >
      <StateBlock loading={loading} error={error} empty={data?.items.length === 0}>
        <div className="arag-split">
          <Panel title="Recent jobs">
            <div className="arag-datatable" data-testid="jobs-table">
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Kind</th>
                      <th scope="col" style={{ width: 108 }}>
                        Status
                      </th>
                      <th scope="col">Stage</th>
                      <th scope="col" style={{ width: 84 }}>
                        Started
                      </th>
                      <th scope="col" style={{ width: 92 }}>
                        <span className="arag sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.items ?? []).map((j) => (
                      <tr key={j.id} aria-selected={selected === j.id}>
                        <td>
                          <button
                            type="button"
                            className="cell-title"
                            style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                            onClick={() => setSelected(j.id)}
                          >
                            {j.kind}
                          </button>
                          {j.ref && <div className="cell-sub mono">{j.ref.slice(0, 12)}…</div>}
                        </td>
                        <td>
                          <StateChip tone={TONE[j.status] ?? "neutral"} busy={j.status === "running"}>
                            {j.status}
                          </StateChip>
                        </td>
                        <td className="cell-sub">{j.stage ?? "—"}</td>
                        <td className="cell-sub mono">{new Date(j.createdAt).toISOString().slice(11, 19)}</td>
                        <td>
                          {isLive(j.status) && (
                            <button
                              type="button"
                              className="arag-btn ghost sm"
                              onClick={() => setConfirming(j)}
                              data-testid={`cancel-${j.id}`}
                            >
                              <IconStop size={13} /> Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
          <Panel title={job ? `Job ${job.id.slice(0, 8)}…` : "Select a job"}>
            {job ? (
              <div className="arag-stack">
                {job.error && (
                  <div className="arag-alert error" role="alert">
                    <div>{job.error.message}</div>
                  </div>
                )}
                <ol className="arag-timeline">
                  {job.events.map((e, i) => (
                    <li key={`${e.ts}-${i}`}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span className="mono" style={{ fontSize: 11, color: "var(--arag-text-subtle)" }}>
                          {e.ts.slice(11, 19)}
                        </span>
                        <strong style={{ fontSize: 13 }}>{e.stage}</strong>
                        <span className="small" style={{ color: "var(--arag-text-muted)" }}>
                          {e.status}
                        </span>
                        {typeof e.ms === "number" && (
                          <span className="small" style={{ color: "var(--arag-text-subtle)" }}>
                            {e.ms} ms
                          </span>
                        )}
                      </div>
                      {e.message && (
                        <div className="small" style={{ color: "var(--arag-text-muted)" }}>
                          {e.message}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                <JsonView data={job} />
              </div>
            ) : (
              <p className="small" style={{ color: "var(--arag-text-subtle)" }}>
                Pick a job on the left to see its stages.
              </p>
            )}
          </Panel>
        </div>
      </StateBlock>

      {confirming && (
        <ConfirmDialog
          title={`Cancel this ${confirming.kind} job?`}
          body={
            <p>
              The job stops at its current stage. Work already committed upstream is not undone — a cancelled
              ingestion leaves the Knowledge Box resource it had already created, and the call will show as
              incomplete rather than disappearing.
            </p>
          }
          confirmLabel="Cancel the job"
          danger
          busy={busy}
          onConfirm={() => cancel(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
      {toast}
    </AdminShell>
  );
}
