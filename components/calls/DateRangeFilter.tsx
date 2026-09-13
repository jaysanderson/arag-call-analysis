"use client";

import { useEffect, useState } from "react";
import { IconCalendar } from "@/components/icons";
import { Popover } from "@/components/kit";

/**
 * The calls list's date window.
 *
 * The dashboard's `RangePicker` offers named ranges (`?range=30d`) that the *server* resolves, so
 * two people opening the same dashboard link cannot disagree about where "30 days" starts. The
 * list deliberately does not: its window is written as two absolute instants, because a window is
 * the one filter a saved view must pin. "Last 30 days" saved in June quietly means something else
 * in September, and a supervisor comparing this week against a saved baseline would be comparing
 * it against a moving target without ever being told.
 */

/** `YYYY-MM-DD` → the instant that day begins / ends, so "to 14 March" means all of the 14th. */
export function startOfDayISO(day: string): string {
  return `${day}T00:00:00.000Z`;
}
export function endOfDayISO(day: string): string {
  return `${day}T23:59:59.999Z`;
}

export function formatBound(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const [start, setStart] = useState(from.slice(0, 10));
  const [end, setEnd] = useState(to.slice(0, 10));

  // The URL is the source of truth: a chip removed elsewhere, or a saved view opened, must be
  // reflected in the fields rather than leaving a stale range in a closed popover.
  useEffect(() => setStart(from.slice(0, 10)), [from]);
  useEffect(() => setEnd(to.slice(0, 10)), [to]);

  const set = Boolean(from || to);
  const label = set ? `${from ? formatBound(from) : "Any"} – ${to ? formatBound(to) : "Any"}` : "Date range";

  return (
    <Popover
      label="Filter by date range"
      align="left"
      trigger={
        <>
          <IconCalendar size={14} />
          {label}
        </>
      }
    >
      {(close) => (
        <div style={{ padding: 10, display: "grid", gap: 10, minWidth: 236 }} data-testid="date-range-menu">
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            From
            <input
              className="arag-input"
              type="date"
              value={start}
              max={end || undefined}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            To
            <input
              className="arag-input"
              type="date"
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="arag-btn secondary sm"
              style={{ width: "auto" }}
              disabled={!set}
              onClick={() => {
                onChange(null, null);
                close();
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="arag-btn sm"
              style={{ width: "auto" }}
              disabled={!start && !end}
              onClick={() => {
                onChange(start ? startOfDayISO(start) : null, end ? endOfDayISO(end) : null);
                close();
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
