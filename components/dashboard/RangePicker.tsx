"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { IconCalendar } from "@/components/icons";
import { Popover, Segmented } from "@/components/kit";

/**
 * The dashboard's date window.
 *
 * The window lives in the URL, like every other filter in this product, so a dashboard someone
 * sends is the dashboard they were looking at. The named ranges are resolved on the *server*
 * (see `services/dashboard.ts`): the client sends `?range=30d`, never a pair of timestamps it
 * computed from its own clock, so two people opening the same link cannot see two different
 * windows because their machines disagree about the time.
 */

export const RANGES = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
] as const;

export type RangeValue = (typeof RANGES)[number]["value"];

export function RangePicker({ excluded }: { excluded: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const custom = Boolean(params.get("from") || params.get("to"));
  const range = (params.get("range") as RangeValue | null) ?? "all";
  const [from, setFrom] = useState(params.get("from")?.slice(0, 10) ?? "");
  const [to, setTo] = useState(params.get("to")?.slice(0, 10) ?? "");

  const go = (next: URLSearchParams) => router.replace(`/${next.toString() ? `?${next}` : ""}`);

  const pick = (v: RangeValue) => {
    const next = new URLSearchParams();
    if (v !== "all") next.set("range", v);
    go(next);
  };

  const applyCustom = (close: () => void) => {
    const next = new URLSearchParams();
    // Dates arrive as `YYYY-MM-DD` from the native picker. The upper bound is pushed to the end of
    // its day, because "to 14 March" means the whole of the 14th, not midnight at its start.
    if (from) next.set("from", `${from}T00:00:00.000Z`);
    if (to) next.set("to", `${to}T23:59:59.999Z`);
    go(next);
    close();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Segmented
        label="Date range"
        value={custom ? ("custom" as RangeValue) : range}
        onChange={(v) => pick(v as RangeValue)}
        options={RANGES.map((r) => ({ value: r.value as RangeValue, label: r.label }))}
      />
      <Popover
        label="Choose a custom date range"
        align="left"
        trigger={
          <>
            <IconCalendar size={14} />
            {custom ? `${from || "…"} → ${to || "…"}` : "Custom"}
          </>
        }
      >
        {(close) => (
          <div style={{ padding: 12, display: "grid", gap: 10, minWidth: 240 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              From
              <input
                className="arag-input"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              To
              <input
                className="arag-input"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="arag-btn secondary sm" onClick={() => pick("all")}>
                Clear
              </button>
              <button
                type="button"
                className="arag-btn sm"
                disabled={!from && !to}
                onClick={() => applyCustom(close)}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </Popover>
      {excluded > 0 && (
        <span className="small" style={{ color: "var(--arag-text-subtle)" }} data-testid="range-excluded">
          {excluded} call{excluded === 1 ? "" : "s"} outside this window
        </span>
      )}
    </div>
  );
}
