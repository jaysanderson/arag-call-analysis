"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/kit";

/**
 * What this deployment has actually done. The numbers come from the operator counters, so the
 * panel is only available to a signed-in operator — a product user seeing another tenant's
 * throughput would be a disclosure, not a feature.
 */
interface Usage {
  uptimeSec: number;
  requests: number;
  errors: number;
  asks: number;
  uploads: number;
  deletes: number;
  arag: { calls: number; errors: number; avgMs: number };
  tokens: { input: number; output: number };
  cache: { entries: number; hits: number; misses: number };
}

export function UsagePanel() {
  const [data, setData] = useState<Usage | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "forbidden" | "error">("loading");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    fetch("/api/v1/admin/usage")
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          setStatus("forbidden");
          return;
        }
        const body = await r.json();
        if (!r.ok) throw new Error(body?.detail ?? `Request failed (${r.status})`);
        setData(body as Usage);
        setStatus("ok");
      })
      .catch((e: Error) => {
        setDetail(e.message);
        setStatus("error");
      });
  }, []);

  if (status === "loading")
    return (
      <div className="arag-card pad" style={{ display: "grid", gap: 10 }}>
        <Skeleton height={14} width="40%" />
        <Skeleton height={38} />
        <Skeleton height={38} />
      </div>
    );

  if (status === "forbidden")
    return (
      <EmptyState
        title="Usage is an operator view"
        body="Request, Knowledge Box, token and cache counters are only shown to a signed-in operator, because they describe the whole deployment rather than your own work."
        actions={
          <Link href="/admin/login" className="arag-btn sm">
            Sign in as an operator
          </Link>
        }
      />
    );

  if (status === "error" || !data) return <ErrorState title="Usage could not be read." detail={detail} />;

  const hitRate =
    data.cache.hits + data.cache.misses > 0
      ? Math.round((data.cache.hits / (data.cache.hits + data.cache.misses)) * 100)
      : 0;

  return (
    <section className="arag-stack">
      <div className="arag-statstrip">
        <div>
          <div className="label">Requests</div>
          <div className="value">{data.requests.toLocaleString()}</div>
          <div className="sub">{data.errors} errors</div>
        </div>
        <div>
          <div className="label">Questions asked</div>
          <div className="value">{data.asks.toLocaleString()}</div>
          <div className="sub">grounded in one call each</div>
        </div>
        <div>
          <div className="label">Calls uploaded</div>
          <div className="value">{data.uploads.toLocaleString()}</div>
          <div className="sub">{data.deletes} deleted</div>
        </div>
        <div>
          <div className="label">Cache hit rate</div>
          <div className="value">{hitRate}%</div>
          <div className="sub">{data.cache.entries} entries</div>
        </div>
      </div>

      <div className="arag-card pad">
        <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 650 }}>Knowledge Box</h2>
        <dl className="arag-kv">
          <div>
            <dt>Calls made</dt>
            <dd>{data.arag.calls.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Failures</dt>
            <dd>{data.arag.errors}</dd>
          </div>
          <div>
            <dt>Average latency</dt>
            <dd>{Math.round(data.arag.avgMs)} ms</dd>
          </div>
          <div>
            <dt>Tokens in / out</dt>
            <dd>
              {data.tokens.input.toLocaleString()} / {data.tokens.output.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>Uptime</dt>
            <dd>
              {Math.floor(data.uptimeSec / 3600)}h {Math.floor((data.uptimeSec % 3600) / 60)}m
            </dd>
          </div>
        </dl>
        <p className="small" style={{ color: "var(--arag-text-subtle)", marginBottom: 0 }}>
          Counters are per process and reset when the service restarts.
        </p>
      </div>
    </section>
  );
}
