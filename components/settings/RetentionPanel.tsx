"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconTrash, IconWarning } from "@/components/icons";
import { Skeleton, StateChip } from "@/components/kit";
import type { PurgePreview, PurgeResult } from "@/services/retention";
import type { SettingsView } from "@/services/settings";
import {
  apiJson,
  CardHead,
  Field,
  fmtDay,
  ReadOnlyNotice,
  SaveRow,
  SourceLine,
  useSettingsWrites,
} from "./common";

/**
 * The retention policy, and the purge that applies it.
 *
 * The preview is live against the number in the field rather than the saved one, because the only
 * useful question about a retention policy is "what would this do to my data" — and it must be
 * answerable *before* the policy is saved, not after. The purge itself runs the same endpoint
 * twice: once with `dryRun` to produce the count a person must type back, then for real. There is
 * no background sweeper, so nothing here deletes anything until someone presses the button.
 */

export function RetentionPanel({
  initial,
  canEdit,
  adminOff,
}: {
  initial: SettingsView;
  canEdit: boolean;
  adminOff: boolean;
}) {
  const { view, busy, toast, show, fail, errorBanner, save, reset } = useSettingsWrites(initial);
  const [days, setDays] = useState(initial.retention.days);
  const [enabled, setEnabled] = useState(initial.retention.enabled);
  const [saved, setSaved] = useState(initial.retention);

  const [preview, setPreview] = useState<PurgePreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [dryRun, setDryRun] = useState<PurgeResult | null>(null);
  const [typed, setTyped] = useState("");
  const [purging, setPurging] = useState(false);

  const dirty = days !== saved.days || enabled !== saved.enabled;

  // Debounced so dragging the number does not fire a request per keystroke; the preview walks the
  // whole call list on the server.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const p = await apiJson<PurgePreview>(`/api/v1/retention/preview?days=${days}`);
        if (!cancelled) {
          setPreview(p);
          setPreviewError("");
        }
      } catch (err) {
        if (!cancelled) setPreviewError((err as Error).message);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [days]);

  async function submit() {
    const next = await save("retention", { days, enabled });
    if (next) {
      setSaved(next.retention);
      setDays(next.retention.days);
      setEnabled(next.retention.enabled);
      // A changed policy invalidates whatever the confirmation was counting.
      setDryRun(null);
      setTyped("");
    }
  }

  async function startPurge() {
    setPurging(true);
    try {
      const result = await apiJson<PurgeResult>("/api/v1/retention/purge", {
        method: "POST",
        body: { days, dryRun: true },
      });
      setDryRun(result);
      setTyped("");
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setPurging(false);
    }
  }

  async function confirmPurge() {
    setPurging(true);
    try {
      const result = await apiJson<PurgeResult>("/api/v1/retention/purge", {
        method: "POST",
        body: { days, dryRun: false },
      });
      setDryRun(null);
      setTyped("");
      const p = await apiJson<PurgePreview>(`/api/v1/retention/preview?days=${days}`);
      setPreview(p);
      show(
        `${result.deleted.length} call${result.deleted.length === 1 ? "" : "s"} deleted` +
          (result.sharesRevoked ? `, ${result.sharesRevoked} share link(s) revoked.` : "."),
      );
      if (result.failed.length > 0)
        fail(`${result.failed.length} call(s) could not be deleted: ${result.failed[0]?.error}`);
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setPurging(false);
    }
  }

  const count = dryRun?.deleted.length ?? 0;
  const confirmWord = String(count);
  const canConfirm = typed.trim() === confirmWord || typed.trim().toUpperCase() === "DELETE";

  return (
    <section className="arag-stack">
      {errorBanner}
      {!canEdit && <ReadOnlyNotice adminOff={adminOff} />}

      <div className="arag-card pad">
        <CardHead
          title="Retention policy"
          aside={
            <StateChip tone={view.retention.enabled && view.retention.days > 0 ? "ok" : "muted"}>
              {view.retention.days === 0
                ? "No limit"
                : view.retention.enabled
                  ? `${view.retention.days} days`
                  : `${view.retention.days} days · staged`}
            </StateChip>
          }
        />
        <SourceLine
          section="retention"
          overridden={view.overridden}
          canEdit={canEdit}
          busy={busy}
          onReset={async () => {
            const next = await reset("retention");
            if (next) {
              setSaved(next.retention);
              setDays(next.retention.days);
              setEnabled(next.retention.enabled);
              setDryRun(null);
            }
          }}
        />

        {/* A `display: grid` with no `gridTemplateColumns` gets one implicit `auto` column whose
            minimum is its content's min-content width, so a single unbreakable value can size the
            column past the viewport. `minmax(0, 1fr)` lets it shrink instead. */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
          <Field
            id="r-days"
            label="Keep calls for"
            hint="Days a call is kept before the policy covers it. 0 means no retention limit at all."
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                id="r-days"
                className="arag-input"
                type="range"
                min={0}
                max={365}
                step={1}
                value={Math.min(365, days)}
                disabled={!canEdit}
                aria-label="Keep calls for, in days"
                onChange={(e) => setDays(Number(e.target.value))}
              />
              <input
                className="arag-input"
                type="number"
                min={0}
                max={3650}
                step={1}
                style={{ width: 110, flex: "0 0 auto" }}
                value={days}
                disabled={!canEdit}
                aria-label="Days, exact"
                data-testid="retention-days"
                onChange={(e) => setDays(Number(e.target.value))}
              />
              <span className="small" style={{ color: "var(--arag-text-subtle)" }}>
                days
              </span>
            </div>
          </Field>

          <label className="arag-switch" style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEdit}
              data-testid="retention-enabled"
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Apply this policy. Leave it off to record the intent without acting on it.
          </label>
          <p className="small" style={{ margin: 0, color: "var(--arag-text-subtle)" }}>
            Nothing is deleted on a timer. The policy decides what a purge covers; a purge runs when an
            operator presses the button below, or when a scheduler calls{" "}
            <code className="mono">POST /api/v1/retention/purge</code>.
          </p>
        </div>

        <SaveRow
          dirty={dirty}
          busy={busy}
          canEdit={canEdit}
          testId="save-retention"
          onSave={submit}
          onRevert={() => {
            setDays(saved.days);
            setEnabled(saved.enabled);
          }}
        />
      </div>

      <div className="arag-card pad">
        <CardHead
          title="What this policy covers"
          aside={
            preview && (
              <span className="small" style={{ color: "var(--arag-text-subtle)" }}>
                Cutoff {fmtDay(preview.cutoffISO)}
              </span>
            )
          }
        />
        {previewError && (
          <div className="arag-alert error" role="alert">
            <div>{previewError}</div>
          </div>
        )}
        {!preview && !previewError && <Skeleton height={38} />}
        {preview && (
          <>
            <div className="arag-statstrip" style={{ marginBottom: 12 }}>
              <div>
                <div className="label">Would be removed</div>
                <div className="value" data-testid="retention-candidates">
                  {preview.total}
                </div>
                <div className="sub">calls older than {days} days</div>
              </div>
              <div>
                <div className="label">Kept</div>
                <div className="value">{preview.retained}</div>
                <div className="sub">inside the policy</div>
              </div>
            </div>

            {preview.total === 0 ? (
              <p className="small" style={{ margin: 0 }}>
                {days === 0
                  ? "No retention limit is set, so nothing is ever covered by a purge."
                  : "No call in the Knowledge Box is older than this policy."}
              </p>
            ) : (
              <>
                <p className="small" style={{ marginTop: 0 }}>
                  The oldest {Math.min(5, preview.candidates.length)} of {preview.total}:
                </p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                  {preview.candidates.slice(0, 5).map((c) => (
                    <li key={c.id} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <Link href={`/calls/${c.id}`} style={{ fontSize: 13, fontWeight: 550 }}>
                        {c.title}
                      </Link>
                      <span className="small" style={{ color: "var(--arag-text-subtle)" }}>
                        {fmtDay(c.createdISO)} · {c.ageDays} days old
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {canEdit && (
        <div className="arag-card pad">
          <CardHead title="Purge now" />
          <p className="small" style={{ marginTop: 0 }}>
            Deleting a call removes it from the Knowledge Box and revokes every share link pointing at it.
            This cannot be undone and there is no recycle bin.
          </p>

          {!dryRun && (
            <button
              type="button"
              className="arag-btn danger"
              data-testid="purge-start"
              disabled={purging || !preview || preview.total === 0}
              onClick={startPurge}
            >
              <IconTrash size={15} />
              {preview && preview.total > 0
                ? `Purge ${preview.total} call${preview.total === 1 ? "" : "s"}…`
                : "Nothing to purge"}
            </button>
          )}

          {dryRun && (
            <div className="arag-alert error" aria-live="assertive" data-testid="purge-confirm">
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <IconWarning size={16} />
                  <strong>
                    This will permanently delete {count} call{count === 1 ? "" : "s"} created before{" "}
                    {fmtDay(dryRun.cutoffISO)}.
                  </strong>
                </div>
                <div>
                  A dry run was performed first, and that is what it covered. Type{" "}
                  <code className="mono">{confirmWord}</code> — the number of calls — or the word{" "}
                  <code className="mono">DELETE</code> to confirm.
                </div>
                <input
                  className="arag-input"
                  aria-label="Type the number of calls, or DELETE, to confirm"
                  value={typed}
                  data-testid="purge-typed"
                  style={{ maxWidth: 240 }}
                  onChange={(e) => setTyped(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="arag-btn danger"
                    disabled={!canConfirm || purging}
                    data-testid="purge-confirm-button"
                    onClick={confirmPurge}
                  >
                    {purging ? "Deleting…" : `Delete ${count} call${count === 1 ? "" : "s"}`}
                  </button>
                  <button
                    type="button"
                    className="arag-btn secondary"
                    data-testid="purge-cancel"
                    onClick={() => {
                      setDryRun(null);
                      setTyped("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {toast}
    </section>
  );
}
