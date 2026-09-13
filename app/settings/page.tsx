import Link from "next/link";
import { ApiKeysPanel } from "@/components/settings/ApiKeysPanel";
import { AuditTrail } from "@/components/settings/AuditTrail";
import { BrandingPanel } from "@/components/settings/BrandingPanel";
import { ConnectionPanel } from "@/components/settings/ConnectionPanel";
import { LimitsPanel } from "@/components/settings/LimitsPanel";
import { RetentionPanel } from "@/components/settings/RetentionPanel";
import { SharesPanel } from "@/components/settings/SharesPanel";
import { UsagePanel } from "@/components/settings/UsagePanel";
import { ViewsPanel } from "@/components/settings/ViewsPanel";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { getRuntime } from "@/lib/runtime";
import { adminDisabled, isOperator } from "@/lib/session";
import { type SettingsView, settings } from "@/services/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

/**
 * The configuration area.
 *
 * Every tab is a real route (`?tab=…`), so a setting can be linked to, bookmarked, and reached by
 * the back button — a settings screen is exactly the kind of place a colleague sends a URL to.
 * The server component reads the settings view and decides one thing the client cannot be trusted
 * with: whether this viewer is an operator. The panels below take that as `canEdit` and render the
 * same values read-only when it is false; every write is checked again at the route regardless.
 */

const TABS = [
  { key: "connection", label: "Connection" },
  { key: "branding", label: "Branding" },
  { key: "limits", label: "Limits" },
  { key: "retention", label: "Retention" },
  { key: "api-keys", label: "API keys" },
  { key: "shares", label: "Share links" },
  { key: "views", label: "Saved views" },
  { key: "usage", label: "Usage" },
  { key: "about", label: "About" },
] as const;

type Tab = (typeof TABS)[number]["key"];

/** What fed each tab, named on the tab itself rather than once for the whole screen. */
const SOURCES: Record<Tab, string[]> = {
  connection: ["GET /api/v1/settings", "PUT /api/v1/settings/connection"],
  branding: ["GET /api/v1/settings", "PUT /api/v1/settings/branding", "POST /api/v1/settings/logo"],
  limits: ["GET /api/v1/settings", "PUT /api/v1/settings/limits"],
  retention: [
    "PUT /api/v1/settings/retention",
    "GET /api/v1/retention/preview",
    "POST /api/v1/retention/purge",
  ],
  "api-keys": ["GET /api/v1/api-keys", "POST /api/v1/api-keys", "DELETE /api/v1/api-keys/{id}"],
  shares: ["GET /api/v1/shares", "DELETE /api/v1/shares/{token}"],
  views: ["GET /api/v1/views", "DELETE /api/v1/views/{id}"],
  usage: ["GET /api/v1/admin/usage"],
  about: ["GET /api/v1/settings", "GET /api/v1/admin/audit"],
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab = (TABS.some((t) => t.key === raw) ? raw : "connection") as Tab;
  const rt = await getRuntime();
  const view = settings(rt);
  const [canEdit, adminOff] = await Promise.all([isOperator(), adminDisabled()]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="What this deployment is connected to, what it looks like, and what it allows."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Settings" }]}
        actions={
          canEdit ? (
            <span className="arag-chip" data-testid="operator-chip">
              Signed in as an operator
            </span>
          ) : adminOff ? undefined : (
            <Link href="/admin/login" className="arag-btn secondary sm">
              Sign in as an operator
            </Link>
          )
        }
        tabs={
          <div className="arag-tabs" role="tablist" style={{ marginTop: 12 }}>
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/settings?tab=${t.key}`}
                role="tab"
                aria-selected={tab === t.key}
                style={{ textDecoration: "none" }}
              >
                {t.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="arag-content narrow">
        {tab === "connection" && <ConnectionPanel initial={view} canEdit={canEdit} adminOff={adminOff} />}
        {tab === "branding" && <BrandingPanel initial={view} canEdit={canEdit} adminOff={adminOff} />}
        {tab === "limits" && <LimitsPanel initial={view} canEdit={canEdit} adminOff={adminOff} />}
        {tab === "retention" && <RetentionPanel initial={view} canEdit={canEdit} adminOff={adminOff} />}
        {tab === "api-keys" && <ApiKeysPanel initial={view} canEdit={canEdit} adminOff={adminOff} />}
        {tab === "shares" && <SharesPanel initial={view} />}
        {tab === "views" && <ViewsPanel initial={view} />}
        {tab === "usage" && <UsagePanel />}
        {tab === "about" && <About view={view} canEdit={canEdit} />}
        <ApiMeta>
          {SOURCES[tab].map((s, i) => (
            <span key={s}>
              {i > 0 && " · "}
              <code>{s}</code>
            </span>
          ))}
        </ApiMeta>
      </div>
    </>
  );
}

function About({ view, canEdit }: { view: SettingsView; canEdit: boolean }) {
  return (
    <section className="arag-stack">
      <div className="arag-card pad">
        <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 650 }}>About</h2>
        <dl className="arag-kv">
          <div>
            <dt>Product</dt>
            <dd data-testid="about-product">{view.branding.productName}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd className="mono">{view.version}</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd className="mono">arag-platform {view.platformVersion}</dd>
          </div>
          <div>
            <dt>Licence</dt>
            <dd>Apache-2.0</dd>
          </div>
          <div>
            <dt>Labelsets</dt>
            <dd>
              {view.taxonomy.labelsets} ({view.taxonomy.resourceLabelsets} call-level,{" "}
              {view.taxonomy.paragraphLabels} moment labels)
            </dd>
          </div>
        </dl>
      </div>

      <div className="arag-card pad">
        <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 650 }}>Agents</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {view.taxonomy.agents.map((a) => (
            <li key={a.key}>
              <div className="mono" style={{ fontSize: 12.5, fontWeight: 650 }}>
                {a.key}
                {!a.enabled && <span style={{ color: "var(--arag-text-subtle)" }}> · disabled</span>}
              </div>
              <div className="small" style={{ color: "var(--arag-text-muted)" }}>
                {a.description}
              </div>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 14 }}>
          <Link href="/taxonomy" className="arag-btn secondary sm">
            Edit agents &amp; taxonomy
          </Link>
        </div>
      </div>

      <div className="arag-card pad">
        <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 650 }}>Documentation</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <a href="/api/v1/docs" className="arag-btn secondary sm">
            API reference
          </a>
          <a href="/api/v1/swagger" className="arag-btn secondary sm">
            Swagger UI
          </a>
          <a href="/api/v1/openapi.json" className="arag-btn secondary sm">
            OpenAPI document
          </a>
          <Link href="/api" className="arag-btn secondary sm">
            API explorer
          </Link>
          {view.branding.supportUrl && (
            <a href={view.branding.supportUrl} className="arag-btn secondary sm">
              Support
            </a>
          )}
        </div>
      </div>

      {canEdit && <AuditTrail />}
    </section>
  );
}
