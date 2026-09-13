"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconBookmark, IconTrash } from "@/components/icons";
import { ConfirmDialog, EmptyState, ErrorState, TableSkeleton } from "@/components/kit";
import type { SettingsView } from "@/services/settings";
import type { ViewView } from "@/services/views";
import { apiJson, CardHead, fmtWhen, useSettingsWrites } from "./common";

/**
 * Saved views — named filter stacks on the calls list.
 *
 * They are created on the calls screen, where the filters are; this is the register, so a view
 * someone else saved can be found, followed and removed. A view is shared rather than personal, so
 * deleting one takes it away from every supervisor using it — which is why it confirms.
 */
export function ViewsPanel({ initial }: { initial: SettingsView }) {
  const { toast, show } = useSettingsWrites(initial);
  const [items, setItems] = useState<ViewView[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ViewView | null>(null);

  async function load() {
    try {
      const body = await apiJson<{ items: ViewView[] }>("/api/v1/views");
      setItems(body.items);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // `load` is re-created every render; the list is fetched once and then only after a write.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    void load();
  }, []);

  async function remove(view: ViewView) {
    setBusy(true);
    try {
      await apiJson<void>(`/api/v1/views/${view.id}`, { method: "DELETE" });
      setDeleting(null);
      await load();
      show(`"${view.name}" deleted.`);
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="arag-stack">
      <div className="arag-card pad">
        <CardHead title="Saved views" />
        <p className="small" style={{ marginTop: 0 }}>
          A saved view is a name for a filter stack on the call list — &ldquo;Escalated complaints this
          week&rdquo;. Views are shared across the deployment, so a rota of supervisors reviews the same
          queue. Save one from the filter bar on the calls screen.
        </p>

        {error && <ErrorState title="Saved views could not be read." detail={error} />}
        {!items && !error && <TableSkeleton rows={3} cols={3} />}

        {items && items.length === 0 && (
          <EmptyState
            icon={<IconBookmark size={26} />}
            title="No saved views yet"
            body="Filter the call list down to a queue worth watching, then save it — it appears here and on the calls screen for everyone."
            actions={
              <Link href="/calls" className="arag-btn sm">
                Go to calls
              </Link>
            }
          />
        )}

        {items && items.length > 0 && (
          <div className="arag-datatable" data-testid="views-table">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Filters</th>
                    <th scope="col">Created</th>
                    <th scope="col" className="rowactions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((v) => (
                    <tr key={v.id} data-testid="view-row">
                      <td>
                        <Link className="cell-title" href={v.href}>
                          {v.name}
                        </Link>
                        {v.description && <span className="cell-sub">{v.description}</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {v.query || "no filters"}
                      </td>
                      <td>
                        {fmtWhen(v.createdISO)}
                        {v.createdBy && <span className="cell-sub">by {v.createdBy}</span>}
                      </td>
                      <td className="rowactions">
                        <button
                          type="button"
                          className="arag-btn ghost sm danger"
                          data-testid="delete-view"
                          onClick={() => setDeleting(v)}
                        >
                          <IconTrash size={14} />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          danger
          busy={busy}
          confirmLabel="Delete the view"
          body={
            <p style={{ margin: 0 }}>
              The view disappears for everyone in this deployment. No call is affected — a view is only a
              saved set of filters, and the same one can be rebuilt and saved again.
            </p>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove(deleting)}
        />
      )}
      {toast}
    </section>
  );
}
