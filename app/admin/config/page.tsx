"use client";

import { AdminShell, JsonView, KeyValues, Panel, StateBlock, useAdminData } from "@/components/admin/AdminShell";

type Config = {
  version: string;
  platformVersion: string;
  env: Record<string, unknown>;
  taxonomy: { labelsets: number; resourceLabelsets: string[]; agents: string[] };
  cache: { ttlMs: number };
  limits: Record<string, number>;
};

export default function AdminConfigPage() {
  const { data, error, loading } = useAdminData<Config>("/api/v1/admin/config");
  return (
    <AdminShell
      title="Configuration"
      description="The effective environment this process booted with. Tokens and keys are redacted server-side — they are never sent to the browser."
    >
      <StateBlock loading={loading} error={error}>
        {data && (
          <div className="space-y-4">
            <Panel title="Limits and taxonomy">
              <KeyValues
                rows={[
                  ["App version", data.version],
                  ["Platform", data.platformVersion],
                  ["Cache TTL", `${data.cache.ttlMs} ms`],
                  ["Max question", `${data.limits.maxQuestionChars} chars`],
                  ["Max body", `${Math.round((data.limits.maxBodyBytes ?? 0) / 1024 / 1024)} MB`],
                  ["Rate limit", `${data.limits.rateLimitRps}/s burst ${data.limits.rateLimitBurst}`],
                  ["Labelsets", String(data.taxonomy.labelsets)],
                  ["Agents", data.taxonomy.agents.join(", ")],
                ]}
              />
            </Panel>
            <Panel title="Environment (redacted)">
              <JsonView data={data.env} />
            </Panel>
          </div>
        )}
      </StateBlock>
    </AdminShell>
  );
}
