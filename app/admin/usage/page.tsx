"use client";

import { useState } from "react";
import {
  AdminShell,
  JsonView,
  KeyValues,
  Panel,
  StateBlock,
  useAdminData,
} from "@/components/admin/AdminShell";
import { Segmented, useToast } from "@/components/kit";

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

type CacheView = {
  stats: {
    entries: number;
    hits: number;
    misses: number;
    evictions?: number;
    invalidations?: number;
    ttlMs: number;
    byNamespace?: Record<string, number>;
  };
  keys?: string[];
};

/**
 * Usage and cache together: the cache hit rate is the single biggest lever on both the Knowledge
 * Box call count and the latency an operator is looking at on this screen, so reading one without
 * the other has always meant two page loads.
 */
export default function AdminUsagePage() {
  const [tab, setTab] = useState<"usage" | "cache">("usage");
  const usage = useAdminData<Usage>("/api/v1/admin/usage", 10_000);
  const cache = useAdminData<CacheView>("/api/v1/admin/cache", 10_000);
  const { toast, show } = useToast();

  const invalidate = async (prefix?: string) => {
    try {
      const res = await fetch("/api/v1/admin/cache/invalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefix ? { prefix } : {}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`);
      show(`Invalidated ${body.invalidated} entr${body.invalidated === 1 ? "y" : "ies"}`);
      cache.reload();
      usage.reload();
    } catch (e) {
      show((e as Error).message, "error");
    }
  };

  return (
    <AdminShell
      title="Usage"
      description="Counters and cache state since this process started."
      actions={
        tab === "cache" ? (
          <button type="button" className="arag-btn secondary sm" onClick={() => invalidate()}>
            Invalidate everything
          </button>
        ) : undefined
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Segmented
          label="Usage view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "usage", label: "Counters" },
            { value: "cache", label: "Cache" },
          ]}
        />
      </div>

      {tab === "usage" ? (
        <StateBlock loading={usage.loading} error={usage.error}>
          {usage.data && (
            <div className="arag-stack">
              <div className="arag-statstrip">
                <div>
                  <div className="label">Requests</div>
                  <div className="value">{usage.data.requests.toLocaleString()}</div>
                  <div className="sub">{usage.data.errors} errors</div>
                </div>
                <div>
                  <div className="label">Knowledge Box calls</div>
                  <div className="value">{usage.data.arag.calls.toLocaleString()}</div>
                  <div className="sub">{Math.round(usage.data.arag.avgMs)} ms average</div>
                </div>
                <div>
                  <div className="label">Questions asked</div>
                  <div className="value">{usage.data.asks.toLocaleString()}</div>
                  <div className="sub">
                    {usage.data.tokens.input.toLocaleString()} / {usage.data.tokens.output.toLocaleString()}{" "}
                    tokens
                  </div>
                </div>
                <div>
                  <div className="label">Cache hit rate</div>
                  <div className="value">{hitRate(usage.data.cache.hits, usage.data.cache.misses)}%</div>
                  <div className="sub">{usage.data.cache.entries} entries</div>
                </div>
              </div>

              <Panel title="Totals">
                <KeyValues
                  rows={[
                    ["Uptime", `${Math.floor(usage.data.uptimeSec / 60)}m ${usage.data.uptimeSec % 60}s`],
                    ["Uploads", String(usage.data.uploads)],
                    ["Deletes", String(usage.data.deletes)],
                    ["Jobs", String(usage.data.jobs.total)],
                    ["Knowledge Box failures", String(usage.data.arag.errors)],
                  ]}
                />
              </Panel>

              <Panel title="Requests by route">
                <div className="arag-datatable compact">
                  <div className="scroll">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Route</th>
                          <th scope="col" className="num" style={{ width: 110 }}>
                            Requests
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(usage.data.byRoute)
                          .sort((a, b) => b[1] - a[1])
                          .map(([r, n]) => (
                            <tr key={r}>
                              <td className="mono" style={{ fontSize: 12 }}>
                                {r}
                              </td>
                              <td className="num">{n}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Panel>

              <Panel title="Raw response">
                <JsonView data={usage.data} />
              </Panel>
            </div>
          )}
        </StateBlock>
      ) : (
        <StateBlock loading={cache.loading} error={cache.error}>
          {cache.data && (
            <div className="arag-stack">
              <Panel title="Cache">
                <KeyValues
                  rows={[
                    ["Entries", String(cache.data.stats.entries)],
                    ["Hits / misses", `${cache.data.stats.hits} / ${cache.data.stats.misses}`],
                    ["Hit rate", `${hitRate(cache.data.stats.hits, cache.data.stats.misses)}%`],
                    ["Evictions", String(cache.data.stats.evictions ?? 0)],
                    ["Invalidations", String(cache.data.stats.invalidations ?? 0)],
                    ["Lifetime", `${Math.round(cache.data.stats.ttlMs / 1000)} s`],
                  ]}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                  {["catalog:", "summary:", "detail:", "find:"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="arag-btn secondary sm"
                      onClick={() => invalidate(p)}
                    >
                      Invalidate {p}
                    </button>
                  ))}
                </div>
              </Panel>
              {cache.data.keys && cache.data.keys.length > 0 && (
                <Panel title={`Keys (${cache.data.keys.length})`}>
                  <pre className="arag-json scroll-thin" style={{ maxHeight: 320, overflow: "auto" }}>
                    {cache.data.keys.join("\n")}
                  </pre>
                </Panel>
              )}
            </div>
          )}
        </StateBlock>
      )}
      {toast}
    </AdminShell>
  );
}

function hitRate(hits: number, misses: number): number {
  const total = hits + misses;
  return total ? Math.round((hits / total) * 100) : 0;
}
