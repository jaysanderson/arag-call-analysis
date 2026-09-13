"use client";

import { useState } from "react";
import { AdminShell, JsonView, Panel, StateBlock, useAdminData } from "@/components/admin/AdminShell";
import { Segmented } from "@/components/kit";

/**
 * The audit trail: who changed what, and when.
 *
 * Every mutating configuration path writes here — settings edits, key issue and revocation,
 * taxonomy changes, purges, job cancellations — because "every setting is editable in the product"
 * is only safe to say alongside "and every edit is on the record". Secrets never appear: the
 * writer reduces a credential to `true` before the entry is stored, so this screen cannot leak one
 * even by accident.
 */

interface AuditRow {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  detail?: Record<string, unknown>;
}

const GROUPS = [
  { value: "", label: "Everything" },
  { value: "settings", label: "Settings" },
  { value: "apikey", label: "API keys" },
  { value: "labelset", label: "Taxonomy" },
  { value: "agent", label: "Agents" },
  { value: "retention", label: "Retention" },
] as const;

export default function AdminAuditPage() {
  const [group, setGroup] = useState<string>("");
  const { data, error, loading } = useAdminData<{ items: AuditRow[] }>("/api/v1/admin/audit?limit=200");
  const [open, setOpen] = useState<string | null>(null);

  // Filtering is client-side on a bounded, already-fetched page: the API filters on an exact
  // action, and what an operator actually wants is a prefix ("everything about API keys").
  const rows = (data?.items ?? []).filter((r) => !group || r.action.startsWith(group));

  return (
    <AdminShell
      title="Audit"
      description="Every configuration change made in this deployment, with who made it and when."
    >
      <StateBlock loading={loading} error={error}>
        <Panel
          title={`${rows.length} change${rows.length === 1 ? "" : "s"}`}
          right={
            <Segmented
              label="Filter by area"
              value={group}
              onChange={setGroup}
              options={GROUPS.map((g) => ({ value: g.value as string, label: g.label }))}
            />
          }
        >
          {rows.length === 0 ? (
            <p className="small" style={{ color: "var(--arag-text-subtle)" }}>
              Nothing has been changed in this area yet.
            </p>
          ) : (
            <div className="arag-datatable" data-testid="audit-table">
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: 168 }}>
                        When
                      </th>
                      <th scope="col" style={{ width: 190 }}>
                        What
                      </th>
                      <th scope="col" style={{ width: 150 }}>
                        Who
                      </th>
                      <th scope="col">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="mono cell-sub">{r.createdAt.replace("T", " ").slice(0, 19)}</td>
                        <td className="mono">{r.action}</td>
                        <td>{r.actor}</td>
                        <td>
                          {r.detail && Object.keys(r.detail).length > 0 ? (
                            <button
                              type="button"
                              className="arag-btn ghost sm"
                              aria-expanded={open === r.id}
                              onClick={() => setOpen(open === r.id ? null : r.id)}
                            >
                              {open === r.id ? "Hide" : "Show"}
                            </button>
                          ) : (
                            <span className="cell-sub">—</span>
                          )}
                          {open === r.id && r.detail && <JsonView data={r.detail} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
      </StateBlock>
    </AdminShell>
  );
}
