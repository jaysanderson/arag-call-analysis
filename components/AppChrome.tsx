"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HowThisWorks } from "./HowThisWorks";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/calls", label: "Calls" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Standing chrome for every route (table-stakes gate 2 / standard B2):
 *  - a brand-compliant Progress Agentic RAG header, always on top
 *  - the Call Analysis product's own nav/identity beneath it
 *  - a discreet "Built on Progress Agentic RAG" footer credit
 * The solution-architecture reveal (gate 11 / B12) lives in the Progress
 * band, top-right, on every route.
 */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Standing chrome, both bands stay pinned together on scroll so the Progress
          frame is genuinely always-present, not just present on first paint. */}
      <div className="sticky top-0 z-30">
        {/* Progress Agentic RAG brand band — always present, frames every demo. */}
        <div className="arag-dark bg-ink-950">
          <div className="mx-auto flex h-11 max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/arag-logo-alt.svg" alt="Progress Agentic RAG" className="h-4 w-auto sm:h-[18px]" />
            </div>
            <HowThisWorks />
          </div>
        </div>

        {/* The Call Analysis product's own experience — its own identity, beneath the Progress frame. */}
        <header className="border-b border-brand-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-ink-950">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-600 text-white">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14a8 8 0 0 1 16 0" />
                <rect x="2" y="13" width="4" height="7" rx="1.2" />
                <rect x="18" y="13" width="4" height="7" rx="1.2" />
                <path d="M12 21a2 2 0 0 0 2-2" />
              </svg>
            </span>
            <span>
              Call Analysis
              <span className="ml-2 hidden text-xs font-normal text-slate-400 sm:inline">Contact centre intelligence</span>
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 text-sm sm:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  isActive(pathname, n.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-ink-950"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <button
            onClick={() => setDrawerOpen(true)}
            className="ml-auto grid h-9 w-9 place-items-center rounded-md border border-brand-200 text-ink-950 sm:hidden"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
        </header>
      </div>

      {/* Mobile drawer nav — solid background + backdrop, never a see-through overlay (standard B32). */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 drawer-backdrop sm:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute right-0 top-0 h-full w-72 bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-semibold text-ink-950">Menu</span>
              <button onClick={() => setDrawerOpen(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <nav className="mt-5 flex flex-col gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium ${
                    isActive(pathname, n.href) ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"
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
          <span>Synthetic demo data - no real customer or call information.</span>
          <span className="inline-flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/arag-logo.svg" alt="" className="h-3.5 w-auto opacity-70" />
            Built on Progress Agentic RAG
          </span>
        </div>
      </footer>
    </div>
  );
}
