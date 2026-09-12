"use client";

import { useState } from "react";
import {
  AdminShell,
  JsonView,
  KeyValues,
  Panel,
  StateBlock,
  StatusPill,
  useAdminData,
} from "@/components/admin/AdminShell";
import { Segmented } from "@/components/kit";

type Health = {
  ok: boolean;
  version: string;
  platformVersion: string;
  uptimeSec: number;
  mock: boolean;
  arag: {
    ok: boolean;
    kbId: string;
    baseUrl: string;
    resources?: number;
    generativeModel?: string;
    error?: string;
    ms: number;
  };
  jobs: Record<string, number>;
  cache: Record<string, number>;
};

type Config = {
  version: string;
  platformVersion: string;
  env: Record<string, unknown>;
  taxonomy: { labelsets: number; resourceLabelsets: string[]; agents: string[] };
  cache: { ttlMs: number };
  limits: Record<string, number>;
};

/**
 * Connection: the live Knowledge Box test and the effective configuration this process booted
 * with. They are one screen because the first question after a failed connection test is always
 * "what is it actually configured with".
 */
export default function AdminConnectionPage() {
  const [tab, setTab] = useState<"test" | "config">("test");
  const health = useAdminData<Health>("/api/v1/admin/health", 20_000);
  const config = useAdminData<Config>("/api/v1/admin/config");

  return (
    <AdminShell
      title="Connection"
      description="A real catalog read plus a configuration read against the Knowledge Box, on every refresh."
      actions={
        <button type="button" className="arag-btn secondary sm" onClick={health.reload}>
          Re-test connection
        </button>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Segmented
          label="Connection view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "test", label: "Connection test" },
            { value: "config", label: "Configuration" },
          ]}
        />
      </div>

      {tab === "test" ? (
        <StateBlock loading={health.loading} error={health.error}>
          {health.data && (
            <div className="arag-stack">
              <Panel
                title="Knowledge Box"
                right={
                  <StatusPill
                    ok={health.data.arag.ok}
                    label={health.data.arag.ok ? `Reachable in ${health.data.arag.ms} ms` : "Unreachable"}
                  />
                }
              >
                <KeyValues
                  rows={[
                    ["Knowledge Box id", health.data.arag.kbId || "in-process"],
                    ["Endpoint", health.data.arag.baseUrl],
                    ["Generative model", health.data.arag.generativeModel ?? "Knowledge Box default"],
                    ["Resources", String(health.data.arag.resources ?? "\u2014")],
                    ["Round trip", `${health.data.arag.ms} ms`],
                    ["Mode", health.data.mock ? "in-process mock (no credentials)" : "live"],
                    ["Service version", health.data.version],
                    ["Platform", `arag-platform ${health.data.platformVersion}`],
                  ]}
                />
                {health.data.arag.error && (
                  <div className="arag-alert error" style={{ marginTop: 12 }}>
                    {health.data.arag.error}
                  </div>
                )}
              </Panel>
              <Panel title="Raw response">
                <JsonView data={health.data} />
              </Panel>
            </div>
          )}
        </StateBlock>
      ) : (
        <StateBlock loading={config.loading} error={config.error}>
          {config.data && (
            <div className="arag-stack">
              <Panel title="Limits and taxonomy">
                <KeyValues
                  rows={[
                    ["App version", config.data.version],
                    ["Platform", config.data.platformVersion],
                    ["Read cache", `${config.data.cache.ttlMs} ms`],
                    ["Longest question", `${config.data.limits.maxQuestionChars} characters`],
                    [
                      "Largest body",
                      `${Math.round((config.data.limits.maxBodyBytes ?? 0) / 1024 / 1024)} MB`,
                    ],
                    [
                      "Rate limit",
                      `${config.data.limits.rateLimitRps}/s, burst ${config.data.limits.rateLimitBurst}`,
                    ],
                    ["Labelsets", String(config.data.taxonomy.labelsets)],
                    ["Agents", config.data.taxonomy.agents.join(", ")],
                  ]}
                />
              </Panel>
              <Panel title="Environment (secrets redacted server-side)">
                <JsonView data={config.data.env} />
              </Panel>
            </div>
          )}
        </StateBlock>
      )}
    </AdminShell>
  );
}
