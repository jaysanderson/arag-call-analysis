"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, StateChip, type StateTone, TableSkeleton } from "@/components/kit";
import { fmtDateTime } from "@/lib/format";

/**
 * Every ingest run this deployment has made, newest first — the answer to "did that upload
 * actually work, and what happened to it".
 *
 * Rows are job records, not calls: a failed ingest has no call to link to, and hiding it would be
 * the single most confusing thing this screen could do.
 */

interface JobRow {
  id: string;
  kind: string;
  status: string;
  ref?: string;
  message?: string;
  progress?: number;
  createdAt: string;
  finishedAt?: string;
  durationsMs?: Record<string, number>;
  result?: { callId?: string; created?: string[] };
  error?: { message?: string };
}

const TONE: Record<string, StateTone> = {
  queued: "muted",
  running: "neutral",
  succeeded: "ok",
  failed: "error",
  cancelled: "warn",
};

const KIND_LABEL: Record<string, string> = {
  "ingest-call": "Upload",
  "seed-samples": "Sample dataset",
  "reanalyse-call": "Re-run analysis",
  provision: "Provisioning",
};

export function IngestHistory() {
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/v1/jobs?limit=100")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.detail ?? `Request failed (${r.status})`);
        return body.items as JobRow[];
      })
      .then((items) => {
        setRows(items);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    // Anything in flight changes under the reader's feet; a short poll keeps the screen honest.
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (error)
    return (
      <ErrorState
        title="The ingest history could not be loaded."
        detail={error}
        action={
          <button type="button" className="arag-btn secondary sm" onClick={load}>
            Try again
          </button>
        }
      />
    );
  if (!rows) return <TableSkeleton rows={5} cols={6} />;
  if (rows.length === 0)
    return (
      <EmptyState
        title="Nothing has been ingested yet"
        body="Every upload, sample load, re-analysis and provisioning run appears here with its stages and timings."
        actions={
          <Link href="/upload" className="arag-btn sm">
            Upload a call
          </Link>
        }
      />
    );

  return (
    <div className="arag-datatable" data-testid="ingest-history">
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col" style={{ width: 170 }}>
                Started
              </th>
              <th scope="col" style={{ width: 96 }} className="num">
                Duration
              </th>
              <th scope="col">Detail</th>
              <th scope="col" style={{ width: 120 }}>
                Status
              </th>
              <th scope="col" style={{ width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => {
              const ms = j.finishedAt ? Date.parse(j.finishedAt) - Date.parse(j.createdAt) : null;
              return (
                <tr key={j.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--arag-ink-950)" }}>
                      {KIND_LABEL[j.kind] ?? j.kind}
                    </div>
                    <div className="cell-sub mono">{j.id.slice(0, 8)}</div>
                  </td>
                  <td>{fmtDateTime(j.createdAt)}</td>
                  <td className="num">{ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`}</td>
                  <td>
                    {j.error?.message ? (
                      <span style={{ color: "var(--arag-danger-fg)" }}>{j.error.message}</span>
                    ) : (
                      (j.message ?? "—")
                    )}
                  </td>
                  <td>
                    <StateChip tone={TONE[j.status] ?? "neutral"} busy={j.status === "running"}>
                      {j.status}
                    </StateChip>
                  </td>
                  <td>
                    {j.result?.callId && (
                      <Link href={`/calls/${j.result.callId}`} className="arag-btn ghost sm">
                        Open call
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
