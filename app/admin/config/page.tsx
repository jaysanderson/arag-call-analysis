"use client";

import {
  AdminShell,
  JsonView,
  KeyValues,
  Panel,
  StateBlock,
  useAdminData,
} from "@/components/admin/AdminShell";

type Branding = {
  productName: string;
  tagline: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  poweredBy: boolean;
  footerText: string;
  docsUrl: string;
  supportUrl: string;
};

type Config = {
  version: string;
  platformVersion: string;
  env: Record<string, unknown>;
  taxonomy: { labelsets: number; resourceLabelsets: string[]; agents: string[] };
  cache: { ttlMs: number };
  limits: Record<string, number>;
  branding: Branding;
};

function Swatch({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3.5 w-3.5 rounded border border-brand-200"
        style={{ background: color }}
      />
      {color}
    </span>
  );
}

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
            <Panel title="Branding (white label)">
              <KeyValues
                rows={[
                  ["Product name", data.branding.productName],
                  ["Tagline", data.branding.tagline || "—"],
                  [
                    "Logo",
                    data.branding.logoUrl ? (
                      <a key="logo" href={data.branding.logoUrl} className="text-brand-600 underline">
                        {data.branding.logoUrl}
                      </a>
                    ) : (
                      "built-in wordmark"
                    ),
                  ],
                  ["Primary colour", <Swatch key="p" color={data.branding.primaryColor} />],
                  ["Accent colour", <Swatch key="a" color={data.branding.accentColor} />],
                  ["Powered-by credit", data.branding.poweredBy ? "shown" : "hidden"],
                  ["Footer text", data.branding.footerText || "—"],
                  ["Docs link", data.branding.docsUrl],
                  ["Support link", data.branding.supportUrl || "—"],
                ]}
              />
              <p className="mt-3 text-xs text-slate-500">
                Set with the <code className="font-mono">BRAND_*</code> environment variables — see
                docs/developer/white-label.md.
              </p>
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
