"use client";

import { Wordmark } from "@/components/shell/Brandmark";
import type { Branding } from "@/lib/branding";

/**
 * What a partner's deployment will look like.
 *
 * This is presentation only: it renders whatever `Branding` it is handed, so the editor can pass
 * its *form* state and the preview moves as the operator types rather than after they save. The
 * shapes mirror the real shell — band, rail identity, current nav item, primary/secondary/accent
 * buttons, footer — because a preview that is drawn differently from the thing it previews drifts
 * away from it within one release.
 */
export function BrandingPreview({ branding }: { branding: Branding }) {
  const { productName, tagline, logoUrl, primaryColor, accentColor, poweredBy, footerText } = branding;
  return (
    <div className="arag-card" style={{ overflow: "hidden" }} data-testid="branding-preview">
      <div className="head">
        <h2>Preview</h2>
      </div>
      <div style={{ padding: 0 }}>
        {poweredBy && (
          <div className="arag-appband arag-dark" style={{ position: "static" }}>
            <Wordmark variant="dark" height={16} className="wordmark" />
            <span className="spacer" />
            <span className="arag-pill-live">Sample data</span>
          </div>
        )}
        <div style={{ display: "flex", minHeight: 168 }}>
          <div
            style={{
              width: 190,
              borderRight: "1px solid var(--arag-border)",
              padding: 14,
              background: "var(--arag-surface-raised)",
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" style={{ height: 18, width: "auto" }} />
            ) : (
              <Wordmark height={16} />
            )}
            <div
              style={{ fontWeight: 650, fontSize: 14, marginTop: 6, color: "var(--arag-ink-950)" }}
              data-testid="preview-name"
            >
              {productName}
            </div>
            {tagline && <div style={{ fontSize: 11, color: "var(--arag-text-subtle)" }}>{tagline}</div>}
            <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
              {["Dashboard", "Calls", "Upload"].map((n, i) => (
                <div
                  key={n}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 550,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: i === 1 ? tint(primaryColor) : "transparent",
                    color: i === 1 ? primaryColor : "var(--arag-text-muted)",
                  }}
                >
                  {n}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, padding: 16, background: "var(--arag-surface)" }}>
            <div style={{ fontSize: 17, fontWeight: 650, color: "var(--arag-ink-950)" }}>Calls</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <span
                style={{
                  background: primaryColor,
                  color: "#fff",
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                Upload a call
              </span>
              <span
                style={{
                  border: `1px solid ${primaryColor}`,
                  color: primaryColor,
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                Export
              </span>
              <span
                style={{
                  background: accentColor,
                  color: "#fff",
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                Analysed
              </span>
            </div>
          </div>
        </div>
        <div
          style={{
            borderTop: "1px solid var(--arag-border)",
            padding: "10px 14px",
            fontSize: 11,
            color: "var(--arag-text-muted)",
            display: "flex",
            gap: 10,
          }}
        >
          <span>{footerText}</span>
          {poweredBy && <span style={{ marginLeft: "auto" }}>Built on Progress Agentic RAG</span>}
        </div>
      </div>
    </div>
  );
}

function tint(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}1a` : "var(--arag-brand-50)";
}
