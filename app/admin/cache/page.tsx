"use client";

import { useState } from "react";
import { adminFetch, AdminShell, KeyValues, Panel, StateBlock, useAdminData } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui";

type CacheView = {
  stats: {
    entries: number;
    hits: number;
    misses: number;
    evictions: number;
    invalidations: number;
    ttlMs: number;
    byNamespace: Record<string, number>;
  };
  keys: string[];
};

export default function AdminCachePage() {
  const { data, error, loading, reload } = useAdminData<CacheView>("/api/v1/admin/cache", 10_000);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function invalidate(prefix?: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await adminFetch<{ invalidated: number }>("/api/v1/admin/cache/invalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefix ? { prefix } : {}),
      });
      setNote(`Invalidated ${res.invalidated} entr${res.invalidated === 1 ? "y" : "ies"}.`);
      reload();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hits = data?.stats.hits ?? 0;
  const misses = data?.stats.misses ?? 0;

  return (
    <AdminShell
      title="Cache"
      description="Catalog ids and per-call summaries, held for the configured TTL. This is what keeps the dashboard and rails off an N+1 fetch per view."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => invalidate("summary:")} disabled={busy}>
            Invalidate summaries
          </Button>
          <Button onClick={() => invalidate()} disabled={busy}>
            Invalidate all
          </Button>
        </div>
      }
    >
      {note && <div className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">{note}</div>}
      <StateBlock loading={loading} error={error}>
        {data && (
          <div className="space-y-4">
            <Panel title="Statistics">
              <KeyValues
                rows={[
                  ["Entries", String(data.stats.entries)],
                  ["TTL", `${data.stats.ttlMs} ms`],
                  ["Hits", String(hits)],
                  ["Misses", String(misses)],
                  ["Hit rate", `${hits + misses ? Math.round((hits / (hits + misses)) * 100) : 0}%`],
                  ["Evictions", String(data.stats.evictions)],
                  ["Invalidations", String(data.stats.invalidations)],
                  [
                    "Namespaces",
                    Object.entries(data.stats.byNamespace)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(" ") || "—",
                  ],
                ]}
              />
            </Panel>
            <Panel title="Keys">
              <div className="scroll-thin max-h-72 overflow-auto font-mono text-xs text-slate-600">
                {data.keys.length === 0 ? (
                  <span className="text-slate-400">empty</span>
                ) : (
                  data.keys.map((k) => <div key={k}>{k}</div>)
                )}
              </div>
            </Panel>
          </div>
        )}
      </StateBlock>
    </AdminShell>
  );
}
