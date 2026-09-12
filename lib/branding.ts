/**
 * White-label branding for this product.
 *
 * Parsing lives in the shared platform (`readBranding(env, defaults)` / `Branding` /
 * `BrandingSchema`, arag-platform 0.1.6) so every ARAG product reads the same `BRAND_*` keys with
 * the same precedence. This module adds the two things that are specific to *this* product:
 *
 *  1. **The product's defaults** — name, tagline, colours and footer, so an unbranded deployment
 *     looks like the reference one.
 *  2. **A hardening pass for server-side rendering.** The platform's UI-kit shell applies colours
 *     with `element.style.setProperty()`, which is inherently safe. This app is server-rendered:
 *     the colours are interpolated into a `<style>` element and the logo into an `<img src>`, so
 *     they are re-validated here against a strict grammar before they are emitted. See the
 *     platform note in the final report — `COLOR_RE` upstream accepts `rgb(.*)`, which is fine for
 *     `setProperty` and not fine for string interpolation.
 *
 * Nothing else in the product reads a `BRAND_*` key directly.
 */
import { type Branding, readBranding as readPlatformBranding } from "../vendor/arag-platform/src/index.ts";

export type { Branding };
export { BrandingSchema } from "../vendor/arag-platform/src/index.ts";

/** What this product looks like when a partner configures nothing. */
export const BRANDING_DEFAULTS: Branding = {
  productName: "Call Analysis",
  tagline: "Contact centre intelligence",
  logoUrl: "",
  primaryColor: "#2b2bb2",
  accentColor: "#00b563",
  poweredBy: true,
  footerText: "Synthetic demo data - no real customer or call information.",
  docsUrl: "/api/v1/docs",
  supportUrl: "",
};

/**
 * A colour is interpolated into a `<style>` element, so it is validated rather than trusted: hex
 * literals and the `rgb()`/`hsl()` notations only, with no character that could close the
 * declaration. Anything else falls back to the product default, so a typo — or a hostile value in
 * a compromised environment — cannot inject a rule.
 */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9a-z%.,\s/]+\))$/i;

export function safeColor(value: string | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  if (!v) return fallback;
  return COLOR_RE.test(v) ? v : fallback;
}

/**
 * A URL taken from configuration and rendered into an `<img src>` or an `<a href>`. Only http(s)
 * and a same-origin path are allowed — the same reasoning as `safeHref` in the markdown renderer:
 * `javascript:` and `data:` are not safe places to take a value from configuration. Used for the
 * logo, the support link and the docs link.
 */
export function safeLogoUrl(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (v.startsWith("//")) return "";
  if (v.startsWith("/")) return v;
  return /^https?:\/\//i.test(v) ? v : "";
}

const bounded = (v: string) => v.trim().slice(0, 200);

/**
 * Read the branding block for this deployment: the platform parser, this product's defaults, then
 * the rendering hardening.
 *
 * One deliberate addition to the platform's semantics: the platform treats an empty variable as
 * "use the default", but a partner must be able to remove the tagline and the footer line
 * entirely, so an explicitly empty `BRAND_TAGLINE` / `BRAND_FOOTER_TEXT` is honoured as empty.
 */
export function readBranding(src: Record<string, string | undefined> = process.env): Branding {
  const parsed = readPlatformBranding(src, BRANDING_DEFAULTS);
  return {
    productName: bounded(parsed.productName) || BRANDING_DEFAULTS.productName,
    tagline: src.BRAND_TAGLINE === "" ? "" : bounded(parsed.tagline),
    logoUrl: safeLogoUrl(parsed.logoUrl),
    primaryColor: safeColor(parsed.primaryColor, BRANDING_DEFAULTS.primaryColor),
    accentColor: safeColor(parsed.accentColor, BRANDING_DEFAULTS.accentColor),
    poweredBy: parsed.poweredBy,
    footerText: src.BRAND_FOOTER_TEXT === "" ? "" : bounded(parsed.footerText),
    // `docsUrl` is rendered as an `<a href>` in the global navigation on every page, so it gets
    // exactly the same allowlist as the logo and support URLs — http(s) or a same-origin path.
    // Bounding it alone would leave `BRAND_DOCS_URL="javascript:…"` as a live link.
    docsUrl: safeLogoUrl(bounded(parsed.docsUrl)) || BRANDING_DEFAULTS.docsUrl,
    supportUrl: safeLogoUrl(parsed.supportUrl),
  };
}

/**
 * The CSS custom properties that carry the brand colours.
 *
 * `app/globals.css` maps every Tailwind theme token to an `--arag-*` token from the shared UI kit,
 * so overriding the handful below re-colours the Tailwind utilities used by the demo and the
 * `.arag-*` components used by the admin console together. Emitted after the stylesheet, so these
 * declarations win on document order.
 */
export function brandingCss(branding: Branding): string {
  return `:root{--arag-brand-500:${branding.primaryColor};--arag-brand-600:${branding.primaryColor};--arag-brand-700:${branding.primaryColor};--arag-accent-400:${branding.accentColor};--arag-accent-500:${branding.accentColor};}`;
}
