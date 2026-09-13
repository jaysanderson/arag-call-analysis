"use client";

import { useEffect, useId, useState } from "react";
import { IconPlus, IconSortAsc, IconSortDesc, IconTrash } from "@/components/icons";
import { Drawer, ErrorState, Skeleton } from "@/components/kit";
import { api, LABELSET_ID_RE, type LabelsetDef, type LabelsetWriteResult } from "./api";

/**
 * The labelset form — the only place in the product where the vocabulary an agent applies is
 * written.
 *
 * Two decisions worth the words:
 *  - The identifier is fixed after creation. It is the Knowledge Box labelset id, so renaming it
 *    would leave every label already applied to an analysed call pointing at a set that no longer
 *    exists. The field is shown, disabled, with that reason on one line.
 *  - A label description is required. It is not documentation: it is literally the sentence the
 *    labeler agent reads when deciding whether the label applies.
 */

interface LabelDraft {
  /** Stable React key: labels are reordered and removed, so the index is not one. */
  uid: number;
  label: string;
  description: string;
}

interface Draft {
  id: string;
  title: string;
  color: string;
  kind: "RESOURCES" | "PARAGRAPHS";
  multiple: boolean;
  labels: LabelDraft[];
}

let seq = 0;
const nextUid = () => ++seq;

function emptyDraft(): Draft {
  return {
    id: "",
    title: "",
    color: "#2563eb",
    kind: "RESOURCES",
    multiple: false,
    labels: [{ uid: nextUid(), label: "", description: "" }],
  };
}

function draftFrom(def: LabelsetDef): Draft {
  return {
    id: def.id,
    title: def.title,
    color: def.color || "#2563eb",
    kind: def.kind,
    multiple: def.multiple,
    labels: def.labels.map((l) => ({ uid: nextUid(), label: l.label, description: l.description })),
  };
}

/** Everything wrong with the draft, in the order a person would fix it. */
function problemsIn(draft: Draft, mode: "create" | "edit"): string[] {
  const out: string[] = [];
  if (mode === "create" && !LABELSET_ID_RE.test(draft.id))
    out.push(
      "The identifier must start with a letter and hold 2-49 lowercase letters, digits or underscores.",
    );
  if (!draft.title.trim()) out.push("The labelset needs a title.");
  if (draft.labels.length === 0) out.push("A labelset needs at least one label.");
  const seen = new Set<string>();
  draft.labels.forEach((l, i) => {
    const name = l.label.trim();
    if (!name) out.push(`Label ${i + 1} needs a name.`);
    else if (seen.has(name.toLowerCase())) out.push(`"${name}" appears twice.`);
    else seen.add(name.toLowerCase());
    if (name && !l.description.trim()) out.push(`"${name}" needs a description — the agent reads it.`);
  });
  return out;
}

export function LabelsetEditor({
  mode,
  id,
  counts,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  /** The labelset being edited; ignored when creating. */
  id?: string;
  /** Calls currently carrying each label, so the editor can warn before a label is removed. */
  counts?: Record<string, number>;
  onClose: () => void;
  onSaved: (result: LabelsetWriteResult, mode: "create" | "edit") => void;
}) {
  const uid = useId();
  const [draft, setDraft] = useState<Draft | null>(mode === "create" ? emptyDraft() : null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    let cancelled = false;
    // The definition, not the read model: the editor writes back exactly what it loaded.
    api<LabelsetDef>(`/api/v1/labelsets/${encodeURIComponent(id)}`)
      .then((def) => !cancelled && setDraft(draftFrom(def)))
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [mode, id]);

  const patch = (next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next } : d));
  const patchLabel = (uidToPatch: number, next: Partial<LabelDraft>) =>
    setDraft((d) =>
      d ? { ...d, labels: d.labels.map((l) => (l.uid === uidToPatch ? { ...l, ...next } : l)) } : d,
    );
  const move = (index: number, by: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const to = index + by;
      if (to < 0 || to >= d.labels.length) return d;
      const labels = [...d.labels];
      const [row] = labels.splice(index, 1);
      labels.splice(to, 0, row as LabelDraft);
      return { ...d, labels };
    });

  const problems = draft ? problemsIn(draft, mode) : [];

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setSaveError(null);
    try {
      const body = JSON.stringify({
        id: draft.id,
        title: draft.title.trim(),
        color: draft.color,
        kind: draft.kind,
        multiple: draft.multiple,
        labels: draft.labels.map((l) => ({ label: l.label.trim(), description: l.description.trim() })),
      });
      const result =
        mode === "create"
          ? await api<LabelsetWriteResult>("/api/v1/labelsets", { method: "POST", body })
          : await api<LabelsetWriteResult>(`/api/v1/labelsets/${encodeURIComponent(id as string)}`, {
              method: "PUT",
              body,
            });
      onSaved(result, mode);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "create" ? "New labelset" : `Edit ${draft?.title ?? "labelset"}`;

  return (
    <Drawer
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="arag-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="arag-btn"
            data-testid="labelset-save"
            disabled={!draft || problems.length > 0 || busy}
            onClick={save}
          >
            {busy ? "Saving…" : mode === "create" ? "Create labelset" : "Save changes"}
          </button>
        </>
      }
    >
      {loadError && <ErrorState title="This labelset could not be loaded." detail={loadError} />}
      {!draft && !loadError && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={34} />
          <Skeleton height={34} />
          <Skeleton height={120} />
        </div>
      )}

      {draft && (
        <div style={{ display: "grid", gap: 14 }} data-testid="labelset-form">
          <div className="arag-field">
            <label htmlFor={`${uid}-id`}>Identifier</label>
            <input
              id={`${uid}-id`}
              className="arag-input mono"
              value={draft.id}
              disabled={mode === "edit"}
              spellCheck={false}
              autoComplete="off"
              placeholder="call_reason"
              onChange={(e) => patch({ id: e.target.value.trim() })}
            />
            <span className="arag-help">
              {mode === "edit"
                ? "Fixed after creation: it is the Knowledge Box labelset id, and renaming it would orphan the labels already applied to analysed calls."
                : draft.id === "" || LABELSET_ID_RE.test(draft.id)
                  ? "Lowercase letters, digits and underscores, 2-49 characters, starting with a letter. It cannot be changed later."
                  : `"${draft.id}" is not valid: start with a letter, then lowercase letters, digits or underscores (2-49 characters).`}
            </span>
          </div>

          <div className="arag-field">
            <label htmlFor={`${uid}-title`}>Title</label>
            <input
              id={`${uid}-title`}
              className="arag-input"
              value={draft.title}
              maxLength={80}
              placeholder="Call Reason"
              onChange={(e) => patch({ title: e.target.value })}
            />
            <span className="arag-help">Shown as the filter name in Calls and on the call record.</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="arag-field">
              <label htmlFor={`${uid}-kind`}>Level</label>
              <select
                id={`${uid}-kind`}
                className="arag-select"
                value={draft.kind}
                onChange={(e) => patch({ kind: e.target.value as Draft["kind"] })}
              >
                <option value="RESOURCES">Whole call</option>
                <option value="PARAGRAPHS">Transcript block</option>
              </select>
              <span className="arag-help">
                {draft.kind === "RESOURCES"
                  ? "Applied once to the whole call by the resource labeler."
                  : "Applied to individual transcript blocks by the paragraph labeler."}
              </span>
            </div>
            <div className="arag-field">
              <label htmlFor={`${uid}-selection`}>Selection</label>
              <select
                id={`${uid}-selection`}
                className="arag-select"
                value={draft.multiple ? "many" : "one"}
                onChange={(e) => patch({ multiple: e.target.value === "many" })}
              >
                <option value="one">One label</option>
                <option value="many">Many labels</option>
              </select>
              <span className="arag-help">
                {draft.multiple
                  ? "The agent applies every label that genuinely applies."
                  : "The agent chooses the single best label."}
              </span>
            </div>
          </div>

          <div className="arag-field">
            <label htmlFor={`${uid}-color`}>Colour</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                id={`${uid}-color`}
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : "#2563eb"}
                onChange={(e) => patch({ color: e.target.value })}
                style={{
                  width: 44,
                  height: 34,
                  padding: 2,
                  border: "1px solid var(--arag-border)",
                  borderRadius: "var(--arag-radius)",
                  background: "var(--arag-surface-raised)",
                }}
                aria-label="Colour"
              />
              <input
                className="arag-input mono"
                value={draft.color}
                maxLength={9}
                spellCheck={false}
                aria-label="Colour hex value"
                onChange={(e) => patch({ color: e.target.value })}
              />
            </div>
            <span className="arag-help">Used for this labelset's chips in Calls and on the dashboard.</span>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className="arag-label">Labels ({draft.labels.length})</span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="arag-btn secondary sm"
                data-testid="add-label"
                onClick={() =>
                  setDraft((d) =>
                    d ? { ...d, labels: [...d.labels, { uid: nextUid(), label: "", description: "" }] } : d,
                  )
                }
              >
                <IconPlus size={14} /> Add label
              </button>
            </div>
            <p className="arag-help" style={{ margin: "0 0 10px" }}>
              The description is the instruction the agent reads when deciding whether to apply the label, so
              write it as a rule rather than a definition.
            </p>

            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {draft.labels.map((l, i) => {
                const applied = counts?.[l.label.trim()] ?? 0;
                return (
                  <li
                    key={l.uid}
                    data-testid="label-row"
                    style={{
                      border: "1px solid var(--arag-border)",
                      borderRadius: "var(--arag-radius)",
                      padding: 10,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        className="arag-input"
                        value={l.label}
                        maxLength={80}
                        placeholder="Label name"
                        aria-label={`Label ${i + 1} name`}
                        onChange={(e) => patchLabel(l.uid, { label: e.target.value })}
                      />
                      <button
                        type="button"
                        className="arag-btn ghost sm"
                        aria-label={`Move ${l.label || `label ${i + 1}`} up`}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <IconSortAsc size={14} />
                      </button>
                      <button
                        type="button"
                        className="arag-btn ghost sm"
                        aria-label={`Move ${l.label || `label ${i + 1}`} down`}
                        disabled={i === draft.labels.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <IconSortDesc size={14} />
                      </button>
                      <button
                        type="button"
                        className="arag-btn ghost sm"
                        aria-label={`Remove ${l.label || `label ${i + 1}`}`}
                        onClick={() =>
                          setDraft((d) => (d ? { ...d, labels: d.labels.filter((x) => x.uid !== l.uid) } : d))
                        }
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                    <textarea
                      className="arag-textarea"
                      style={{ minHeight: 58 }}
                      value={l.description}
                      maxLength={500}
                      placeholder="When does this label apply?"
                      aria-label={`Label ${i + 1} description`}
                      onChange={(e) => patchLabel(l.uid, { description: e.target.value })}
                    />
                    {applied > 0 && (
                      <span className="arag-help">
                        Applied to {applied} call{applied === 1 ? "" : "s"}. Removing it here does not remove
                        it from those calls.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {problems.length > 0 && (
            <div className="arag-alert warn" data-testid="labelset-problems">
              <strong>Before this can be saved</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {saveError && (
            <div className="arag-alert error" role="alert" data-testid="labelset-save-error">
              {saveError}
            </div>
          )}

          <p className="arag-help" style={{ margin: 0 }}>
            Saving writes the labelset to the Knowledge Box in the same request. Calls already analysed keep
            the labels they have; use Re-run analysis on a call to apply a changed labelset to it.
          </p>
        </div>
      )}
    </Drawer>
  );
}
