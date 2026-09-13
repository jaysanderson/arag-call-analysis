"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconCheck, IconClose, IconEdit, IconKey, IconPlus, IconTrash } from "@/components/icons";
import { ConfirmDialog, EmptyState, ErrorState, StateChip, TableSkeleton } from "@/components/kit";
import type { ApiKeyView } from "@/services/apikeys";
import type { SettingsView } from "@/services/settings";
import { apiJson, CardHead, CopyButton, Field, fmtWhen, useSettingsWrites } from "./common";

/**
 * The API-key register.
 *
 * The one rule the whole screen is built around: the key material exists in the response to
 * `POST /api/v1/api-keys` and nowhere else, ever again — the store keeps only a SHA-256 digest. So
 * the secret is shown in a block the operator has to dismiss deliberately, with copy that says
 * plainly it cannot be recovered, and every later render shows the `ca_live_xxxxxxxx…` preview
 * instead. Revoking rather than deleting is the store's decision and the table reflects it: a
 * revoked key stays visible, because when a key was last used is exactly what an incident review
 * needs.
 */

interface Created {
  key: ApiKeyView;
  secret: string;
}

export function ApiKeysPanel({
  initial,
  canEdit,
  adminOff,
}: {
  initial: SettingsView;
  canEdit: boolean;
  adminOff: boolean;
}) {
  const { toast, show, fail, errorBanner } = useSettingsWrites(initial);
  const [keys, setKeys] = useState<ApiKeyView[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null);

  async function load() {
    try {
      const body = await apiJson<{ items: ApiKeyView[] }>("/api/v1/api-keys");
      setKeys(body.items);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // `load` is re-created every render, so listing it would re-fetch the register on every
  // keystroke in the rename field.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (canEdit) void load();
  }, [canEdit]);

  if (!canEdit)
    return (
      <section className="arag-stack">
        <div className="arag-card pad">
          <CardHead title="API keys" />
          <p className="small" style={{ marginTop: 0 }}>
            {initial.apiKeys.active > 0
              ? `${initial.apiKeys.active} key${initial.apiKeys.active === 1 ? "" : "s"} can currently authenticate against this deployment; ${initial.apiKeys.configured} exist in total, revoked ones included.`
              : "No key can currently authenticate, so the read API is open and writes need the operator token."}
          </p>
          <EmptyState
            icon={<IconKey size={26} />}
            title={adminOff ? "Key management is switched off here" : "Keys are managed by an operator"}
            body={
              adminOff
                ? "This deployment has no ADMIN_TOKEN, so there is no operator to sign in as. Keys are whatever the API_KEYS environment variable seeded."
                : "Issuing a key hands out a credential for the whole deployment, so the register and its actions are behind the operator sign-in."
            }
            actions={
              adminOff ? undefined : (
                <Link href="/admin/login" className="arag-btn sm">
                  Sign in as an operator
                </Link>
              )
            }
          />
        </div>
      </section>
    );

  async function create() {
    setBusy(true);
    try {
      const result = await apiJson<Created>("/api/v1/api-keys", {
        method: "POST",
        body: { name: newName.trim() },
      });
      setCreated(result);
      setCreating(false);
      setNewName("");
      await load();
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (!renaming) return;
    setBusy(true);
    try {
      await apiJson<ApiKeyView>(`/api/v1/api-keys/${renaming.id}`, {
        method: "PUT",
        body: { name: renaming.name.trim() },
      });
      setRenaming(null);
      await load();
      show("Key renamed.");
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKeyView) {
    setBusy(true);
    try {
      await apiJson<ApiKeyView>(`/api/v1/api-keys/${key.id}`, { method: "DELETE" });
      setRevoking(null);
      await load();
      show(`"${key.name}" can no longer authenticate.`);
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const active = (keys ?? []).filter((k) => !k.revoked).length;

  return (
    <section className="arag-stack">
      {errorBanner}
      {created && (
        <div className="arag-card pad" data-testid="new-secret">
          <CardHead title={`"${created.key.name}" is ready`} />
          <div className="arag-alert warn" style={{ marginBottom: 12 }}>
            <div>
              <strong>This is the only time this key will ever be shown.</strong> It is stored as a hash, so
              nobody — not an operator, not the support team — can recover it. Copy it into the caller that
              needs it now. If you lose it, revoke this key and issue another.
            </div>
          </div>
          <pre className="arag-snippet" data-testid="secret-value">
            {created.secret}
            <CopyButton value={created.secret} label="Copy key" />
          </pre>
          <p className="small" style={{ color: "var(--arag-text-subtle)" }}>
            Send it as <code className="mono">X-API-Key</code> or{" "}
            <code className="mono">Authorization: Bearer</code>.
          </p>
          <button
            type="button"
            className="arag-btn secondary sm"
            data-testid="dismiss-secret"
            onClick={() => setCreated(null)}
          >
            I have stored it
          </button>
        </div>
      )}

      <div className="arag-card pad">
        <CardHead
          title="API keys"
          aside={
            !creating && (
              <button
                type="button"
                className="arag-btn sm"
                data-testid="create-key"
                onClick={() => setCreating(true)}
              >
                <IconPlus size={14} />
                Create key
              </button>
            )
          }
        />
        <p className="small" style={{ marginTop: 0 }}>
          {active > 0
            ? `${active} key${active === 1 ? "" : "s"} can authenticate. While any key is active, the API requires one.`
            : "No active key, so the read API is open to anyone who can reach it and writes need the operator token."}
        </p>

        {creating && (
          <div style={{ display: "grid", gap: 10, margin: "12px 0 16px" }}>
            <Field
              id="k-name"
              label="What will use this key?"
              hint="Name the caller, not the person — it is how the right key gets revoked later."
            >
              <input
                id="k-name"
                className="arag-input"
                value={newName}
                maxLength={80}
                placeholder="CRM integration"
                data-testid="new-key-name"
                onChange={(e) => setNewName(e.target.value)}
              />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="arag-btn"
                disabled={busy || !newName.trim()}
                data-testid="create-key-submit"
                onClick={create}
              >
                Create key
              </button>
              <button
                type="button"
                className="arag-btn secondary"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <ErrorState title="The key register could not be read." detail={error} />}
        {!keys && !error && <TableSkeleton rows={3} cols={5} />}
        {keys && keys.length === 0 && (
          <EmptyState
            icon={<IconKey size={26} />}
            title="No API keys yet"
            body="A key lets a system outside the product — a CRM, a reporting job — read and write through the API without an operator sign-in."
          />
        )}

        {keys && keys.length > 0 && (
          <div className="arag-datatable" data-testid="api-keys-table">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Key</th>
                    <th scope="col">Created</th>
                    <th scope="col">Last used</th>
                    <th scope="col">State</th>
                    <th scope="col" className="rowactions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} data-testid={`key-row-${k.id}`}>
                      <td>
                        {renaming?.id === k.id ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              className="arag-input"
                              aria-label="Key name"
                              value={renaming.name}
                              maxLength={80}
                              data-testid="rename-input"
                              onChange={(e) => setRenaming({ id: k.id, name: e.target.value })}
                            />
                            <button
                              type="button"
                              className="arag-btn sm"
                              aria-label="Save the name"
                              disabled={busy || !renaming.name.trim()}
                              data-testid="rename-save"
                              onClick={rename}
                            >
                              <IconCheck size={14} />
                            </button>
                            <button
                              type="button"
                              className="arag-btn ghost sm"
                              aria-label="Cancel renaming"
                              onClick={() => setRenaming(null)}
                            >
                              <IconClose size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="cell-title">{k.name}</span>
                            {k.fromEnv && (
                              <span className="cell-sub">
                                Imported from the <code className="mono">API_KEYS</code> environment variable
                              </span>
                            )}
                            {!k.fromEnv && k.createdBy && <span className="cell-sub">by {k.createdBy}</span>}
                          </>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {k.preview}
                      </td>
                      <td>{fmtWhen(k.createdISO)}</td>
                      <td>{k.lastUsedISO ? fmtWhen(k.lastUsedISO) : "Never"}</td>
                      <td>
                        <StateChip tone={k.revoked ? "muted" : "ok"}>
                          {k.revoked ? "Revoked" : "Active"}
                        </StateChip>
                      </td>
                      <td className="rowactions">
                        {!k.revoked && renaming?.id !== k.id && (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="arag-btn ghost sm"
                              data-testid={`rename-${k.id}`}
                              onClick={() => setRenaming({ id: k.id, name: k.name })}
                            >
                              <IconEdit size={14} />
                              Rename
                            </button>
                            <button
                              type="button"
                              className="arag-btn ghost sm danger"
                              data-testid={`revoke-${k.id}`}
                              onClick={() => setRevoking(k)}
                            >
                              <IconTrash size={14} />
                              Revoke
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {revoking && (
        <ConfirmDialog
          title={`Revoke "${revoking.name}"?`}
          danger
          busy={busy}
          confirmLabel="Revoke the key"
          body={
            <p style={{ margin: 0 }}>
              Any caller still presenting <code className="mono">{revoking.preview}</code> starts receiving
              401 immediately. The row stays in the register with its last-used time, because that is the
              record an incident review needs. This cannot be undone — issue a new key instead.
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
