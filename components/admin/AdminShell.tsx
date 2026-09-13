"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ErrorState, Skeleton, StateChip } from "@/components/kit";
import { PageHeader } from "@/components/shell/AppShell";

/**
 * The operator product.
 *
 * It lives in the same application shell as the product — same sidebar, same page scaffold, same
 * components — because an operator is not a different species of user with a different design
 * language. What differs is the navigation and the fact that every panel here is a live read of
 * the running service rather than of the calls in it.
 */

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/connection", label: "Connection" },
  { href: "/admin/taxonomy", label: "Taxonomy & Agents" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/logs", label: "Logs" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/branding", label: "Branding" },
  { href: "/admin/security", label: "Security" },
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
    <>
      <PageHeader
        title={title}
        description={description}
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Admin", href: "/admin" }, { label: title }]}
        actions={actions}
        tabs={
          <nav
            className="arag-tabs"
            data-testid="admin-nav"
            aria-label="Operator sections"
            style={{ marginTop: 12 }}
          >
            {NAV.map((n) => {
              const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-selected={active}
                  role="tab"
                  style={{ textDecoration: "none" }}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        }
      />
      <div className="arag-content">{children}</div>
    </>
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
    <section className={`arag-card ${className ?? ""}`} style={{ padding: 16 }}>
      {(title || right) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          {title && (
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "var(--arag-ink-950)" }}>
              {title}
            </h2>
          )}
          {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
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
  if (error) {
    const needsAuth = /admin token|unauthor/i.test(error);
    return (
      <div data-testid="admin-error">
        <ErrorState
          title={needsAuth ? "You are not signed in as an operator." : "That read failed."}
          detail={error}
          action={
            needsAuth ? (
              <Link href="/admin/login" className="arag-btn secondary sm">
                Sign in
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }
  if (loading)
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Skeleton height={16} width="30%" />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  if (empty)
    return (
      <p className="small" style={{ color: "var(--arag-text-subtle)" }}>
        Nothing to show yet.
      </p>
    );
  return <>{children}</>;
}

export function KeyValues({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="arag-kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonView({ data }: { data: unknown }) {
  return (
    <pre className="arag-json scroll-thin" style={{ maxHeight: 520, overflow: "auto" }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <StateChip tone={ok ? "ok" : "error"}>{label}</StateChip>;
}
