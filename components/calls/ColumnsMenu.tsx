"use client";

import { IconColumns } from "@/components/icons";
import { Popover } from "@/components/kit";
import { CALL_COLUMNS, DEFAULT_COLUMNS } from "./columns";

/**
 * The column picker.
 *
 * The data the list already carries is much wider than eight columns — CSAT, compliance, line of
 * business, the disposition flags — and which of it matters depends entirely on the job: a quality
 * lead wants compliance and CSAT, a complaints handler wants the flags, neither wants both. So the
 * table ships an opinionated default and lets a person change it, rather than averaging every job
 * into one unreadable table.
 */
export function ColumnsMenu({
  columns,
  onToggle,
  onReset,
}: {
  columns: readonly string[];
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const chosen = new Set(columns);
  // The count is a badge for "you have changed this", so it stays quiet while the table is in its
  // shipped shape — a permanent number next to every control is noise, not information.
  const isDefault = columns.length === DEFAULT_COLUMNS.length && DEFAULT_COLUMNS.every((k) => chosen.has(k));
  return (
    <Popover
      label="Choose columns"
      trigger={
        <>
          <IconColumns size={14} />
          Columns
          {!isDefault && (
            <span style={{ fontWeight: 700 }}>
              &nbsp;{columns.length}/{CALL_COLUMNS.length}
            </span>
          )}
        </>
      }
    >
      {() => (
        <div style={{ minWidth: 250, maxHeight: 360, overflowY: "auto" }} data-testid="columns-menu">
          {CALL_COLUMNS.map((col) => (
            <button
              key={col.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={col.mandatory ? true : chosen.has(col.key)}
              aria-disabled={col.mandatory || undefined}
              onClick={() => !col.mandatory && onToggle(col.key)}
            >
              <input
                type="checkbox"
                readOnly
                tabIndex={-1}
                checked={col.mandatory ? true : chosen.has(col.key)}
                disabled={col.mandatory}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                {col.label}
                {col.hint && <span className="cell-sub">{col.hint}</span>}
              </span>
              {col.mandatory && (
                <span style={{ color: "var(--arag-text-subtle)", fontSize: 11 }}>Always</span>
              )}
            </button>
          ))}
          <div className="sep" />
          <button type="button" onClick={onReset} disabled={isDefault}>
            Reset to default
          </button>
        </div>
      )}
    </Popover>
  );
}
