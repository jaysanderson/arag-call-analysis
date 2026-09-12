"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Branding } from "@/lib/branding";
import { HowThisWorks } from "./HowThisWorks";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/calls", label: "Calls" },
  { href: "/admin", label: "Admin" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Crafted wordmark lockup (standard B41) — a real mark, not a letter glyph
 * in a rounded/gradient square (the pattern the GM has flagged twice as
 * vibe-coded slop). A five-bar pulse motif — the same "moment map" idea the
 * card thumbnails use, thematically the product's own real audio waveform,
 * not a decorative icon — sits directly beside custom-set type, no box.
 */
function Logo({ branding }: { branding: Branding }) {
  // A partner logo replaces the wordmark entirely; otherwise the wordmark is set with the
  // configured product name so a white-label install needs no image at all.
  if (branding.logoUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: an arbitrary partner URL, not a build asset
      <img src={branding.logoUrl} alt={branding.productName} className="h-6 w-auto shrink-0" />
    );
  }
  const width = Math.max(150, 28 + branding.productName.length * 9);
  return (
    <svg
      width={width}
      height="24"
      viewBox={`0 0 ${width} 24`}
      className="shrink-0"
      role="img"
      aria-label={branding.productName}
    >
      <rect x="0" y="8" width="2.6" height="8" rx="1.3" fill="var(--arag-brand-400)" />
      <rect x="4.6" y="3" width="2.6" height="18" rx="1.3" fill="var(--arag-brand-600)" />
      <rect x="9.2" y="0" width="2.6" height="24" rx="1.3" fill="var(--arag-ink-950)" />
      <rect x="13.8" y="4" width="2.6" height="16" rx="1.3" fill="var(--arag-brand-600)" />
      <rect x="18.4" y="9" width="2.6" height="6" rx="1.3" fill="var(--arag-brand-400)" />
      <text
        x="28"
        y="17"
        fontFamily="var(--font-display)"
        fontWeight={600}
        fontSize="15.5"
        letterSpacing="-0.2"
        fill="var(--arag-ink-950)"
      >
        {branding.productName}
      </text>
    </svg>
  );
}

/**
 * Standing chrome for every route (table-stakes gate 2 / standard B2):
 *  - a brand-compliant Progress Agentic RAG header, always on top
 *  - the Call Analysis product's own nav/identity beneath it
 *  - a discreet "Built on Progress Agentic RAG" footer credit
 * The solution-architecture reveal (gate 11 / B12) lives in the Progress
 * band, top-right, on every route.
 */
export function AppChrome({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Standing chrome, both bands stay pinned together on scroll so the Progress
          frame is genuinely always-present, not just present on first paint. */}
      <div className="sticky top-0 z-30">
        {/*
          Progress Agentic RAG brand band. A partner deployment can hide the platform credit with
          BRAND_POWERED_BY=0; the "How this works" reveal moves into the product header so the
          architecture disclosure is never lost with it.
        */}
        {branding.poweredBy && (
          <div className="arag-dark bg-ink-950" data-testid="powered-by-band">
            <div className="mx-auto flex h-11 max-w-7xl items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-2">
                {/* biome-ignore lint/performance/noImgElement: a static brand asset, not a build image */}
                <img
                  src="/brand/arag-logo-alt.svg"
                  alt="Progress Agentic RAG"
                  className="h-4 w-auto sm:h-[18px]"
                />
              </div>
              <HowThisWorks />
            </div>
          </div>
        )}

        {/* The Call Analysis product's own experience — its own identity, beneath the Progress frame. */}
        <header className="border-b border-brand-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <Logo branding={branding} />
              {branding.tagline && (
                <span className="hidden text-xs font-normal text-slate-400 md:inline">
                  {branding.tagline}
                </span>
              )}
            </Link>

            <nav className="ml-2 hidden items-center gap-1 text-sm sm:flex">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    isActive(pathname, n.href)
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-ink-950"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto hidden items-center gap-1 sm:flex">
              {!branding.poweredBy && <HowThisWorks />}
              <a
                href={branding.docsUrl}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-ink-950"
              >
                API
              </a>
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="ml-auto grid h-9 w-9 place-items-center sm:ml-0 rounded-md border border-brand-200 text-ink-950 sm:hidden"
              aria-label="Open menu"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </header>
      </div>

      {/* Mobile drawer nav — solid background + backdrop, never a see-through overlay (standard B32). */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 drawer-backdrop sm:hidden" onClick={() => setDrawerOpen(false)}>
          <div
            className="absolute right-0 top-0 h-full w-72 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-semibold text-ink-950">Menu</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav className="mt-5 flex flex-col gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium ${
                    isActive(pathname, n.href)
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>

      <footer className="border-t border-brand-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:px-6">
          <span>{branding.footerText}</span>
          <span className="inline-flex items-center gap-3">
            {branding.supportUrl && (
              <a href={branding.supportUrl} className="hover:text-brand-600 hover:underline">
                Support
              </a>
            )}
            {branding.poweredBy && (
              <span className="inline-flex items-center gap-1.5" data-testid="powered-by-credit">
                {/* biome-ignore lint/performance/noImgElement: a static brand asset, not a build image */}
                <img src="/brand/arag-logo.svg" alt="" className="h-3.5 w-auto opacity-70" />
                Built on Progress Agentic RAG
              </span>
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}
