"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IconEdit, IconPlus, IconRefresh } from "@/components/icons";
import {
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  KebabMenu,
  Segmented,
  StateChip,
  TableSkeleton,
  useToast,
} from "@/components/kit";
import { fmtDateTime } from "@/lib/format";
import { AgentsPanel } from "./AgentsPanel";
import {
  type AgentRow,
  api,
  appliedCount,
  type LabelsetDetail,
  type LabelsetWriteResult,
  levelLabel,
  ORIGIN_EXPLANATION,
  ORIGIN_LABEL,
  originOf,
  type TaxonomyData,
} from "./api";
import { LabelsetEditor } from "./LabelsetEditor";

/**
 * Agents & Taxonomy — the configuration screen for what this deployment classifies calls with and
 * which agents apply it.
 *
 * The screen exists because "my calls are not being labelled" has three possible causes — the
 * labelset is missing, the agent is not running, or the call has not been processed yet — and
 * answering that used to mean reading three different places. It is a *configuration* product,
 * not a report: everything shown here can be changed here by an operator.
 *
 * Two rules run through the whole file:
 *  1. After every write the taxonomy is re-read, so what is on screen is the real state — including
 *     whether the Knowledge Box actually took the change. "Saved, but not yet in the Knowledge Box"
 *     is a state with its own recovery action, not an error.
 *  2. A failure shows the API's own `detail`. Nothing here ever says "Something went wrong".
 */

interface Deletion {
  labelset: LabelsetDetail;
  alsoKnowledgeBox: boolean;
}

export function TaxonomyScreen({
  canEdit,
  canProvision,
  adminOff = false,
}: {
  /** True when the viewer holds the write credential. */
  canEdit?: boolean;
  /** Legacy name used by the operator panel, which mounts this same screen. */
  canProvision?: boolean;
  /** True when this deployment has no operator token at all, so there is nothing to sign in to. */
  adminOff?: boolean;
}) {
  const editable = canEdit ?? canProvision ?? false;
  const { toast, show } = useToast();
  const [tab, setTab] = useState<"labelsets" | "agents">("labelsets");
  const [data, setData] = useState<TaxonomyData | null>(null);
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [inspect, setInspect] = useState<LabelsetDetail | null>(null);
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const [confirmProvision, setConfirmProvision] = useState(false);
  const [busy, setBusy] = useState(false);
  /** A labelset that was saved but never reached the Knowledge Box, with the reason it did not. */
  const [unprovisioned, setUnprovisioned] = useState<{ id: string; detail: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [tax, agentList] = await Promise.all([
        api<TaxonomyData>("/api/v1/taxonomy"),
        api<{ items: AgentRow[] }>("/api/v1/agents"),
      ]);
      setData(tax);
      setAgents(agentList.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Re-read after a write.
   *
   * The `afterLabelsetWrite` flag is kept as documentation of *why* a labelset write needs a fresh
   * read: the Knowledge Box labelset list is cached, and a screen that contradicted the request
   * that had just succeeded was the bug. The server now drops that entry inside `putLabelset`, so
   * nothing extra has to happen here.
   */
  const refresh = useCallback(
    async (_afterLabelsetWrite = false) => {
      await load();
    },
    [load],
  );

  const provisionOne = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/v1/labelsets/${encodeURIComponent(id)}/provision`, { method: "POST" });
      setUnprovisioned((u) => (u?.id === id ? null : u));
      show(`${id} is now in the Knowledge Box.`);
      await refresh(true);
    } catch (e) {
      show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const provisionAll = async () => {
    setBusy(true);
    try {
      await api("/api/v1/admin/provision", { method: "POST", body: JSON.stringify({ agents: true }) });
      show("Provisioning started. Its progress is in the ingest history.");
      setConfirmProvision(false);
      // The job runs behind the request; a short wait makes the first re-read useful rather than
      // showing the same "missing" state the user just acted on.
      setTimeout(() => refresh(true), 1500);
    } catch (e) {
      show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const onSaved = async (result: LabelsetWriteResult, mode: "create" | "edit") => {
    setEditor(null);
    if (result.provisioned) {
      setUnprovisioned(null);
      show(
        `${result.labelset.title} ${mode === "create" ? "created" : "saved"} and applied to the Knowledge Box.`,
      );
    } else {
      setUnprovisioned({
        id: result.labelset.id,
        detail: result.provisionError ?? "The Knowledge Box did not confirm the write.",
      });
      show(`${result.labelset.title} was saved, but not yet written to the Knowledge Box.`, "error");
    }
    await refresh(true);
  };

  const remove = async () => {
    if (!deletion) return;
    setBusy(true);
    try {
      const query = deletion.alsoKnowledgeBox ? "?knowledge_box=true" : "?knowledge_box=false";
      await api(`/api/v1/labelsets/${encodeURIComponent(deletion.labelset.id)}${query}`, {
        method: "DELETE",
      });
      show(
        deletion.alsoKnowledgeBox
          ? `${deletion.labelset.title} deleted, in the product and in the Knowledge Box.`
          : `${deletion.labelset.title} removed from the product. The Knowledge Box still holds it.`,
      );
      setDeletion(null);
      await refresh(true);
    } catch (e) {
      show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (error)
    return (
      <ErrorState
        title="The taxonomy could not be read."
        detail={error}
        action={
          <button type="button" className="arag-btn secondary sm" onClick={() => load()}>
            Try again
          </button>
        }
      />
    );
  if (!data || !agents) return <TableSkeleton rows={6} cols={7} />;

  const { provisioning } = data;
  const titleOf = (id: string) => data.labelsets.find((l) => l.id === id)?.title ?? id;
  const labelsetTitles = Object.fromEntries(data.labelsets.map((l) => [l.id, l.title]));

  return (
    <>
      {!editable && (
        <p className="arag-help" data-testid="taxonomy-readonly-note" style={{ margin: "0 0 14px" }}>
          {adminOff ? (
            "The operator panel is switched off for this deployment, so the taxonomy is read-only here."
          ) : (
            <>
              This is the read-only view. <Link href="/admin/login">Sign in as an operator</Link> to create,
              edit or provision labelsets and agents.
            </>
          )}
        </p>
      )}

      <ProvisioningBanner
        provisioning={provisioning}
        titleOf={titleOf}
        editable={editable}
        onProvisionAll={() => setConfirmProvision(true)}
        onProvisionOne={provisionOne}
        busy={busy}
      />

      {unprovisioned && (
        <div
          className="arag-alert warn"
          data-testid="unprovisioned-alert"
          style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}
        >
          <span style={{ flex: 1 }}>
            <strong>{titleOf(unprovisioned.id)} is saved but not in the Knowledge Box.</strong>{" "}
            {unprovisioned.detail} Calls analysed until it is written will not carry these labels.
          </span>
          {editable && (
            <button
              type="button"
              className="arag-btn sm"
              disabled={busy}
              onClick={() => provisionOne(unprovisioned.id)}
            >
              Provision now
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
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
        <span style={{ flex: 1 }} />
        {tab === "labelsets" && editable && (
          <button
            type="button"
            className="arag-btn sm"
            data-testid="new-labelset"
            onClick={() => setEditor({ mode: "create" })}
          >
            <IconPlus size={14} /> New labelset
          </button>
        )}
        {editable && (
          <button
            type="button"
            className="arag-btn secondary sm"
            onClick={() => setConfirmProvision(true)}
            disabled={busy || provisioning.state === "running"}
          >
            <IconRefresh size={14} /> Re-provision everything
          </button>
        )}
      </div>

      {tab === "labelsets" ? (
        data.labelsets.length === 0 ? (
          <EmptyState
            title="No labelsets"
            body="Nothing classifies calls on this deployment yet. A labelset is the vocabulary an agent applies — create one, and provisioning writes it to the Knowledge Box."
            actions={
              editable ? (
                <button type="button" className="arag-btn sm" onClick={() => setEditor({ mode: "create" })}>
                  <IconPlus size={14} /> New labelset
                </button>
              ) : undefined
            }
          />
        ) : (
          <LabelsetTable
            labelsets={data.labelsets}
            editable={editable}
            busy={busy}
            onEdit={(id) => setEditor({ mode: "edit", id })}
            onInspect={setInspect}
            onProvision={provisionOne}
            onDelete={(ls) => setDeletion({ labelset: ls, alsoKnowledgeBox: false })}
          />
        )
      ) : (
        <AgentsPanel
          agents={agents}
          canEdit={editable}
          labelsetTitles={labelsetTitles}
          onEditLabelset={(id) => {
            setTab("labelsets");
            setEditor({ mode: "edit", id });
          }}
          onDone={async (message) => {
            show(message);
            await refresh();
          }}
          onError={(message) => show(message, "error")}
        />
      )}

      {editor && (
        <LabelsetEditor
          mode={editor.mode}
          id={editor.id}
          counts={
            editor.id
              ? Object.fromEntries(
                  (data.labelsets.find((l) => l.id === editor.id)?.definitions ?? []).map((d) => [
                    d.label,
                    d.calls ?? 0,
                  ]),
                )
              : undefined
          }
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      )}

      {inspect && <LabelsetDrawer labelset={inspect} onClose={() => setInspect(null)} />}

      {deletion && (
        <ConfirmDialog
          title={`Delete ${deletion.labelset.title}?`}
          danger
          busy={busy}
          confirmLabel="Delete labelset"
          onCancel={() => setDeletion(null)}
          onConfirm={remove}
          body={
            <>
              <p style={{ marginTop: 0 }}>
                <span className="mono">{deletion.labelset.id}</span> holds{" "}
                {deletion.labelset.definitions.length} label
                {deletion.labelset.definitions.length === 1 ? "" : "s"}, and{" "}
                <strong>
                  {appliedCount(deletion.labelset)} call
                  {appliedCount(deletion.labelset) === 1 ? "" : "s"}
                </strong>{" "}
                currently carry one of them. The agents will stop applying it, and it will disappear from the
                filters in Calls.
              </p>
              {/* Deleting the labels already applied to analysed calls is data loss, not
                  configuration, so it is a separate decision and never the default. */}
              <label className="arag-switch" style={{ alignItems: "flex-start", gap: 8, marginTop: 4 }}>
                <input
                  type="checkbox"
                  data-testid="delete-also-kb"
                  checked={deletion.alsoKnowledgeBox}
                  onChange={(e) => setDeletion((d) => (d ? { ...d, alsoKnowledgeBox: e.target.checked } : d))}
                  style={{ marginTop: 3 }}
                />
                <span style={{ fontWeight: 400 }}>
                  Also delete it from the Knowledge Box. This removes the labels already applied to{" "}
                  {appliedCount(deletion.labelset)} analysed call
                  {appliedCount(deletion.labelset) === 1 ? "" : "s"}, and cannot be undone.
                </span>
              </label>
              {!deletion.alsoKnowledgeBox && (
                <p className="arag-help" style={{ marginBottom: 0 }}>
                  Left unticked, the Knowledge Box keeps the labelset and the labels on those calls; it will
                  appear here as "Knowledge Box only".
                </p>
              )}
            </>
          }
        />
      )}

      {confirmProvision && (
        <ConfirmDialog
          title="Re-provision the taxonomy?"
          confirmLabel="Re-provision"
          busy={busy}
          onCancel={() => setConfirmProvision(false)}
          onConfirm={provisionAll}
          body={
            <>
              <p style={{ marginTop: 0 }}>This will:</p>
              <ul style={{ paddingLeft: 20, margin: "0 0 8px" }}>
                <li>delete the existing agent tasks in the Knowledge Box;</li>
                <li>
                  create or replace all {data.labelsets.filter((l) => l.defined).length} labelsets defined
                  here;
                </li>
                <li>
                  start the {agents.filter((a) => a.enabled).length} enabled agents one at a time, waiting
                  between each, because the Knowledge Box allows one running task per operation type.
                </li>
              </ul>
              <p style={{ margin: 0 }}>
                Calls already analysed keep their labels. Re-provisioning applies the taxonomy to calls
                ingested from now on.
              </p>
            </>
          }
        />
      )}
      {toast}
    </>
  );
}

// ───────────────────────────── banner ─────────────────────────────

function ProvisioningBanner({
  provisioning,
  titleOf,
  editable,
  onProvisionAll,
  onProvisionOne,
  busy,
}: {
  provisioning: TaxonomyData["provisioning"];
  titleOf: (id: string) => string;
  editable: boolean;
  onProvisionAll: () => void;
  onProvisionOne: (id: string) => void;
  busy: boolean;
}) {
  if (provisioning.state === "provisioned") return null;
  const { missingLabelsets, missingAgents } = provisioning;
  const running = provisioning.state === "running";

  // One missing labelset has one exact fix; anything else needs the whole job.
  const single = !running && missingLabelsets.length === 1 && missingAgents.length === 0;

  return (
    <div
      className={`arag-alert ${running ? "" : "warn"}`}
      style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}
      data-testid="provisioning-banner"
    >
      <span style={{ flex: 1 }}>
        {running ? (
          "Provisioning is running. The labelsets and agents below will be live when it finishes."
        ) : provisioning.state === "absent" ? (
          "Nothing is provisioned. The Knowledge Box holds none of this deployment's labelsets and none of its agents, so no call will be classified."
        ) : (
          <>
            {missingLabelsets.length > 0 && (
              <>
                <strong>
                  {missingLabelsets.length === 1
                    ? `${titleOf(missingLabelsets[0] as string)} is not in the Knowledge Box`
                    : `${missingLabelsets.length} labelsets are not in the Knowledge Box`}
                </strong>
                {missingLabelsets.length > 1 && `: ${missingLabelsets.map(titleOf).join(", ")}`}.{" "}
              </>
            )}
            {missingAgents.length > 0 && (
              <>
                <strong>
                  {missingAgents.length === 1
                    ? `${missingAgents[0]} is not running`
                    : `${missingAgents.length} agents are not running`}
                </strong>
                {missingAgents.length > 1 && `: ${missingAgents.join(", ")}`}. Calls ingested now will not be
                classified by {missingAgents.length === 1 ? "it" : "them"}.{" "}
              </>
            )}
          </>
        )}
      </span>
      {!running &&
        editable &&
        (single ? (
          <button
            type="button"
            className="arag-btn sm"
            disabled={busy}
            onClick={() => onProvisionOne(missingLabelsets[0] as string)}
          >
            Provision {titleOf(missingLabelsets[0] as string)}
          </button>
        ) : (
          <button type="button" className="arag-btn sm" disabled={busy} onClick={onProvisionAll}>
            Provision now
          </button>
        ))}
    </div>
  );
}

// ───────────────────────────── labelsets ─────────────────────────────

function LabelsetTable({
  labelsets,
  editable,
  busy,
  onEdit,
  onInspect,
  onProvision,
  onDelete,
}: {
  labelsets: LabelsetDetail[];
  editable: boolean;
  busy: boolean;
  onEdit: (id: string) => void;
  onInspect: (ls: LabelsetDetail) => void;
  onProvision: (id: string) => void;
  onDelete: (ls: LabelsetDetail) => void;
}) {
  return (
    <div className="arag-datatable" data-testid="labelsets-table">
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Labelset</th>
              <th scope="col" style={{ width: 150 }}>
                Source
              </th>
              <th scope="col" style={{ width: 130 }}>
                Level
              </th>
              <th scope="col" style={{ width: 80 }} className="num">
                Labels
              </th>
              <th scope="col" style={{ width: 90 }} className="num">
                Applied
              </th>
              <th scope="col" style={{ width: 110 }}>
                Selection
              </th>
              <th scope="col" style={{ width: 150 }}>
                State
              </th>
              <th scope="col" style={{ width: 130 }}>
                <span className="arag-truncate">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {labelsets.map((ls) => {
              const applied = appliedCount(ls);
              const origin = originOf(ls);
              return (
                <tr key={ls.id} data-testid={`labelset-row-${ls.id}`}>
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
                      onClick={() => (editable && ls.defined ? onEdit(ls.id) : onInspect(ls))}
                    >
                      {ls.title}
                    </button>
                    <div className="cell-sub mono">{ls.id}</div>
                  </td>
                  <td>
                    <span className="arag-chip outline" title={ORIGIN_EXPLANATION[origin]}>
                      {ORIGIN_LABEL[origin]}
                    </span>
                  </td>
                  <td>{levelLabel(ls.kind)}</td>
                  <td className="num">{ls.definitions.length || ls.labels.length}</td>
                  <td className="num">{applied || "—"}</td>
                  <td>{ls.multiple ? "Many labels" : "One label"}</td>
                  <td>
                    <StateChip tone={ls.provisioned ? "ok" : "warn"}>
                      {ls.provisioned ? "Applied" : "Not provisioned"}
                    </StateChip>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {editable && ls.defined ? (
                        <>
                          <button
                            type="button"
                            className="arag-btn secondary sm"
                            data-testid={`edit-${ls.id}`}
                            onClick={() => onEdit(ls.id)}
                          >
                            <IconEdit size={13} /> Edit
                          </button>
                          <KebabMenu label={`More actions for ${ls.title}`}>
                            {(close) => (
                              <>
                                {!ls.provisioned && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={busy}
                                    onClick={() => {
                                      close();
                                      onProvision(ls.id);
                                    }}
                                  >
                                    Provision to the Knowledge Box
                                  </button>
                                )}
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    close();
                                    onInspect(ls);
                                  }}
                                >
                                  View labels and usage
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  data-testid={`delete-${ls.id}`}
                                  onClick={() => {
                                    close();
                                    onDelete(ls);
                                  }}
                                >
                                  Delete labelset
                                </button>
                              </>
                            )}
                          </KebabMenu>
                        </>
                      ) : (
                        <button type="button" className="arag-btn ghost sm" onClick={() => onInspect(ls)}>
                          Details
                        </button>
                      )}
                    </div>
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

/** Read-only detail: the whole vocabulary, how much of it is in use, and where it came from. */
function LabelsetDrawer({ labelset, onClose }: { labelset: LabelsetDetail; onClose: () => void }) {
  const origin = originOf(labelset);
  return (
    <Drawer title={labelset.title} onClose={onClose}>
      {/* `<dt>`/`<dd>` are direct children: a `<div>` around each pair makes the pair one item of
          the kit's `max-content 1fr` grid, so column one sizes to the longest whole row. */}
      <dl className="arag-kv">
        <dt>Identifier</dt>
        <dd className="mono">{labelset.id}</dd>
        <dt>Source</dt>
        <dd>{ORIGIN_LABEL[origin]}</dd>
        <dt>Level</dt>
        <dd>{levelLabel(labelset.kind)}</dd>
        <dt>Selection</dt>
        <dd>{labelset.multiple ? "Many labels" : "One label"}</dd>
        <dt>In the Knowledge Box</dt>
        <dd>{labelset.provisioned ? "Yes" : "No"}</dd>
      </dl>

      <p className="arag-help" style={{ marginTop: 12 }}>
        {ORIGIN_EXPLANATION[origin]}
      </p>

      <div className="arag-label" style={{ marginTop: 18 }}>
        Labels
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 10 }}>
        {labelset.definitions.map((d) => (
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
    </Drawer>
  );
}
