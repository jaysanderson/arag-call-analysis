"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconLink, IconTrash } from "@/components/icons";
import { ConfirmDialog, EmptyState, ErrorState, Segmented, StateChip, TableSkeleton } from "@/components/kit";
import type { SettingsView } from "@/services/settings";
import type { ShareView } from "@/services/shares";
import { apiJson, CardHead, fmtWhen, useSettingsWrites } from "./common";

/**
 * The share register.
 *
 * A share link is the only way a call leaves the signed-in product, so "which links are live?" is
 * a question about the deployment rather than about one call — which is why the whole register is
 * here and not only on each call. Revoking is deliberately not an operator-only action: the person
 * who sent a link to the wrong supervisor has to be able to take it back immediately.
 */

type StateFilter = "all" | "active" | "revoked" | "expired";

const FILTERS: Array<{ value: StateFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

export function SharesPanel({ initial }: { initial: SettingsView }) {
  const { toast, show, fail, errorBanner } = useSettingsWrites(initial);
  const [state, setState] = useState<StateFilter>("all");
  const [items, setItems] = useState<ShareView[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<ShareView | null>(null);

  async function load(filter: StateFilter) {
    setItems(null);
    try {
      const body = await apiJson<{ items: ShareView[] }>(`/api/v1/shares?state=${filter}`);
      setItems(body.items);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // `load` is re-created every render; the filter is the only thing that should re-fetch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    void load(state);
  }, [state]);

  async function revoke(share: ShareView) {
    setBusy(true);
    try {
      await apiJson<ShareView>(`/api/v1/shares/${encodeURIComponent(share.token)}`, { method: "DELETE" });
      setRevoking(null);
      await load(state);
      show("The link no longer resolves.");
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="arag-stack">
      {errorBanner}
      <div className="arag-card pad">
        <CardHead
          title="Share links"
          aside={
            <Segmented
              label="Filter share links by state"
              value={state}
              options={FILTERS}
              onChange={setState}
            />
          }
        />
        <p className="small" style={{ marginTop: 0 }}>
          A share link is a revocable, expiring URL to one call&rsquo;s read-only workspace. Links are created
          on a call, and listed here so every one ever issued can be found and taken back.
        </p>

        {error && <ErrorState title="The share register could not be read." detail={error} />}
        {!items && !error && <TableSkeleton rows={3} cols={5} />}

        {items && items.length === 0 && (
          <EmptyState
            icon={<IconLink size={26} />}
            title={state === "all" ? "No share links yet" : `No ${state} share links`}
            body="Open a call and use Share to create a link a colleague can open without signing in. Every link expires, and can be revoked from here."
            actions={
              <Link href="/calls" className="arag-btn sm">
                Go to calls
              </Link>
            }
          />
        )}

        {items && items.length > 0 && (
          <div className="arag-datatable" data-testid="shares-table">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Call</th>
                    <th scope="col">Created</th>
                    <th scope="col">Expires</th>
                    <th scope="col">State</th>
                    <th scope="col" className="rowactions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    const live = !s.revoked && !s.expired;
                    return (
                      <tr key={s.token} data-testid="share-row">
                        <td>
                          <Link className="cell-title" href={`/calls/${s.callId}`}>
                            {s.callTitle || s.callId}
                          </Link>
                          {s.note && <span className="cell-sub">{s.note}</span>}
                        </td>
                        <td>{fmtWhen(s.createdISO)}</td>
                        <td>{fmtWhen(s.expiresISO)}</td>
                        <td>
                          <StateChip tone={s.revoked ? "error" : s.expired ? "muted" : "ok"}>
                            {s.revoked ? "Revoked" : s.expired ? "Expired" : "Active"}
                          </StateChip>
                        </td>
                        <td className="rowactions">
                          {live && (
                            <button
                              type="button"
                              className="arag-btn ghost sm danger"
                              data-testid="revoke-share"
                              onClick={() => setRevoking(s)}
                            >
                              <IconTrash size={14} />
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {revoking && (
        <ConfirmDialog
          title="Revoke this link?"
          danger
          busy={busy}
          confirmLabel="Revoke the link"
          body={
            <p style={{ margin: 0 }}>
              Anyone holding the URL to &ldquo;{revoking.callTitle}&rdquo; stops being able to open it, from
              now. The call itself is untouched, and a new link can be created from the call at any time.
            </p>
          }
          onCancel={() => setRevoking(null)}
          onConfirm={() => revoke(revoking)}
        />
      )}
      {toast}
    </section>
  );
}
