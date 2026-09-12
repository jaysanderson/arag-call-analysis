"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/config", label: "Config" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/logs", label: "Logs" },
  { href: "/admin/cache", label: "Cache" },
];

/** Problem-aware fetch for every admin page: RFC 9457 `detail` becomes the thrown message. */
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const problem = body as { detail?: string; title?: string } | undefined;
    const err = new Error(problem?.detail ?? problem?.title ?? `Request failed (${res.status})`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body as T;
}

/** Poll an admin endpoint, exposing `{data, error, loading, reload}`. */
export function useAdminData<T>(path: string, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    adminFetch<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    reload();
    if (!refreshMs) return;
    const t = setInterval(reload, refreshMs);
    return () => clearInterval(t);
  }, [reload, refreshMs]);

  return { data, error, loading, reload };
}

export function AdminShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  return (
    <div className="space-y-5">
      <nav
        data-testid="admin-nav"
        aria-label="Admin sections"
        className="arag-card flex flex-wrap items-center gap-1 p-2"
      >
        {NAV.map((n) => {
          const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
        <a
          href="/api/v1/docs"
          className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
        >
          API reference ↗
        </a>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-950">{title}</h1>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        {actions}
      </div>

      {children}
    </div>
  );
}

export function Panel({
  title,
  right,
  children,
  className,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`arag-card p-4 ${className ?? ""}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function StateBlock({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (error)
    return (
      <div
        data-testid="admin-error"
        className="rounded-md border border-danger-dark/40 bg-danger-bg p-3 text-sm text-danger-fg"
      >
        {error}
        {error.toLowerCase().includes("admin token") && (
          <>
            {" "}
            <Link href="/admin/login" className="underline">
              Sign in
            </Link>
          </>
        )}
      </div>
    );
  if (loading) return <div className="animate-pulse text-sm text-slate-400">Loading…</div>;
  if (empty) return <div className="text-sm text-slate-400">Nothing to show yet.</div>;
  return <>{children}</>;
}

export function KeyValues({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 border-b border-brand-50 pb-1.5">
          <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="font-mono text-sm text-ink-950">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonView({ data }: { data: unknown }) {
  return (
    <pre className="scroll-thin max-h-[520px] overflow-auto rounded-md bg-ink-950 p-3 font-mono text-xs leading-relaxed text-brand-100">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
        ok ? "bg-accent-fill-soft text-accent-fg-light" : "bg-danger-bg text-danger-fg"
      }`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
