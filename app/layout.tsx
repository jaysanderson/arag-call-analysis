import type { Metadata } from "next";
import "./globals.css";
import { AppChrome } from "@/components/AppChrome";
import { brandingCss } from "@/lib/branding";
import { getRuntime } from "@/lib/runtime";

/**
 * Title and description follow the deployment's branding, so a white-label install never shows
 * "Call Analysis" in a browser tab it did not ask for.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getRuntime();
  // A partner logo doubles as the tab icon when it is an image a browser can use there; otherwise
  // the shared UI kit's favicon (vendored into public/ui/) is used.
  const icon = /\.(svg|png|ico)$/i.test(branding.logoUrl) ? branding.logoUrl : "/ui/favicon.svg";
  return {
    title: { default: branding.productName, template: `%s · ${branding.productName}` },
    description: branding.tagline || `${branding.productName} — built on Progress Agentic RAG`,
    icons: { icon },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { branding } = await getRuntime();
  return (
    <html lang="en">
      <body>
        {/*
          Brand colours as CSS custom properties. `app/globals.css` maps every Tailwind theme token
          to an `--arag-*` token, so overriding these re-colours the utilities and the shared
          `.arag-*` components together. Rendered after the stylesheet so it wins on document
          order; the values are validated in `lib/branding.ts` before they reach this string.
        */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: colours are validated by safeColor() */}
        <style dangerouslySetInnerHTML={{ __html: brandingCss(branding) }} />
        <AppChrome branding={branding}>{children}</AppChrome>
      </body>
    </html>
  );
}
