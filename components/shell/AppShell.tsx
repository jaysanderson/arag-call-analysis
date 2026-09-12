"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HowThisWorks } from "@/components/HowThisWorks";
import {
  IconActivity,
  IconAdmin,
  IconCalls,
  IconClose,
  IconCollapse,
  IconDashboard,
  IconExpand,
  IconMenu,
  IconSettings,
  IconTaxonomy,
  IconUpload,
} from "@/components/icons";
import type { Branding } from "@/lib/branding";
import { hasIdent, ProductIdent, Wordmark } from "./Brandmark";

/**
 * The standing application shell: Progress band, left sidebar, page area, footer.
 *
 * Three things it is responsible for that a page must never re-implement:
 *  1. **Identity.** The Progress band and the product identity block, both driven by `Branding`.
 *  2. **Navigation.** One nav definition, so a new screen cannot be added without appearing in it.
 *  3. **Live deployment state.** The connection mode and running-job count in the sidebar foot,
 *     polled once for the whole app rather than per screen.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: (p: { size?: number }) => React.ReactNode;
}

const PRODUCT_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: IconDashboard },
  { href: "/calls", label: "Calls", icon: IconCalls },
  { href: "/upload", label: "Upload", icon: IconUpload },
  { href: "/taxonomy", label: "Agents & Taxonomy", icon: IconTaxonomy },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

const OPERATIONS_NAV: NavItem[] = [{ href: "/admin", label: "Admin", icon: IconAdmin }];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface DeploymentState {
  mode: "mock" | "live";
  version: string;
  runningJobs: number;
}

function useDeploymentState(): DeploymentState | null {
  const [state, setState] = useState<DeploymentState | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const [settings, jobs] = await Promise.all([
          fetch("/api/v1/settings").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/v1/jobs?status=running&limit=50").then((r) => (r.ok ? r.json() : { items: [] })),
        ]);
        if (cancelled || !settings) return;
        setState({
          mode: settings.connection?.mode ?? "live",
          version: settings.version ?? "",
          runningJobs: (jobs?.items ?? []).length,
        });
      } catch {
        // The shell must never be the thing that breaks: no state simply means no status strip.
      }
    };
    read();
    const t = setInterval(read, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  return state;
}

function NavList({
  items,
  pathname,
  rail,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  rail?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className="item"
            aria-current={active ? "page" : undefined}
            title={rail ? n.label : undefined}
            onClick={onNavigate}
          >
            <n.icon size={18} />
            {!rail && <span>{n.label}</span>}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const deployment = useDeploymentState();

  // The collapse preference is per person, per browser — never a server concern.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("ca.nav.collapsed") === "1");
    } catch {
      /* private mode: the default stands */
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("ca.nav.collapsed", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  // Navigating always closes the mobile drawer, including on a browser back/forward.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closing on navigation is the point
  useEffect(() => setDrawer(false), [pathname]);

  const sidebar = (rail: boolean, onNavigate?: () => void) => (
    <>
      {/* Collapsed to the rail with no partner logo there is nothing to show, so the block is
          omitted rather than left as empty padding above the nav. */}
      {hasIdent(branding, rail) && (
        <Link href="/" className="ident" onClick={onNavigate}>
          <ProductIdent branding={branding} compact={rail} />
        </Link>
      )}
      <NavList items={PRODUCT_NAV} pathname={pathname} rail={rail} onNavigate={onNavigate} />
      {!rail && <div className="group">Operations</div>}
      <NavList items={OPERATIONS_NAV} pathname={pathname} rail={rail} onNavigate={onNavigate} />
      <div className="foot">
        {deployment && (
          <>
            <span
              className={`arag-state ${deployment.mode === "mock" ? "muted" : "ok"}`}
              title={
                deployment.mode === "mock"
                  ? "Running against the in-process sample Knowledge Box"
                  : "Connected to a live Knowledge Box"
              }
            >
              {rail ? "" : deployment.mode === "mock" ? "Sample data" : "Live"}
            </span>
            {deployment.runningJobs > 0 && (
              <Link
                href="/upload/history"
                className="arag-state busy"
                onClick={onNavigate}
                title={`${deployment.runningJobs} job${deployment.runningJobs === 1 ? "" : "s"} running`}
              >
                {rail
                  ? ""
                  : `${deployment.runningJobs} job${deployment.runningJobs === 1 ? "" : "s"} running`}
              </Link>
            )}
          </>
        )}
        {!rail && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="arag-btn ghost sm"
            style={{ justifyContent: "flex-start", paddingLeft: 6 }}
          >
            <IconCollapse size={16} />
            Collapse
          </button>
        )}
        {rail && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="arag-btn ghost sm"
            aria-label="Expand navigation"
          >
            <IconExpand size={16} />
          </button>
        )}
        {/*
          The architecture reveal normally lives in the Progress band. A white-label deployment
          removes that band, and the disclosure must not disappear with the credit — it moves here
          instead, styled for a light surface.
        */}
        {!branding.poweredBy && !rail && (
          <div className="arag-light-reveal" style={{ marginTop: 4 }}>
            <HowThisWorks />
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="arag-app">
      {branding.poweredBy && (
        <div className="arag-appband arag-dark" data-testid="powered-by-band">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
            className="lg:hidden"
            style={{ lineHeight: 0 }}
          >
            <IconMenu size={18} />
          </button>
          <Wordmark variant="dark" height={18} className="wordmark" />
          <span className="spacer" />
          {deployment?.mode === "mock" && <span className="arag-pill-live">Sample data</span>}
          <HowThisWorks />
          <a href={branding.docsUrl}>Docs</a>
        </div>
      )}

      <div className="body">
        <nav
          className={`arag-sidebar${collapsed ? " rail" : ""}`}
          aria-label="Primary"
          data-testid="app-sidebar"
        >
          {sidebar(collapsed)}
        </nav>

        <div className="arag-page">{children}</div>
      </div>

      {drawer && (
        <>
          <div className="arag-drawer-backdrop" onClick={() => setDrawer(false)} role="presentation" />
          <nav className="arag-drawer left arag-sidebar" aria-label="Primary" style={{ padding: 16 }}>
            <button
              type="button"
              onClick={() => setDrawer(false)}
              className="arag-btn ghost sm"
              style={{ alignSelf: "flex-end" }}
              aria-label="Close navigation"
            >
              <IconClose size={16} />
            </button>
            {sidebar(false, () => setDrawer(false))}
          </nav>
        </>
      )}

      <footer className="arag-footer">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            padding: "12px 24px",
            fontSize: 11.5,
          }}
        >
          <span>{branding.footerText}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 14, alignItems: "center" }}>
            {deployment?.version && <span className="mono">v{deployment.version}</span>}
            <a href={branding.docsUrl}>API</a>
            {branding.supportUrl && <a href={branding.supportUrl}>Support</a>}
            {branding.poweredBy && (
              <span
                data-testid="powered-by-credit"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Wordmark height={14} className="opacity-75" />
                Built on Progress Agentic RAG
              </span>
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}

/** Page-level header: breadcrumb, title, optional description and the screen's primary actions. */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  tabs,
}: {
  title: string;
  description?: React.ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
}) {
  return (
    <header className="arag-pagehead">
      <div style={{ minWidth: 0 }}>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="arag-breadcrumb" aria-label="Breadcrumb">
            {breadcrumb.map((b, i) => (
              <span key={`${b.label}-${i}`} style={{ display: "inline-flex", gap: 6 }}>
                {i > 0 && <span className="sep">/</span>}
                {b.href ? <Link href={b.href}>{b.label}</Link> : <span>{b.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {description && <p className="sub">{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
      {tabs && <div style={{ flexBasis: "100%" }}>{tabs}</div>}
    </header>
  );
}

/** The one-line provenance note every screen carries: which endpoint produced what you see. */
export function ApiMeta({ children }: { children: React.ReactNode }) {
  return (
    <p className="arag-meta-line" data-testid="api-meta">
      Fed by {children}
    </p>
  );
}

export { IconActivity };
