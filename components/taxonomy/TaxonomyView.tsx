"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Segmented,
  StateChip,
  type StateTone,
  TableSkeleton,
  useToast,
} from "@/components/kit";
import { fmtDateTime } from "@/lib/format";

/**
 * Agents & Taxonomy: what this deployment classifies calls with, which agents apply it, and
 * whether the Knowledge Box has actually been given either.
 *
 * The screen exists because "my calls are not being labelled" has three possible causes — the
 * labelset is missing, the agent is not running, or the call has not been processed yet — and
 * until now an operator had to read three different places to tell them apart.
 */

interface LabelsetDetail {
  id: string;
  title: string;
  kind: string[];
  multiple: boolean;
  labels: string[];
  shipped: boolean;
  provisioned: boolean;
  definitions: Array<{ label: string; description?: string; present: boolean; calls?: number }>;
}

interface AgentStatus {
  key: string;
  type: string;
  description: string;
  state: "running" | "completed" | "failed" | "configured" | "absent";
  taskId?: string;
  operations: number;
}

interface Taxonomy {
  labelsets: LabelsetDetail[];
  agents: AgentStatus[];
  provisioning: {
    state: "provisioned" | "partial" | "absent" | "running";
    missingLabelsets: string[];
    missingAgents: string[];
    lastJobId?: string;
    lastRunISO?: string;
  };
}

const AGENT_TONE: Record<AgentStatus["state"], StateTone> = {
  running: "neutral",
  completed: "ok",
  failed: "error",
  configured: "muted",
  absent: "warn",
};

const AGENT_LABEL: Record<AgentStatus["state"], string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  configured: "Configured",
  absent: "Not provisioned",
};

export function TaxonomyScreen({ canProvision }: { canProvision: boolean }) {
  const { toast, show } = useToast();
  const [tab, setTab] = useState<"labelsets" | "agents">("labelsets");
  const [data, setData] = useState<Taxonomy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LabelsetDetail | null>(null);
  const [openAgent, setOpenAgent] = useState<AgentStatus | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/v1/taxonomy")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.detail ?? `Request failed (${r.status})`);
        return body as Taxonomy;
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const provision = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`);
      show("Provisioning started. Watch it in the ingest history.");
      setTimeout(load, 1500);
    } catch (e) {
      show((e as Error).message, "error");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  if (error)
    return (
      <ErrorState
        title="The taxonomy could not be read."
        detail={error}
        action={
          <button type="button" className="arag-btn secondary sm" onClick={load}>
            Try again
          </button>
        }
      />
    );
  if (!data) return <TableSkeleton rows={6} cols={6} />;

  const { provisioning } = data;
  const needsWork = provisioning.state !== "provisioned";

  return (
    <>
      {needsWork && (
        <div
          className={`arag-alert ${provisioning.state === "running" ? "" : "warn"}`}
          style={{ marginBottom: 16 }}
          data-testid="provisioning-banner"
        >
          <div style={{ flex: 1 }}>
            {provisioning.state === "running" ? (
              "Provisioning is running. Labelsets and agents will be live when it finishes."
            ) : provisioning.state === "absent" ? (
              "Nothing is provisioned yet. The Knowledge Box has none of this product\u2019s labelsets and none of its agents, so nothing will be classified."
            ) : (
              <>
                {provisioning.missingLabelsets.length > 0 &&
                  `${provisioning.missingLabelsets.length} labelset${provisioning.missingLabelsets.length === 1 ? " is" : "s are"} not in the Knowledge Box. `}
                {provisioning.missingAgents.length > 0 &&
                  `${provisioning.missingAgents.length} agent${provisioning.missingAgents.length === 1 ? " is" : "s are"} not running. `}
                Re-provision to apply them.
              </>
            )}
          </div>
          {canProvision && provisioning.state !== "running" && (
            <button type="button" className="arag-btn sm" onClick={() => setConfirm(true)}>
              Re-provision
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Segmented
          label="Taxonomy section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "labelsets", label: "Labelsets" },
            { value: "agents", label: "Agents" },
          ]}
        />
        {provisioning.lastRunISO && (
          <span className="small" style={{ color: "var(--arag-text-subtle)" }}>
            Last provisioned {fmtDateTime(provisioning.lastRunISO)}
          </span>
        )}
      </div>

      {tab === "labelsets" ? (
        data.labelsets.length === 0 ? (
          <EmptyState
            title="No labelsets"
            body="The Knowledge Box holds no labelsets and this deployment ships none. Provisioning creates them."
          />
        ) : (
          <div className="arag-datatable" data-testid="labelsets-table">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Labelset</th>
                    <th scope="col" style={{ width: 120 }}>
                      Level
                    </th>
                    <th scope="col" style={{ width: 84 }} className="num">
                      Labels
                    </th>
                    <th scope="col" style={{ width: 100 }} className="num">
                      Applied
                    </th>
                    <th scope="col" style={{ width: 110 }}>
                      Selection
                    </th>
                    <th scope="col" style={{ width: 150 }}>
                      State
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.labelsets.map((ls) => {
                    const applied = ls.definitions.reduce((n, d) => n + (d.calls ?? 0), 0);
                    return (
                      <tr key={ls.id}>
                        <td>
                          <button
                            type="button"
                            className="cell-title"
                            style={{
                              border: 0,
                              background: "none",
                              padding: 0,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onClick={() => setOpen(ls)}
                          >
                            {ls.title}
                          </button>
                          <div className="cell-sub mono">{ls.id}</div>
                        </td>
                        <td>{ls.kind.includes("PARAGRAPHS") ? "Transcript block" : "Whole call"}</td>
                        <td className="num">{ls.labels.length || ls.definitions.length}</td>
                        <td className="num">{applied || "—"}</td>
                        <td>{ls.multiple ? "Many labels" : "One label"}</td>
                        <td>
                          <StateChip tone={ls.provisioned ? "ok" : "warn"}>
                            {ls.provisioned ? "Applied" : "Not provisioned"}
                          </StateChip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="arag-datatable" data-testid="agents-table">
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 180 }}>
                    Agent
                  </th>
                  <th scope="col" style={{ width: 96 }}>
                    Type
                  </th>
                  <th scope="col">What it does</th>
                  <th scope="col" style={{ width: 110 }} className="num">
                    Operations
                  </th>
                  <th scope="col" style={{ width: 150 }}>
                    State
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.key}>
                    <td>
                      <button
                        type="button"
                        className="cell-title mono"
                        style={{
                          border: 0,
                          background: "none",
                          padding: 0,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onClick={() => setOpenAgent(a)}
                      >
                        {a.key}
                      </button>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{a.type}</td>
                    <td>{a.description}</td>
                    <td className="num">{a.operations}</td>
                    <td>
                      <StateChip tone={AGENT_TONE[a.state]} busy={a.state === "running"}>
                        {AGENT_LABEL[a.state]}
                      </StateChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <Drawer title={open.title} onClose={() => setOpen(null)}>
          <dl className="arag-kv">
            <div>
              <dt>Identifier</dt>
              <dd className="mono">{open.id}</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{open.kind.includes("PARAGRAPHS") ? "Transcript block" : "Whole call"}</dd>
            </div>
            <div>
              <dt>Selection</dt>
              <dd>{open.multiple ? "Many labels" : "One label"}</dd>
            </div>
            <div>
              <dt>In the Knowledge Box</dt>
              <dd>{open.provisioned ? "Yes" : "No"}</dd>
            </div>
          </dl>

          <div className="arag-label" style={{ marginTop: 18 }}>
            Labels
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 10 }}>
            {open.definitions.map((d) => (
              <li
                key={d.label}
                style={{
                  border: "1px solid var(--arag-border)",
                  borderRadius: "var(--arag-radius)",
                  padding: "10px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{d.label}</strong>
                  <span className="small" style={{ marginLeft: "auto", color: "var(--arag-text-subtle)" }}>
                    {d.calls ? `${d.calls} call${d.calls === 1 ? "" : "s"}` : "not applied yet"}
                  </span>
                </div>
                {d.description && (
                  <p className="small" style={{ margin: "4px 0 0", color: "var(--arag-text-muted)" }}>
                    {d.description}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="arag-alert warn" style={{ marginTop: 16 }}>
            These categories are configuration, not a fixed list. Labelsets are edited in the taxonomy source
            and applied by re-provisioning; changing one does not relabel calls that are already analysed —
            use Re-run analysis on those.
          </div>
        </Drawer>
      )}

      {openAgent && (
        <Drawer title={openAgent.key} onClose={() => setOpenAgent(null)}>
          <p className="small" style={{ marginTop: 0 }}>
            {openAgent.description}
          </p>
          <dl className="arag-kv">
            <div>
              <dt>Type</dt>
              <dd style={{ textTransform: "capitalize" }}>{openAgent.type}</dd>
            </div>
            <div>
              <dt>Operations</dt>
              <dd>{openAgent.operations}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{AGENT_LABEL[openAgent.state]}</dd>
            </div>
            <div>
              <dt>Knowledge Box task</dt>
              <dd className="mono">{openAgent.taskId ?? "none"}</dd>
            </div>
          </dl>
          <p className="small" style={{ color: "var(--arag-text-muted)" }}>
            Agents are Knowledge-Box-wide tasks. The Knowledge Box allows one running task per operation type,
            which is why provisioning starts them one at a time and waits in between.
          </p>
        </Drawer>
      )}

      {confirm && (
        <ConfirmDialog
          title="Re-provision the taxonomy?"
          body={
            <>
              <p>This will:</p>
              <ul style={{ paddingLeft: 20, margin: "0 0 8px" }}>
                <li>delete the existing agent tasks in the Knowledge Box;</li>
                <li>create or replace all {data.labelsets.filter((l) => l.shipped).length} labelsets;</li>
                <li>start the {data.agents.length} agents one at a time, waiting between each.</li>
              </ul>
              <p style={{ margin: 0 }}>
                Calls already analysed keep their labels. Re-provisioning applies the taxonomy to calls
                ingested from now on.
              </p>
            </>
          }
          confirmLabel="Re-provision"
          busy={busy}
          onConfirm={provision}
          onCancel={() => setConfirm(false)}
        />
      )}
      {toast}
    </>
  );
}
