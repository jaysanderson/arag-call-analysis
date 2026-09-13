"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconBookmark, IconCheck, IconEdit, IconTrash } from "@/components/icons";
import { ConfirmDialog, Popover } from "@/components/kit";
import { normaliseCallsQuery, type SavedView, viewState } from "./view-query";

/**
 * Saved views on the calls list.
 *
 * A view is a name for a query string, and it is stored on the *server* rather than in this
 * browser: a rota of supervisors working the same queue should be arguing about the calls, not
 * about whose definition of "escalated complaints" is the real one. That is also why rename and
 * delete are offered here — a shared name that has gone stale is worse than no name.
 */
export function SavedViews({
  query,
  canEdit,
  onNotify,
}: {
  /** The current calls URL as a normalised query string (no leading `?`). */
  query: string;
  canEdit: boolean;
  onNotify: (message: string, tone?: "error") => void;
}) {
  const router = useRouter();
  const [views, setViews] = useState<SavedView[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [sticky, setSticky] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Inline forms, one at a time: saving a new view, or renaming an existing one.
  const [naming, setNaming] = useState<"new" | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedView | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/views");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.title ?? `Request failed (${res.status})`);
      setViews((body.items ?? []) as SavedView[]);
      setListError(null);
    } catch (e) {
      setListError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The query we have just navigated to, until the router catches up.
   *
   * Without it, opening a saved view flashes "Modified" for the length of the navigation — the URL
   * still holds the previous filters while the selected view is already active. A control that
   * accuses the reader of editing something they only just opened is worse than no control.
   */
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  useEffect(() => {
    if (pendingQuery !== null && pendingQuery === query) setPendingQuery(null);
  }, [pendingQuery, query]);
  const navigating = pendingQuery !== null && pendingQuery !== query;

  const resolved = useMemo(() => viewState(views, query, sticky), [views, query, sticky]);
  const active = navigating ? (views.find((v) => v.id === sticky) ?? resolved.active) : resolved.active;
  const modified = navigating ? false : resolved.modified;

  // Follow the URL: landing on a view's own link selects it, and clearing every filter lets go of
  // it, so the control never claims a view the reader has navigated away from.
  const exactId = !resolved.modified ? (resolved.active?.id ?? null) : null;
  const stickyRef = useRef(sticky);
  stickyRef.current = sticky;
  useEffect(() => {
    if (exactId) {
      if (stickyRef.current !== exactId) setSticky(exactId);
    } else if (!query && stickyRef.current) setSticky(null);
  }, [exactId, query]);

  const send = async (input: RequestInfo, init: RequestInit): Promise<unknown> => {
    const res = await fetch(input, init);
    if (res.status === 204) return null;
    const body = await res.json().catch(() => null);
    if (!res.ok)
      throw new Error(
        (body as { detail?: string; title?: string } | null)?.detail ??
          (body as { title?: string } | null)?.title ??
          `Request failed (${res.status})`,
      );
    return body;
  };

  const select = (view: SavedView, close: () => void) => {
    setSticky(view.id);
    setPendingQuery(normaliseCallsQuery(view.query));
    close();
    router.replace(view.href, { scroll: false });
  };

  const save = async (close: () => void) => {
    const name = draft.trim();
    if (!name) {
      setFormError("A view needs a name.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const view = (await send("/api/v1/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, query }),
      })) as SavedView;
      await load();
      setSticky(view.id);
      setNaming(null);
      setDraft("");
      onNotify(`Saved “${view.name}”`);
      close();
    } catch (e) {
      // The server's RFC 9457 detail is the whole message — "A view called X already exists" tells
      // the person what to do next in a way "Something went wrong" never could.
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (view: SavedView) => {
    const name = draft.trim();
    if (!name) {
      setFormError("A view needs a name.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await send(`/api/v1/views/${view.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, query: view.query }),
      });
      await load();
      setRenaming(null);
      setDraft("");
      onNotify(`Renamed to “${name}”`);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (view: SavedView, close: () => void) => {
    setBusy(true);
    try {
      await send(`/api/v1/views/${view.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: view.name, query }),
      });
      await load();
      setSticky(view.id);
      onNotify(`Updated “${view.name}”`);
      close();
    } catch (e) {
      onNotify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (view: SavedView) => {
    setBusy(true);
    try {
      await send(`/api/v1/views/${view.id}`, { method: "DELETE" });
      await load();
      if (sticky === view.id) setSticky(null);
      setConfirmDelete(null);
      onNotify(`Deleted “${view.name}”`);
    } catch (e) {
      onNotify((e as Error).message, "error");
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const resetForms = () => {
    setNaming(null);
    setRenaming(null);
    setDraft("");
    setFormError(null);
  };

  const triggerLabel = active ? `Saved views: ${active.name}${modified ? " (modified)" : ""}` : "Saved views";

  return (
    <>
      <Popover
        label={triggerLabel}
        trigger={
          <>
            <IconBookmark size={14} />
            <span
              style={{ maxWidth: 168, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {active ? active.name : "Views"}
            </span>
            {modified && (
              <span style={{ color: "var(--arag-text-subtle)", fontWeight: 400 }}>· Modified</span>
            )}
          </>
        }
      >
        {(close) => (
          <div style={{ minWidth: 288, maxWidth: 320 }} data-testid="views-menu">
            {listError && (
              <p
                role="alert"
                style={{ margin: 0, padding: "8px 9px", fontSize: 12.5, color: "var(--arag-danger-fg)" }}
              >
                {listError}
              </p>
            )}

            {views.length === 0 && !listError ? (
              <div
                style={{ padding: "10px 9px", fontSize: 12.5, color: "var(--arag-text-muted)" }}
                data-testid="views-empty"
              >
                <strong style={{ color: "var(--arag-text)" }}>No saved views yet</strong>
                <p style={{ margin: "4px 0 0" }}>
                  A saved view is a name for a filtered call list — “Escalated complaints, billing”. Views are
                  shared, so everyone reviewing this queue works from the same definition.
                </p>
                <p style={{ margin: "6px 0 0" }}>
                  Filter the list, then choose <strong>Save this view</strong>.
                </p>
              </div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {views.map((v) =>
                  renaming === v.id ? (
                    <NameForm
                      key={v.id}
                      label="New name"
                      value={draft}
                      busy={busy}
                      error={formError}
                      confirmLabel="Rename"
                      onChange={setDraft}
                      onCancel={resetForms}
                      onSubmit={() => void rename(v)}
                    />
                  ) : (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <button
                        type="button"
                        style={{ flex: 1, minWidth: 0 }}
                        aria-current={active?.id === v.id ? "true" : undefined}
                        onClick={() => select(v, close)}
                      >
                        <span style={{ width: 15, flex: "0 0 15px", lineHeight: 0 }}>
                          {active?.id === v.id && <IconCheck size={15} />}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {v.name}
                        </span>
                      </button>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            style={{ width: "auto", flex: "0 0 auto" }}
                            aria-label={`Rename ${v.name}`}
                            onClick={() => {
                              setNaming(null);
                              setFormError(null);
                              setDraft(v.name);
                              setRenaming(v.id);
                            }}
                          >
                            <IconEdit size={14} />
                          </button>
                          <button
                            type="button"
                            className="danger"
                            style={{ width: "auto", flex: "0 0 auto" }}
                            aria-label={`Delete ${v.name}`}
                            onClick={() => setConfirmDelete(v)}
                          >
                            <IconTrash size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}

            {canEdit && (
              <>
                <div className="sep" />
                {!query ? (
                  <p
                    style={{ margin: 0, padding: "8px 9px", fontSize: 12, color: "var(--arag-text-subtle)" }}
                  >
                    Filter or search the list to save it as a view.
                  </p>
                ) : naming === "new" ? (
                  <NameForm
                    label="Name this view"
                    value={draft}
                    busy={busy}
                    error={formError}
                    confirmLabel="Save view"
                    onChange={setDraft}
                    onCancel={resetForms}
                    onSubmit={() => void save(close)}
                  />
                ) : (
                  <>
                    {modified && active && (
                      <button
                        type="button"
                        disabled={busy}
                        data-testid="update-view"
                        onClick={() => void update(active, close)}
                      >
                        Update this view
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="save-view"
                      onClick={() => {
                        setRenaming(null);
                        setFormError(null);
                        setDraft("");
                        setNaming("new");
                      }}
                    >
                      {modified ? "Save as new view" : "Save this view"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Popover>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete the view “${confirmDelete.name}”?`}
          body={
            <p>
              The view is shared, so it disappears for everyone. The calls it selects are not touched — only
              the saved name for this filter.
            </p>
          }
          confirmLabel="Delete view"
          danger
          busy={busy}
          onConfirm={() => void remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

/** The one-field form used to name a new view and to rename an existing one. */
function NameForm({
  label,
  value,
  busy,
  error,
  confirmLabel,
  onChange,
  onCancel,
  onSubmit,
}: {
  label: string;
  value: string;
  busy: boolean;
  error: string | null;
  confirmLabel: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div style={{ padding: 9, display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
        {label}
        <input
          className="arag-input"
          value={value}
          maxLength={80}
          // biome-ignore lint/a11y/noAutofocus: the field is the only reason the form just appeared.
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--arag-danger-fg)" }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="arag-btn secondary sm" style={{ width: "auto" }} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="arag-btn sm"
          style={{ width: "auto" }}
          disabled={busy}
          onClick={onSubmit}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
