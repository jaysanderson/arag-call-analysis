"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconClose, IconInbox, IconKebab, IconSortAsc, IconSortDesc } from "./icons";

/**
 * React bindings for the `.arag-*` components in `public/ui-ext.css`.
 *
 * These are presentation only: no data fetching, no routing decisions, no product vocabulary. A
 * screen composes them; the CSS owns how they look, so lifting the CSS into the platform kit
 * carries the whole design across without these files.
 */

// ───────────────────────────── states ─────────────────────────────

export type StateTone = "neutral" | "ok" | "warn" | "error" | "muted";

export function StateChip({
  tone = "neutral",
  busy,
  children,
  title,
}: {
  tone?: StateTone;
  busy?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  const cls = tone === "neutral" ? "" : ` ${tone}`;
  return (
    <span className={`arag-state${cls}${busy ? " busy" : ""}`} title={title}>
      {children}
    </span>
  );
}

/**
 * Empty state. Every one names what is missing, why, and the one action that fixes it — a blank
 * panel that only says "No results" is the thing this component exists to prevent.
 */
export function EmptyState({
  title,
  body,
  actions,
  icon,
}: {
  title: string;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="arag-emptystate" data-testid="empty-state">
      {icon ?? <IconInbox size={28} />}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}

/**
 * Error state. Follows the spec's three-part pattern: what failed, why (from the RFC 9457 problem
 * detail when there is one), and the recovery action.
 */
export function ErrorState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="arag-alert error" role="alert" data-testid="error-state">
      <div>
        <strong>{title}</strong>
        {detail && <div style={{ marginTop: 2 }}>{detail}</div>}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
    </div>
  );
}

export function Skeleton({
  height = 16,
  width,
  className,
}: {
  height?: number;
  width?: number | string;
  className?: string;
}) {
  return <div className={`arag-skel ${className ?? ""}`} style={{ height, width: width ?? "100%" }} />;
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="arag-datatable" aria-busy="true" aria-label="Loading" role="presentation">
      <table>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((__, c) => (
                <td key={c}>
                  <Skeleton height={12} width={c === 0 ? "70%" : "50%"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────── controls ─────────────────────────────

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset className="arag-segmented" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/** A popover anchored to a trigger; closes on outside click and on Escape. */
export function Popover({
  trigger,
  children,
  align = "right",
  label,
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="arag-menu" ref={ref}>
      <button
        type="button"
        className="arag-btn secondary sm"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className="panel" style={align === "left" ? { right: "auto", left: 0 } : undefined} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Row/page overflow menu. */
export function KebabMenu({
  children,
  label,
}: {
  children: (close: () => void) => React.ReactNode;
  label: string;
}) {
  return (
    <Popover label={label} trigger={<IconKebab size={16} />}>
      {children}
    </Popover>
  );
}

/** A multi-select facet dropdown that shows the live count beside every option. */
export function FacetSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const active = options.filter((o) => selected.has(o.value)).length;
  return (
    <Popover
      label={`Filter by ${label}`}
      align="left"
      trigger={
        <>
          {label}
          {active > 0 && <span style={{ fontWeight: 700 }}>&nbsp;{active}</span>}
          <IconChevronDown size={14} />
        </>
      }
    >
      {() => (
        <div style={{ maxHeight: 300, overflowY: "auto", minWidth: 220 }}>
          {options.length === 0 && (
            <div style={{ padding: "8px 9px", fontSize: 12.5, color: "var(--arag-text-subtle)" }}>
              Nothing to filter by yet.
            </div>
          )}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemcheckbox"
              aria-checked={selected.has(o.value)}
              onClick={() => onToggle(o.value)}
            >
              <input type="checkbox" readOnly checked={selected.has(o.value)} tabIndex={-1} />
              <span style={{ flex: 1 }}>{o.label}</span>
              {typeof o.count === "number" && (
                <span style={{ color: "var(--arag-text-subtle)", fontVariantNumeric: "tabular-nums" }}>
                  {o.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="arag-filterchip">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove filter ${label}`}>
        <IconClose size={12} />
      </button>
    </span>
  );
}

// ───────────────────────────── data table ─────────────────────────────

export interface SortState<K extends string> {
  key: K;
  order: "asc" | "desc";
}

export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align,
  width,
}: {
  label: string;
  sortKey?: K;
  sort?: SortState<K>;
  onSort?: (key: K) => void;
  align?: "right";
  width?: number;
}) {
  const active = sortKey && sort?.key === sortKey;
  return (
    <th
      scope="col"
      style={{ width, textAlign: align }}
      aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : undefined}
    >
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)}>
          {label}
          {active && (sort.order === "asc" ? <IconSortAsc size={13} /> : <IconSortDesc size={13} />)}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="arag-pagination">
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        Rows per page
        <select
          className="arag-select"
          style={{ height: 28, width: 72, padding: "0 6px" }}
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {[25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {/* The full range, never a bare page number: "1-25 of 24" is the honest reading. */}
      <span data-testid="page-range">
        {first}-{last} of {total}
      </span>
      <span className="spacer" />
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

// ───────────────────────────── overlays ─────────────────────────────

/**
 * Modal focus management: move focus into the overlay, keep Tab inside it, and put focus back
 * where it was on close.
 *
 * Without this, a keyboard user opening a drawer stays on the page behind it — they tab through a
 * list they cannot see while a dialog covers it — and on close they land back at the top of the
 * document rather than on the control they pressed. The Escape handler lives here too so every
 * overlay dismisses the same way.
 */
function useModalFocus(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Focus the first control, or the container itself when there is none to focus.
    (focusable()[0] ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // The trigger may have been unmounted by the action the overlay performed; guard for it.
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, onClose]);
}

export function Drawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useModalFocus(panel, onClose);
  return (
    <>
      <div className="arag-drawer-backdrop" onClick={onClose} role="presentation" />
      <aside
        ref={panel}
        className="arag-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="head">
          <h2>{title}</h2>
          <button type="button" className="arag-btn ghost sm close" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>
        <div className="body">{children}</div>
        {footer && (
          <div style={{ borderTop: "1px solid var(--arag-border)", padding: 14, display: "flex", gap: 8 }}>
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}

/** A confirmation modal. Destructive confirmations name the count and the object, never "Are you sure?". */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, onCancel);
  return (
    <div className="arag-modal-backdrop" onClick={onCancel} role="presentation">
      <div
        ref={panel}
        className="arag-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="head">
          <h2>{title}</h2>
        </div>
        <div className="body">{body}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: 16, paddingTop: 0 }}>
          <button type="button" className="arag-btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`arag-btn${danger ? " danger" : ""}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Transient confirmation for an action whose result is off-screen (a copy, a queued job). */
export function Toast({ message, tone }: { message: string; tone?: "error" }) {
  return (
    <output className="arag-toast" aria-live="polite">
      <div className={tone === "error" ? "error" : undefined}>{message}</div>
    </output>
  );
}

export function useToast() {
  const [message, setMessage] = useState<{ text: string; tone?: "error" } | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3200);
    return () => clearTimeout(t);
  }, [message]);
  return {
    toast: message ? <Toast message={message.text} tone={message.tone} /> : null,
    show: (text: string, tone?: "error") => setMessage({ text, tone }),
  };
}

// ───────────────────────────── misc ─────────────────────────────

export function Meter({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="arag-meter">
      <span>{label}</span>
      <span className="val">
        {value}
        <span style={{ color: "var(--arag-text-subtle)", fontWeight: 400 }}>/{max}</span>
      </span>
      <span className="track">
        <i style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </>
  );
  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>;
}
