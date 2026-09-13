"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconCheck, IconCopy, IconRefresh, IconWarning } from "@/components/icons";
import { useToast } from "@/components/kit";
import type { SettingsSection } from "@/services/config";
import type { SettingsView } from "@/services/settings";

/**
 * The pieces every Settings panel shares: how a write is made, how a failure is reported, how a
 * section says where its values are coming from, and how an edit is committed.
 *
 * They live in one module because the rules are the same on every tab and a panel that invented
 * its own is the way a settings screen starts lying — a save that does not re-render from the
 * server response, or a failure reported as "something went wrong" instead of the problem detail
 * the API actually sent.
 */

/** RFC 9457: `detail` is the sentence written for a person. Never invent one. */
export async function problemDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string; title?: string };
    return body.detail || body.title || `The request failed (${res.status}).`;
  } catch {
    return `The request failed (${res.status}).`;
  }
}

export async function apiJson<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(await problemDetail(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const SECTION_LABEL: Record<SettingsSection, string> = {
  branding: "Branding",
  connection: "Connection",
  limits: "Limits",
  retention: "Retention",
};

/**
 * One settings section's write path.
 *
 * Two rules are enforced here rather than left to each panel. Every write re-seeds the screen
 * from the `SettingsView` the server returns — the server sends the whole view because a limits
 * change moves `features` and a connection change moves `connection.mode`. And every write calls
 * `router.refresh()`, because the values are also rendered by the layout: the rail identity and
 * the browser tab title come from the same branding the form just changed.
 */
export function useSettingsWrites(initial: SettingsView) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  async function run(fn: () => Promise<SettingsView>, message: string): Promise<SettingsView | null> {
    setBusy(true);
    try {
      const next = await fn();
      setView(next);
      show(message);
      router.refresh();
      return next;
    } catch (err) {
      show((err as Error).message, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return {
    view,
    busy,
    toast,
    show,
    save: (section: SettingsSection, patch: Record<string, unknown>) =>
      run(
        () => apiJson<SettingsView>(`/api/v1/settings/${section}`, { method: "PUT", body: patch }),
        `${SECTION_LABEL[section]} saved.`,
      ),
    reset: (section: SettingsSection) =>
      run(
        () => apiJson<SettingsView>(`/api/v1/settings/${section}`, { method: "DELETE" }),
        `${SECTION_LABEL[section]} restored to the environment default.`,
      ),
    /** For writes that return a `SettingsView` but are not a section patch (the logo). */
    run,
  };
}

/**
 * Where this section's values come from. `SettingsView.overridden` lists the sections the store is
 * driving; a section missing from it is still on whatever the deployment's environment set, and an
 * operator about to change a variable at the platform needs to know which of the two they are
 * looking at.
 */
export function SourceLine({
  section,
  overridden,
  canEdit,
  busy,
  onReset,
}: {
  section: SettingsSection;
  overridden: string[];
  canEdit: boolean;
  busy?: boolean;
  onReset: () => void;
}) {
  const isOverridden = overridden.includes(section);
  return (
    <p className="small" data-testid={`source-${section}`} style={{ margin: "0 0 14px" }}>
      {isOverridden ? (
        <>
          <span>Overridden in the product</span>
          {canEdit && (
            <>
              <span aria-hidden="true"> · </span>
              <button
                type="button"
                className="arag-btn ghost sm"
                onClick={onReset}
                disabled={busy}
                data-testid={`reset-${section}`}
              >
                <IconRefresh size={13} />
                Reset to environment default
              </button>
            </>
          )}
        </>
      ) : (
        <span>Currently from the environment</span>
      )}
    </p>
  );
}

/**
 * What a viewer who cannot edit is told. The distinction matters: an operator token that is unset
 * makes signing in impossible, so offering the link would be advice that cannot be followed.
 */
export function ReadOnlyNotice({ adminOff }: { adminOff: boolean }) {
  return (
    <div className="arag-alert" data-testid="read-only-notice" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <IconWarning size={15} />
        {adminOff ? (
          <span>
            The operator panel is switched off for this deployment — <code className="mono">ADMIN_TOKEN</code>{" "}
            is unset, so these values can only be changed where the service is deployed.
          </span>
        ) : (
          <span>
            These values are shown as configured. <Link href="/admin/login">Sign in as an operator</Link> to
            change them.
          </span>
        )}
      </div>
    </div>
  );
}

/** A labelled control with the one line that says what it governs. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="arag-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="arag-help">{hint}</span>}
    </div>
  );
}

export function SaveRow({
  dirty,
  busy,
  canEdit,
  onSave,
  onRevert,
  label = "Save changes",
  testId,
  extra,
}: {
  dirty: boolean;
  busy: boolean;
  canEdit: boolean;
  onSave: () => void;
  onRevert: () => void;
  label?: string;
  testId: string;
  extra?: React.ReactNode;
}) {
  if (!canEdit) return null;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
      <button
        type="button"
        className="arag-btn"
        onClick={onSave}
        disabled={busy || !dirty}
        data-testid={testId}
      >
        {busy ? "Saving…" : label}
      </button>
      <button type="button" className="arag-btn secondary" onClick={onRevert} disabled={busy || !dirty}>
        Discard
      </button>
      {extra}
      {dirty && (
        <span className="small" style={{ color: "var(--arag-text-subtle)" }}>
          Unsaved changes
        </span>
      )}
    </div>
  );
}

export function CardHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>{title}</h2>
      {aside && <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>{aside}</div>}
    </div>
  );
}

/** Copy-to-clipboard that confirms in place; the only feedback a copy can give. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      data-testid="copy-button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          // A denied clipboard permission is not an error worth a dialog: the value is on screen
          // and selectable, which is the fallback every browser still allows.
        }
      }}
    >
      {done ? <IconCheck size={12} /> : <IconCopy size={12} />}
      {done ? "Copied" : label}
    </button>
  );
}

export function fmtWhen(iso?: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(iso?: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
