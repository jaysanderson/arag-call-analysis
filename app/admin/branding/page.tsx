"use client";

import { AdminShell, KeyValues, Panel, StateBlock, useAdminData } from "@/components/admin/AdminShell";

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

type Config = { branding: Branding };

function Swatch({ color }: { color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: "1px solid var(--arag-border)",
          background: color,
          display: "inline-block",
        }}
      />
      <code className="mono">{color}</code>
    </span>
  );
}

/**
 * The effective white-label identity, so an operator can confirm what a partner's customers will
 * actually see. The live preview and the environment block are on the product's Settings screen.
 */
export default function AdminBrandingPage() {
  const { data, error, loading } = useAdminData<Config>("/api/v1/admin/config");
  return (
    <AdminShell
      title="Branding"
      description="The white-label identity this process booted with. Set with the BRAND_* environment variables."
      actions={
        <a href="/settings?tab=branding" className="arag-btn secondary sm">
          Open the preview
        </a>
      }
    >
      <StateBlock loading={loading} error={error}>
        {data && (
          <Panel title="In effect">
            <KeyValues
              rows={[
                ["Product name", data.branding.productName],
                ["Tagline", data.branding.tagline || "—"],
                [
                  "Logo",
                  data.branding.logoUrl ? (
                    <a key="logo" href={data.branding.logoUrl}>
                      {data.branding.logoUrl}
                    </a>
                  ) : (
                    "Progress Agentic RAG wordmark"
                  ),
                ],
                ["Primary colour", <Swatch key="p" color={data.branding.primaryColor} />],
                ["Accent colour", <Swatch key="a" color={data.branding.accentColor} />],
                ["Progress credit", data.branding.poweredBy ? "shown" : "hidden"],
                ["Footer line", data.branding.footerText || "—"],
                ["Docs link", data.branding.docsUrl],
                ["Support link", data.branding.supportUrl || "—"],
              ]}
            />
            <p className="small" style={{ marginTop: 12, color: "var(--arag-text-subtle)" }}>
              Hiding the Progress credit removes the brand band, the wordmark and every use of Progress green
              together — a white-labelled deployment shows none of it.
            </p>
          </Panel>
        )}
      </StateBlock>
    </AdminShell>
  );
}
