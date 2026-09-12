"use client";

import { useState } from "react";
import { Wordmark } from "@/components/shell/Brandmark";
import type { Branding } from "@/lib/branding";

/**
 * The white-label preview: what a partner's deployment will look like, and the exact environment
 * block that produces it.
 *
 * The preview is client-side only and deliberately changes nothing on the server — branding is
 * deployment configuration, not a user setting, and a product screen that appeared to save it
 * would be lying. What it does is remove the guesswork: a partner can see the result before
 * restarting anything.
 */
export function BrandingPreview({ branding }: { branding: Branding }) {
  const [name, setName] = useState(branding.productName);
  const [tagline, setTagline] = useState(branding.tagline);
  const [primary, setPrimary] = useState(branding.primaryColor);
  const [accent, setAccent] = useState(branding.accentColor);
  const [poweredBy, setPoweredBy] = useState(branding.poweredBy);
  const [footer, setFooter] = useState(branding.footerText);

  const changed =
    name !== branding.productName ||
    tagline !== branding.tagline ||
    primary !== branding.primaryColor ||
    accent !== branding.accentColor ||
    poweredBy !== branding.poweredBy ||
    footer !== branding.footerText;

  const env = [
    `BRAND_PRODUCT_NAME=${name}`,
    `BRAND_TAGLINE=${tagline}`,
    `BRAND_PRIMARY_COLOR=${primary}`,
    `BRAND_ACCENT_COLOR=${accent}`,
    `BRAND_POWERED_BY=${poweredBy ? 1 : 0}`,
    `BRAND_FOOTER_TEXT=${footer}`,
    `BRAND_LOGO_URL=${branding.logoUrl}`,
  ].join("\n");

  return (
    <section className="arag-stack">
      <div className="arag-card pad">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 650 }}>Branding</h2>
        <p className="small" style={{ marginTop: 0 }}>
          Branding is deployment configuration: it is read from the environment at start-up, so the controls
          below preview a change rather than save one. Copy the block underneath into the deployment&rsquo;s
          environment and restart.
        </p>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <div className="arag-field">
            <label htmlFor="b-name">Product name</label>
            <input
              id="b-name"
              className="arag-input"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="arag-field">
            <label htmlFor="b-tag">Tagline</label>
            <input
              id="b-tag"
              className="arag-input"
              value={tagline}
              maxLength={80}
              onChange={(e) => setTagline(e.target.value)}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="arag-field">
              <label htmlFor="b-primary">Primary colour</label>
              <input
                id="b-primary"
                className="arag-input"
                type="color"
                value={hexOf(primary)}
                onChange={(e) => setPrimary(e.target.value)}
              />
            </div>
            <div className="arag-field">
              <label htmlFor="b-accent">Accent colour</label>
              <input
                id="b-accent"
                className="arag-input"
                type="color"
                value={hexOf(accent)}
                onChange={(e) => setAccent(e.target.value)}
              />
            </div>
          </div>
          <div className="arag-field">
            <label htmlFor="b-footer">Footer line</label>
            <input
              id="b-footer"
              className="arag-input"
              value={footer}
              maxLength={200}
              onChange={(e) => setFooter(e.target.value)}
            />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={poweredBy} onChange={(e) => setPoweredBy(e.target.checked)} />
            Show the Progress Agentic RAG band and footer credit
          </label>
        </div>
      </div>

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
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="" style={{ height: 18, width: "auto" }} />
              ) : (
                <Wordmark height={16} />
              )}
              <div style={{ fontWeight: 650, fontSize: 14, marginTop: 6, color: "var(--arag-ink-950)" }}>
                {name}
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
                      background: i === 1 ? tint(primary) : "transparent",
                      color: i === 1 ? primary : "var(--arag-text-muted)",
                    }}
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, padding: 16, background: "var(--arag-surface)" }}>
              <div style={{ fontSize: 17, fontWeight: 650, color: "var(--arag-ink-950)" }}>Calls</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <span
                  style={{
                    background: primary,
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
                    border: `1px solid ${primary}`,
                    color: primary,
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
                    background: accent,
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
            <span>{footer}</span>
            {poweredBy && <span style={{ marginLeft: "auto" }}>Built on Progress Agentic RAG</span>}
          </div>
        </div>
      </div>

      <div className="arag-card pad">
        <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 650 }}>
          Environment {changed ? "for this preview" : "currently in effect"}
        </h2>
        <pre className="arag-json" style={{ whiteSpace: "pre-wrap" }}>
          {env}
        </pre>
      </div>
    </section>
  );
}

/**
 * A colour control: the native picker as a swatch, with the hex beside it so the value can be
 * read and pasted — a swatch alone tells a partner nothing they can put in an environment file.
 */
function Swatch({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="arag-field">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          id={id}
          className="arag-input"
          type="color"
          value={hexOf(value)}
          onChange={(e) => onChange(e.target.value)}
        />
        <code className="mono" style={{ fontSize: 12.5 }}>
          {value}
        </code>
      </div>
    </div>
  );
}

/** `<input type="color">` only accepts `#rrggbb`; anything else falls back to the kit's blue. */
function hexOf(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#2b2bb2";
}

function tint(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}1a` : "var(--arag-brand-50)";
}
