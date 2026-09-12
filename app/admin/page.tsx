"use client";

import Link from "next/link";
import { AdminShell, KeyValues, Panel, StateBlock, StatusPill, useAdminData } from "@/components/admin/AdminShell";

type Health = {
  ok: boolean;
  version: string;
  platformVersion: string;
  uptimeSec: number;
  mock: boolean;
  arag: { ok: boolean; kbId: string; baseUrl: string; resources?: number; generativeModel?: string; ms: number };
  jobs: { queued: number; running: number; failed: number };
  cache: { entries: number; hits: number; misses: number };
};

const TILES = [
  { href: "/admin/health", title: "Health", body: "Live Knowledge Box connection test, model and resource count." },
  { href: "/admin/config", title: "Configuration", body: "Effective environment with every secret redacted." },
  { href: "/admin/usage", title: "Usage", body: "Requests, ARAG calls, tokens, jobs and cache counters." },
  { href: "/admin/agents", title: "Agents", body: "Data-augmentation task status; re-provision the taxonomy." },
  { href: "/admin/jobs", title: "Jobs", body: "Ingestion and provisioning runs with stage timings." },
  { href: "/admin/logs", title: "Logs", body: "The last 500 structured log records, filterable." },
  { href: "/admin/cache", title: "Cache", body: "Catalog and per-call summary cache; invalidate on demand." },
];

export default function AdminHome() {
  const { data, error, loading } = useAdminData<Health>("/api/v1/admin/health", 15_000);
  return (
    <AdminShell
      title="Operations"
      description="Everything on these pages is read live from /api/v1/admin/*."
      actions={data ? <StatusPill ok={data.ok} label={data.ok ? "Knowledge Box reachable" : "Knowledge Box unreachable"} /> : null}
    >
      <StateBlock loading={loading} error={error}>
        {data && (
          <Panel title="At a glance">
            <KeyValues
              rows={[
                ["Version", data.version],
                ["Platform", `arag-platform ${data.platformVersion}`],
                ["Mode", data.mock ? "mock ARAG" : "live Knowledge Box"],
                ["Knowledge Box", data.arag.kbId || "n/a"],
                ["Model", data.arag.generativeModel ?? "KB default"],
                ["Resources", String(data.arag.resources ?? "—")],
                ["Uptime", `${Math.floor(data.uptimeSec / 60)}m ${data.uptimeSec % 60}s`],
                ["Jobs running", String(data.jobs.running)],
                ["Cache entries", String(data.cache.entries)],
              ]}
            />
          </Panel>
        )}
      </StateBlock>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="block">
            <div className="arag-card h-full p-4 transition hover:border-brand-400">
              <div className="font-display text-base font-semibold text-ink-950">{t.title}</div>
              <p className="mt-1 text-sm text-slate-500">{t.body}</p>
            </div>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
