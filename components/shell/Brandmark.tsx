/**
 * The product's identity, in one place.
 *
 * Default identity is the **official Progress Agentic RAG wordmark** — `arag-logo.svg` on light
 * surfaces, `arag-logo-alt.svg` on ink. Neither file is ever recoloured: the green inside them is
 * the brand's own `#5ce500`, and a tinted wordmark is a trademark violation, not a theme.
 *
 * `BRAND_LOGO_URL` replaces the wordmark entirely — that is the point of a white label — and
 * `BRAND_PRODUCT_NAME` always sets the text beneath it. A partner deployment therefore needs no
 * image at all to stop looking like Progress.
 */

import type { Branding } from "@/lib/branding";

export function Wordmark({
  variant = "light",
  height = 20,
  className,
}: {
  /** `light` for a light surface, `dark` for an ink surface. */
  variant?: "light" | "dark";
  height?: number;
  className?: string;
}) {
  const src = variant === "dark" ? "/brand/arag-logo-alt.svg" : "/brand/arag-logo.svg";
  return (
    <img
      src={src}
      alt="Progress Agentic RAG"
      className={className}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}

/**
 * The identity block in the sidebar: partner logo if configured, otherwise the Progress wordmark,
 * with the product name and tagline beneath it either way.
 */
export function ProductIdent({ branding, compact }: { branding: Branding; compact?: boolean }) {
  // The Progress wordmark is a Progress-owned surface. `BRAND_POWERED_BY=0` removes the band, the
  // footer credit AND this mark together, so a white-labelled deployment carries no Progress
  // identity at all — not even as a placeholder where a partner has supplied no logo of their own.
  const mark = branding.logoUrl ? "partner" : branding.poweredBy ? "progress" : "none";
  return (
    <>
      {mark === "partner" && (
        <img src={branding.logoUrl} alt={branding.productName} style={{ height: 20, width: "auto" }} />
      )}
      {mark === "progress" && <Wordmark height={compact ? 16 : 20} />}
      {!compact && (
        <>
          <span className="name">{branding.productName}</span>
          {branding.tagline && <span className="tag">{branding.tagline}</span>}
        </>
      )}
    </>
  );
}
