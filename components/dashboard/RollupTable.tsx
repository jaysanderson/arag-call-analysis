"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Segmented, SortableHeader, type SortState } from "@/components/kit";
import type { Rollup } from "@/lib/aggregate";
import { pct } from "@/lib/format";

type Key = "name" | "calls" | "fcrRate" | "complaintRate" | "escalationRate" | "avgCsat" | "avgCompliance";

/**
 * "Who is driving this" — the per-agent and per-queue breakdown.
 *
 * Every row links into the calls table filtered to that agent or queue, so a number on the
 * dashboard is never a dead end. Groups with no analysed calls still appear, showing their call
 * count and an explicit "not analysed yet" rather than a row of zeroes that reads like a bad score.
 */
export function RollupTable({ byAgent, byQueue }: { byAgent: Rollup[]; byQueue: Rollup[] }) {
  const [mode, setMode] = useState<"agent" | "queue">("agent");
  const [sort, setSort] = useState<SortState<Key>>({ key: "calls", order: "desc" });

  const rows = useMemo(() => {
    const src = mode === "agent" ? byAgent : byQueue;
    const dir = sort.order === "asc" ? 1 : -1;
    return [...src].sort((a, b) => {
      const ka = a[sort.key];
      const kb = b[sort.key];
      const cmp =
        typeof ka === "number" && typeof kb === "number" ? ka - kb : String(ka).localeCompare(String(kb));
      return cmp * dir || b.calls - a.calls;
    });
  }, [mode, byAgent, byQueue, sort]);

  const onSort = (key: Key) =>
    setSort((s) => ({ key, order: s.key === key && s.order === "desc" ? "asc" : "desc" }));

  if (rows.length === 0) return null;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "var(--arag-ink-950)" }}>Breakdown</h2>
        <Segmented
          label="Break down by"
          value={mode}
          onChange={setMode}
          options={[
            { value: "agent", label: "By agent" },
            { value: "queue", label: "By queue" },
          ]}
        />
      </div>

      <div className="arag-datatable compact">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <SortableHeader
                  label={mode === "agent" ? "Agent" : "Queue"}
                  sortKey="name"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableHeader
                  label="Calls"
                  sortKey="calls"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                  width={80}
                />
                <SortableHeader
                  label="First-call resolution"
                  sortKey="fcrRate"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                  width={150}
                />
                <SortableHeader
                  label="Complaint"
                  sortKey="complaintRate"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                  width={100}
                />
                <SortableHeader
                  label="Escalation"
                  sortKey="escalationRate"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                  width={100}
                />
                <SortableHeader
                  label="CSAT"
                  sortKey="avgCsat"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                  width={80}
                />
                <SortableHeader
                  label="Compliance"
                  sortKey="avgCompliance"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                  width={110}
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = `/calls?${mode}=${encodeURIComponent(r.name)}`;
                return (
                  <tr key={r.name}>
                    <td>
                      <Link href={href} className="cell-title">
                        {r.name}
                      </Link>
                    </td>
                    <td className="num">{r.calls}</td>
                    {r.analysed === 0 ? (
                      <td colSpan={5} className="cell-sub">
                        Not analysed yet
                      </td>
                    ) : (
                      <>
                        <td className="num">{pct(r.fcrRate)}</td>
                        <td className="num">{pct(r.complaintRate)}</td>
                        <td className="num">{pct(r.escalationRate)}</td>
                        <td className="num">{r.avgCsat || "—"}</td>
                        <td className="num">{r.avgCompliance || "—"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
