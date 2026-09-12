"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconCopy, IconExport, IconRefresh, IconShare, IconTrash } from "@/components/icons";
import { ConfirmDialog, KebabMenu, useToast } from "@/components/kit";
import { fmtDateTime } from "@/lib/format";

/**
 * The actions a reviewer takes on a call: share, export, re-run analysis, delete.
 *
 * Every one is a real `/api/v1` call. Destructive and asynchronous actions report what actually
 * happened — a share link says when it expires, a re-run says a job was queued and links to it,
 * a delete names what is being removed before it happens.
 */

interface ShareLink {
  token: string;
  url: string;
  expiresISO: string;
  revoked: boolean;
  expired: boolean;
  createdISO: string;
  note?: string;
}

export function CallActions({
  callId,
  title,
  canWrite,
}: {
  callId: string;
  title: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast, show } = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      show(message);
    } catch {
      // Clipboard access is refused in some browsers and in every insecure context; say so rather
      // than silently doing nothing.
      show("Your browser refused clipboard access. Copy the link from the dialog.", "error");
    }
  };

  const reanalyse = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/calls/${callId}/reanalyze`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`);
      show("Re-analysis queued. The call updates when it finishes.");
    } catch (e) {
      show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/calls/${callId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Request failed (${res.status})`);
      }
      router.push("/calls");
    } catch (e) {
      show((e as Error).message, "error");
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <button type="button" className="arag-btn secondary sm" onClick={() => setShareOpen(true)}>
        <IconShare size={14} /> Share
      </button>
      <a
        href={`/api/v1/calls/${callId}/export?format=json`}
        download
        className="arag-btn secondary sm"
        style={{ textDecoration: "none" }}
      >
        <IconExport size={14} /> Export
      </a>
      <KebabMenu label="More actions for this call">
        {(close) => (
          <>
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  close();
                  reanalyse();
                }}
                disabled={busy}
              >
                <IconRefresh size={15} /> Re-run analysis
              </button>
            )}
            <a href={`/api/v1/calls/${callId}/export?format=txt`} download onClick={close}>
              <IconExport size={15} /> Export transcript (.txt)
            </a>
            <a href={`/api/v1/calls/${callId}/export?format=vtt`} download onClick={close}>
              <IconExport size={15} /> Export captions (.vtt)
            </a>
            <div className="sep" />
            <button
              type="button"
              onClick={() => {
                close();
                copy(callId, "Call id copied");
              }}
            >
              <IconCopy size={15} /> Copy call id
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                copy(`${window.location.origin}/api/v1/calls/${callId}`, "API URL copied");
              }}
            >
              <IconCopy size={15} /> Copy API URL
            </button>
            {canWrite && (
              <>
                <div className="sep" />
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    close();
                    setConfirmDelete(true);
                  }}
                >
                  <IconTrash size={15} /> Delete call
                </button>
              </>
            )}
          </>
        )}
      </KebabMenu>

      {shareOpen && (
        <ShareDialog
          callId={callId}
          onClose={() => setShareOpen(false)}
          onCopy={copy}
          onError={(m) => show(m, "error")}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this call?"
          body={
            <p>
              <strong>{title}</strong> and its Knowledge Box resource — the recording, the transcript, every
              label and the analysis — will be removed. This cannot be undone.
            </p>
          }
          confirmLabel="Delete call"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {toast}
    </>
  );
}

function ShareDialog({
  callId,
  onClose,
  onCopy,
  onError,
}: {
  callId: string;
  onClose: () => void;
  onCopy: (text: string, message: string) => void;
  onError: (message: string) => void;
}) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch(`/api/v1/calls/${callId}/shares`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setLinks(d.items ?? []))
      .catch(() => setLinks([]));
  }, [callId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/calls/${callId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttlDays: days }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`);
      onCopy(`${window.location.origin}${body.url}`, "Share link copied");
      load();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: string) => {
    await fetch(`/api/v1/shares/${token}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  const live = (links ?? []).filter((l) => !l.revoked && !l.expired);

  // Escape closes, and focus starts on the first control rather than behind the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("select, button, input")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="arag-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={panel}
        className="arag-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share this call"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="head">
          <h2>Share this call</h2>
        </div>
        <div className="body">
          <p className="small" style={{ marginTop: 0 }}>
            A share link opens a read-only view of this call — transcript, moments and analysis — for anyone
            who has it. It expires on its own and can be revoked at any time.
          </p>

          <div className="arag-field">
            <label htmlFor="share-ttl">Expires after</label>
            <select
              id="share-ttl"
              className="arag-select"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>

          <button type="button" className="arag-btn" onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create link and copy"}
          </button>

          {live.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="arag-label">Active links</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 8 }}>
                {live.map((l) => (
                  <li
                    key={l.token}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12.5,
                      border: "1px solid var(--arag-border)",
                      borderRadius: "var(--arag-radius)",
                      padding: "8px 10px",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <code className="mono" style={{ fontSize: 11 }}>
                        {l.url.slice(0, 18)}…
                      </code>
                      <div style={{ color: "var(--arag-text-subtle)" }}>
                        Expires {fmtDateTime(l.expiresISO)}
                      </div>
                    </span>
                    <button
                      type="button"
                      className="arag-btn ghost sm"
                      onClick={() => onCopy(`${window.location.origin}${l.url}`, "Share link copied")}
                    >
                      Copy
                    </button>
                    <button type="button" className="arag-btn ghost sm" onClick={() => revoke(l.token)}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: 16, paddingTop: 0 }}>
          <button type="button" className="arag-btn secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
