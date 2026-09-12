"use client";

import { AdminShell, JsonView, KeyValues, Panel, StateBlock, useAdminData } from "@/components/admin/AdminShell";

type Usage = {
  uptimeSec: number;
  requests: number;
  errors: number;
  asks: number;
  uploads: number;
  deletes: number;
  byRoute: Record<string, number>;
  arag: { calls: number; errors: number; avgMs: number };
  tokens: { input: number; output: number };
  jobs: { total: number; byStatus: Record<string, number> };
  cache: { entries: number; hits: number; misses: number; ttlMs: number };
};

export default function AdminUsagePage() {
  const { data, error, loading } = useAdminData<Usage>("/api/v1/admin/usage", 10_000);
  return (
    <AdminShell title="Usage" description="Counters since this process started.">
      <StateBlock loading={loading} error={error}>
        {data && (
          <div className="space-y-4">
            <Panel title="Totals">
              <KeyValues
                rows={[
                  ["Requests", String(data.requests)],
                  ["Errors", String(data.errors)],
                  ["Asks", String(data.asks)],
                  ["Uploads", String(data.uploads)],
                  ["Deletes", String(data.deletes)],
                  ["ARAG calls", String(data.arag.calls)],
                  ["ARAG avg", `${data.arag.avgMs} ms`],
                  ["Tokens in/out", `${data.tokens.input} / ${data.tokens.output}`],
                  ["Cache hit rate", `${hitRate(data.cache.hits, data.cache.misses)}%`],
                ]}
              />
            </Panel>
            <Panel title="Requests by route">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(data.byRoute)
                    .sort((a, b) => b[1] - a[1])
                    .map(([r, n]) => (
                      <tr key={r} className="border-b border-brand-50 last:border-0">
                        <td className="py-1 font-mono text-xs text-slate-600">{r}</td>
                        <td className="py-1 text-right font-semibold text-ink-950">{n}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Raw">
              <JsonView data={data} />
            </Panel>
          </div>
        )}
      </StateBlock>
    </AdminShell>
  );
}

function hitRate(hits: number, misses: number): number {
  const total = hits + misses;
  return total ? Math.round((hits / total) * 100) : 0;
}
