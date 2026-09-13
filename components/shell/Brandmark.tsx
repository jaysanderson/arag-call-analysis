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
  const src = variant === "dark" ? "/ui/brand/arag-logo-alt.svg" : "/ui/brand/arag-logo.svg";
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
 * The identity block at the top of the sidebar: **the product's** identity, not the platform's.
 *
 * The Progress Agentic RAG wordmark belongs to the band above and the footer credit below, and is
 * deliberately absent here — showing it in both places put the same mark twice in the top-left
 * corner and made the platform, rather than the product, read as the thing you are using. What
 * belongs here is the partner's logo when one is configured, and the product name and tagline.
 */
export function ProductIdent({ branding }: { branding: Branding }) {
  return (
    <>
      {branding.logoUrl && <img src={branding.logoUrl} alt={branding.productName} />}
      <span className="name">{branding.productName}</span>
      {branding.tagline && <span className="tag">{branding.tagline}</span>}
    </>
  );
}

/**
 * True when the rail identity block would render anything at all. It always does now — the kit's
 * collapsed rail hides the name and tagline with CSS rather than by dropping them from the DOM —
 * but the predicate stays as the single place that answers the question.
 */
export function hasIdent(_branding: Branding): boolean {
  return true;
}
