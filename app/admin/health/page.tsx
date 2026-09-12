"use client";

import {
  AdminShell,
  JsonView,
  KeyValues,
  Panel,
  StateBlock,
  StatusPill,
  useAdminData,
} from "@/components/admin/AdminShell";
import { Button } from "@/components/ui";

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

export default function AdminHealthPage() {
  const { data, error, loading, reload } = useAdminData<Health>("/api/v1/admin/health", 20_000);
  return (
    <AdminShell
      title="Health"
      description="A real catalog read plus a configuration read against the Knowledge Box, on every refresh."
      actions={
        <Button variant="secondary" onClick={reload}>
          Re-test connection
        </Button>
      }
    >
      <StateBlock loading={loading} error={error}>
        {data && (
          <div className="space-y-4">
            <Panel
              title="Knowledge Box"
              right={
                <StatusPill
                  ok={data.arag.ok}
                  label={data.arag.ok ? `OK · ${data.arag.ms} ms` : "Unreachable"}
                />
              }
            >
              <KeyValues
                rows={[
                  ["KB id", data.arag.kbId || "n/a"],
                  ["Endpoint", data.arag.baseUrl],
                  ["Generative model", data.arag.generativeModel ?? "KB default"],
                  ["Resources", String(data.arag.resources ?? "—")],
                  ["Round trip", `${data.arag.ms} ms`],
                  ["Mode", data.mock ? "mock ARAG (no credentials)" : "live"],
                ]}
              />
              {data.arag.error && (
                <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                  {data.arag.error}
                </p>
              )}
            </Panel>
            <Panel title="Raw response">
              <JsonView data={data} />
            </Panel>
          </div>
        )}
      </StateBlock>
    </AdminShell>
  );
}
