"use client";

import Link from "next/link";

import { AdminShell, KeyValues, Panel, StateBlock, useAdminData } from "@/components/admin/AdminShell";
import { StateChip } from "@/components/kit";

type Config = {
  env: {
    nodeEnv?: string;
    adminToken?: unknown;
    apiKeys?: unknown;
    allowedOrigins?: string[];
    trustProxy?: string;
    [k: string]: unknown;
  };
  limits: Record<string, number>;
};

/**
 * Security posture in one place: who can read, who can write, what is rate limited and which
 * origins are allowed. Every value is read from the redacted config — no key material is ever sent
 * to a browser, so this screen shows whether a credential is configured, never what it is.
 */
export default function AdminSecurityPage() {
  const { data, error, loading } = useAdminData<Config>("/api/v1/admin/config");
  const env = data?.env ?? {};
  const keyCount = Array.isArray(env.apiKeys) ? env.apiKeys.length : env.apiKeys ? 1 : 0;
  const adminConfigured = Boolean(env.adminToken);

  return (
    <AdminShell
      title="Security"
      description="Authentication, rate limits and cross-origin policy for this deployment."
    >
      <StateBlock loading={loading} error={error}>
        {data && (
          <div className="arag-stack">
            <Panel title="Authentication">
              <KeyValues
                rows={[
                  [
                    "Operator token",
                    <StateChip key="a" tone={adminConfigured ? "ok" : "warn"}>
                      {adminConfigured ? "Configured" : "Not set — the operator panel is disabled"}
                    </StateChip>,
                  ],
                  [
                    "API keys",
                    <StateChip key="k" tone={keyCount > 0 ? "ok" : "muted"}>
                      {keyCount > 0 ? `${keyCount} configured` : "None — the read API is open"}
                    </StateChip>,
                  ],
                  ["Environment", String(env.nodeEnv ?? "development")],
                  ["Trusted proxy header", String(env.trustProxy ?? "fly")],
                ]}
              />
              <p className="small" style={{ marginTop: 12, color: "var(--arag-text-subtle)" }}>
                Writes (upload, delete, bulk actions, share links) always need the operator token or an API
                key — never the browser session alone. Key material is redacted server-side and never reaches
                this page.
              </p>
            </Panel>

            <Panel title="Rate limits">
              <KeyValues
                rows={[
                  ["Per client", `${data.limits.rateLimitRps}/s, burst ${data.limits.rateLimitBurst}`],
                  ["Asking a call", "a quarter of the shared budget, in its own bucket"],
                  ["Streaming media", "twenty times the shared budget, in its own bucket"],
                  ["Largest body", `${Math.round((data.limits.maxBodyBytes ?? 0) / 1024 / 1024)} MB`],
                ]}
              />
            </Panel>

            <Panel title="Cross-origin">
              <KeyValues
                rows={[
                  [
                    "Allowed origins",
                    (env.allowedOrigins as string[] | undefined)?.length
                      ? (env.allowedOrigins as string[]).join(", ")
                      : "none — same-origin only",
                  ],
                ]}
              />
            </Panel>

            <Panel title="API keys">
              <p className="small" style={{ marginTop: 0 }}>
                Keys are issued, named and revoked in the product and stored as SHA-256 digests — the key
                material is shown once, on creation, and never again. <code className="mono">API_KEYS</code>{" "}
                is a one-time seed for a fresh deployment: each value is imported as a managed key on first
                boot, after which it is managed like any other.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/settings?tab=api-keys" className="arag-btn secondary sm">
                  Manage API keys
                </Link>
                <Link href="/admin/audit" className="arag-btn secondary sm">
                  Audit trail
                </Link>
                <a href="/api/v1/docs" className="arag-btn secondary sm">
                  API reference
                </a>
              </div>
            </Panel>
          </div>
        )}
      </StateBlock>
    </AdminShell>
  );
}
