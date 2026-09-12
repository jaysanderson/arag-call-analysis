import { describe, expect, it } from "vitest";
import { BRANDING_DEFAULTS, brandingCss, readBranding, safeColor, safeLogoUrl } from "@/lib/branding";

describe("readBranding", () => {
  it("returns the product defaults for an empty environment", () => {
    expect(readBranding({})).toEqual(BRANDING_DEFAULTS);
  });

  it("reads every documented BRAND_* key", () => {
    const b = readBranding({
      BRAND_PRODUCT_NAME: "Northwind Call IQ",
      BRAND_TAGLINE: "Conversation intelligence for insurers",
      BRAND_LOGO_URL: "/branding/logo.svg",
      BRAND_PRIMARY_COLOR: "#7c3aed",
      BRAND_ACCENT_COLOR: "rgb(20, 184, 166)",
      BRAND_POWERED_BY: "0",
      BRAND_FOOTER_TEXT: "© Northwind Analytics",
      BRAND_DOCS_URL: "https://docs.northwind.example/api",
      BRAND_SUPPORT_URL: "https://support.northwind.example",
    });
    expect(b).toEqual({
      productName: "Northwind Call IQ",
      tagline: "Conversation intelligence for insurers",
      logoUrl: "/branding/logo.svg",
      primaryColor: "#7c3aed",
      accentColor: "rgb(20, 184, 166)",
      poweredBy: false,
      footerText: "© Northwind Analytics",
      docsUrl: "https://docs.northwind.example/api",
      supportUrl: "https://support.northwind.example",
    });
  });

  it("treats BRAND_POWERED_BY permissively but defaults to showing the credit", () => {
    for (const on of ["1", "true", "yes", "on", "", undefined, "nonsense"]) {
      expect(readBranding({ BRAND_POWERED_BY: on }).poweredBy, String(on)).toBe(true);
    }
    for (const off of ["0", "false", "no", "off", "OFF"]) {
      expect(readBranding({ BRAND_POWERED_BY: off }).poweredBy, off).toBe(false);
    }
  });

  it("lets a partner blank the tagline and the footer, but not the product name", () => {
    const b = readBranding({ BRAND_TAGLINE: "", BRAND_FOOTER_TEXT: "", BRAND_PRODUCT_NAME: "" });
    expect(b.tagline).toBe("");
    expect(b.footerText).toBe("");
    expect(b.productName).toBe(BRANDING_DEFAULTS.productName);
  });

  it("trims and bounds free text", () => {
    const b = readBranding({ BRAND_PRODUCT_NAME: `  ${"x".repeat(400)}  ` });
    expect(b.productName).toHaveLength(200);
  });
});

describe("hardening on top of the platform parser", () => {
  it("rejects values the platform's looser colour grammar would accept", () => {
    // The platform applies colours with element.style.setProperty(), where `rgb(.*)` is harmless.
    // This app server-renders them into a <style> element, so the grammar is tightened here.
    expect(
      readBranding({ BRAND_PRIMARY_COLOR: "rgb(1) } body { display:none } :root { --x:(" }).primaryColor,
    ).toBe(BRANDING_DEFAULTS.primaryColor);
    expect(readBranding({ BRAND_PRIMARY_COLOR: "rebeccapurple" }).primaryColor).toBe(
      BRANDING_DEFAULTS.primaryColor,
    );
  });

  it("rejects a logo URL that is not http(s) or same-origin", () => {
    expect(readBranding({ BRAND_LOGO_URL: "javascript:alert(1)" }).logoUrl).toBe("");
    expect(readBranding({ BRAND_SUPPORT_URL: "data:text/html,<script>" }).supportUrl).toBe("");
  });
});

describe("safeColor", () => {
  it("accepts hex and functional colour notations", () => {
    expect(safeColor("#fff", "#000")).toBe("#fff");
    expect(safeColor("#7C3AED", "#000")).toBe("#7C3AED");
    expect(safeColor("#7c3aedcc", "#000")).toBe("#7c3aedcc");
    expect(safeColor("rgb(1, 2, 3)", "#000")).toBe("rgb(1, 2, 3)");
    expect(safeColor("hsl(210 40% 50% / 0.5)", "#000")).toBe("hsl(210 40% 50% / 0.5)");
  });

  it("falls back rather than letting a value escape the declaration", () => {
    // The value is interpolated into a <style> element, so anything that could close the
    // declaration or add a rule must be refused.
    expect(safeColor("red; } body { display: none } :root { --x: blue", "#000")).toBe("#000");
    expect(safeColor("</style><script>alert(1)</script>", "#000")).toBe("#000");
    expect(safeColor("url(https://evil.example/x)", "#000")).toBe("#000");
    expect(safeColor("expression(alert(1))", "#000")).toBe("#000");
    expect(safeColor("", "#000")).toBe("#000");
    expect(safeColor(undefined, "#000")).toBe("#000");
  });
});

describe("safeLogoUrl", () => {
  it("allows absolute http(s) and same-origin paths", () => {
    expect(safeLogoUrl("https://cdn.example/logo.svg")).toBe("https://cdn.example/logo.svg");
    expect(safeLogoUrl("http://cdn.example/logo.png")).toBe("http://cdn.example/logo.png");
    expect(safeLogoUrl("/branding/logo.svg")).toBe("/branding/logo.svg");
  });

  it("refuses anything that is not a URL a browser should load as an image", () => {
    expect(safeLogoUrl("javascript:alert(1)")).toBe("");
    expect(safeLogoUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe("");
    expect(safeLogoUrl("//evil.example/logo.svg")).toBe("");
    expect(safeLogoUrl("logo.svg")).toBe("");
    expect(safeLogoUrl(undefined)).toBe("");
  });
});

describe("brandingCss", () => {
  it("overrides the UI-kit tokens the Tailwind theme maps to", () => {
    const css = brandingCss(readBranding({ BRAND_PRIMARY_COLOR: "#123456", BRAND_ACCENT_COLOR: "#654321" }));
    expect(css).toContain("--arag-brand-600:#123456");
    expect(css).toContain("--arag-accent-500:#654321");
    expect(css.startsWith(":root{")).toBe(true);
    expect(css).not.toContain("</");
  });
});
