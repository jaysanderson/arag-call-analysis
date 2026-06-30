import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Call Analysis — ARAG",
  description: "Call intelligence built entirely on Progress Agentic RAG",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="bg-ink-950 text-white">
            <div className="mx-auto max-w-7xl px-6 h-14 flex items-center gap-6">
              <Link href="/" className="font-semibold tracking-tight flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-brand-500" />
                Call Analysis
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <NavLink href="/">Dashboard</NavLink>
                <NavLink href="/calls">Calls</NavLink>
              </nav>
              <div className="ml-auto text-xs text-slate-400">Powered by Progress Agentic RAG</div>
            </div>
          </header>
          <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  );
}
