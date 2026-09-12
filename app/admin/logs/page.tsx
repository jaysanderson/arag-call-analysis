"use client";

import { useState } from "react";
import { AdminShell, Panel, StateBlock, useAdminData } from "@/components/admin/AdminShell";

type LogRecord = { ts: string; level: string; msg: string; [k: string]: unknown };

const LEVEL_STYLE: Record<string, string> = {
  debug: "text-slate-400",
  info: "text-brand-600",
  warn: "text-warn-fg",
  error: "text-danger-fg",
};

export default function AdminLogsPage() {
  const [level, setLevel] = useState("");
  const [contains, setContains] = useState("");
  const query = new URLSearchParams({ limit: "200" });
  if (level) query.set("level", level);
  if (contains.trim()) query.set("contains", contains.trim());
  const { data, error, loading } = useAdminData<{ items: LogRecord[] }>(
    `/api/v1/admin/logs?${query.toString()}`,
    5_000,
  );

  return (
    <AdminShell
      title="Logs"
      description="The in-memory ring buffer of structured log records (secrets redacted)."
    >
      <Panel
        title="Filter"
        right={<span className="text-xs text-slate-400">{data?.items.length ?? 0} records</span>}
      >
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Minimum level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          >
            <option value="">all levels</option>
            <option value="debug">debug+</option>
            <option value="info">info+</option>
            <option value="warn">warn+</option>
            <option value="error">error</option>
          </select>
          <input
            aria-label="Contains"
            value={contains}
            onChange={(e) => setContains(e.target.value)}
            placeholder="contains…"
            className="flex-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
        </div>
      </Panel>

      <StateBlock loading={loading && !data} error={error} empty={data?.items.length === 0}>
        <Panel title="Records">
          <div className="scroll-thin max-h-[560px] overflow-auto font-mono text-xs">
            {[...(data?.items ?? [])].reverse().map((r, i) => (
              <div key={`${r.ts}-${i}`} className="border-b border-brand-50 py-1 last:border-0">
                <span className="text-slate-400">{r.ts.slice(11, 23)}</span>{" "}
                <span className={`font-semibold ${LEVEL_STYLE[r.level] ?? ""}`}>{r.level.toUpperCase()}</span>{" "}
                <span className="text-ink-950">{r.msg}</span>{" "}
                <span className="text-slate-500">
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(r).filter(([k]) => !["ts", "level", "msg"].includes(k)),
                    ),
                  )}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </StateBlock>
    </AdminShell>
  );
}
