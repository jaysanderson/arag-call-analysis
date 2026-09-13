"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { HowThisWorks } from "@/components/HowThisWorks";
import {
  IconActivity,
  IconAdmin,
  IconApi,
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
import { useModalFocus } from "@/components/kit";
import type { Branding } from "@/lib/branding";
import { hasIdent, ProductIdent, Wordmark } from "./Brandmark";

/**
 * The standing application shell: Progress band, left rail, main column, footer.
 *
 * As of arag-platform 0.2.0 the chrome is the kit's (`.arag-app` / `.arag-appband` / `.arag-rail` /
 * `.arag-railnav` / `.arag-main`), in the `rail="light"` family — this product's rail has always
 * been a light surface and the kit ships both. The kit's shell is a custom element written for
 * plain-DOM products; this is the same markup contract rendered by React, so the CSS, the collapse
 * behaviour, the drawer and the collapsed-rail accessibility rules are all the kit's.
 *
 * Three things it is responsible for that a page must never re-implement:
 *  1. **Identity.** The Progress band and the product identity block, both driven by `Branding`.
 *  2. **Navigation.** One nav definition, so a new screen cannot be added without appearing in it.
 *  3. **Live deployment state.** The connection mode and running-job count in the rail foot,
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
  { href: "/api", label: "API", icon: IconApi },
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

/**
 * Nav links follow the kit's `.arag-railnav` contract: the label is always rendered inside a
 * `<span>` and the collapsed rail hides it with CSS, so the accessible name survives collapsing
 * (the previous implementation dropped the text node entirely, leaving an unnamed link).
 */
function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
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
            aria-current={active ? "page" : undefined}
            title={n.label}
            onClick={onNavigate}
          >
            <n.icon size={18} />
            <span>{n.label}</span>
          </Link>
        );
      })}
    </>
  );
}

/**
 * The mobile navigation trigger, shared between the shell and `PageHeader`.
 *
 * A white-label deployment (`BRAND_POWERED_BY=0`) removes the Progress band, and the hamburger
 * used to live only inside it: below 900px that left no way at all to reach the rail — seven nav
 * links, none of them openable. The shell therefore owns the drawer state and says where the one
 * trigger is rendered: in the band when there is a band, and in the page header when there is
 * not. Exactly one exists in either configuration, so its accessible name stays unambiguous.
 */
interface NavToggle {
  open: boolean;
  toggle: () => void;
  /** True when the shell has already rendered the trigger in the Progress band. */
  inBand: boolean;
}
const NavToggleContext = createContext<NavToggle | null>(null);

function NavMenuButton({
  nav,
  className,
  style,
}: {
  nav: NavToggle;
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={nav.toggle}
      aria-label="Open navigation"
      aria-expanded={nav.open}
      className={className}
      style={{ lineHeight: 0, ...style }}
    >
      <IconMenu size={18} />
    </button>
  );
}

export function AppShell({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const rail = useRef<HTMLElement>(null);
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

  const railState = drawer ? "open" : collapsed ? "collapsed" : "expanded";
  const nav: NavToggle = {
    open: drawer,
    toggle: () => setDrawer((d) => !d),
    inBand: branding.poweredBy,
  };

  return (
    <NavToggleContext.Provider value={nav}>
      <div className="arag-app" data-rail-theme="light" data-rail={railState}>
        <a className="arag-skip" href="#main">
          Skip to content
        </a>
        {branding.poweredBy && (
          <div className="arag-appband arag-dark" data-testid="powered-by-band">
            <NavMenuButton nav={nav} className="arag-rail-menu" />
            <Wordmark variant="dark" height={18} className="wordmark" />
            <span className="spacer" />
            {deployment?.mode === "mock" && <span className="arag-pill-live">Sample data</span>}
            <HowThisWorks />
            <a href={branding.docsUrl}>Docs</a>
          </div>
        )}

        <div className="body">
          {/*
            While the drawer is open the rail IS the overlay, so it takes the dialog contract the
            kit's own `Drawer` has: a modal role and, through `NavDrawer` below, the trap that
            keeps Tab inside it and returns focus to the trigger on close.
          */}
          {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: `role` is conditional, so the rule
              reads the element's implicit `navigation` role; while the drawer is open the role IS
              `dialog`, which `aria-modal` belongs to. */}
          <nav
            ref={rail}
            className="arag-rail"
            aria-label="Primary"
            data-testid="app-sidebar"
            role={drawer ? "dialog" : undefined}
            aria-modal={drawer ? true : undefined}
            tabIndex={drawer ? -1 : undefined}
          >
            {hasIdent(branding) && (
              <Link href="/" className="ident" onClick={() => setDrawer(false)}>
                <ProductIdent branding={branding} />
              </Link>
            )}
            <div className="arag-railnav">
              <NavList items={PRODUCT_NAV} pathname={pathname} onNavigate={() => setDrawer(false)} />
              <div className="group">Operations</div>
              <NavList items={OPERATIONS_NAV} pathname={pathname} onNavigate={() => setDrawer(false)} />
            </div>
            <div className="foot">
              {deployment && (
                <>
                  <span
                    className="arag-status"
                    data-state={deployment.mode === "mock" ? undefined : "ok"}
                    title={
                      deployment.mode === "mock"
                        ? "Running against the in-process sample Knowledge Box"
                        : "Connected to a live Knowledge Box"
                    }
                  >
                    <span className="dot" />
                    <span>{deployment.mode === "mock" ? "Sample data" : "Live"}</span>
                  </span>
                  {deployment.runningJobs > 0 && (
                    <Link
                      href="/upload/history"
                      className="arag-status"
                      data-state="busy"
                      onClick={() => setDrawer(false)}
                      title={`${deployment.runningJobs} job${deployment.runningJobs === 1 ? "" : "s"} running`}
                    >
                      <span className="dot" />
                      <span>
                        {deployment.runningJobs} job{deployment.runningJobs === 1 ? "" : "s"} running
                      </span>
                    </Link>
                  )}
                </>
              )}
              {/*
                The architecture reveal normally lives in the Progress band. A white-label deployment
                removes that band, and the disclosure must not disappear with the credit — it moves
                here instead, styled for the light rail.
              */}
              {!branding.poweredBy && (
                <div className="ca-light-reveal" style={{ marginTop: 4 }}>
                  <HowThisWorks />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="arag-rail-toggle"
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {collapsed ? <IconExpand size={16} /> : <IconCollapse size={16} />}
              <span>Collapse</span>
            </button>
          </nav>

          <main className="arag-main" id="main">
            {children}
          </main>
        </div>

        {drawer && <NavDrawer panel={rail} onClose={() => setDrawer(false)} />}

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
                  className="credit"
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
    </NavToggleContext.Provider>
  );
}

/**
 * The scrim over the open rail, and the focus contract that goes with it.
 *
 * It mounts only while the drawer is open, so `useModalFocus` — the kit's single implementation,
 * shared with `Drawer` and `ConfirmDialog` — runs for exactly the drawer's lifetime: focus moves
 * into the rail on open, Tab cycles inside it instead of landing on the page behind the scrim,
 * Escape closes, and focus returns to the trigger rather than to an off-canvas link.
 */
function NavDrawer({ panel, onClose }: { panel: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  useModalFocus(panel, onClose);
  return (
    <div className="arag-scrim" onClick={onClose} role="presentation">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close navigation"
        style={{ position: "fixed", top: 8, right: 8, background: "none", border: 0, color: "#fff" }}
      >
        <IconClose size={18} />
      </button>
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
  const nav = useContext(NavToggleContext);
  return (
    <header className="arag-pagehead">
      {/* The one mobile navigation trigger, when there is no Progress band to hold it. The kit's
          `.arag-rail-menu` keeps it out of the way above 1023px; `.arag-btn` gives it a look
          outside the dark band, where the band's own button styling does not reach. */}
      {nav && !nav.inBand && (
        <NavMenuButton
          nav={nav}
          className="arag-btn secondary sm arag-rail-menu"
          style={{ alignSelf: "flex-start", marginInline: 0, marginBottom: 8 }}
        />
      )}
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="arag-breadcrumb" aria-label="Breadcrumb">
          <ol>
            {breadcrumb.map((b, i) => (
              <li key={`${b.label}-${i}`}>{b.href ? <Link href={b.href}>{b.label}</Link> : b.label}</li>
            ))}
          </ol>
        </nav>
      )}
      <div className="row">
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {description && <p className="sub">{description}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {tabs}
    </header>
  );
}

/** The one-line provenance note every screen carries: which endpoint produced what you see. */
export function ApiMeta({ children }: { children: React.ReactNode }) {
  return (
    <p className="ca-meta-line" data-testid="api-meta">
      Fed by {children}
    </p>
  );
}

export { IconActivity };
