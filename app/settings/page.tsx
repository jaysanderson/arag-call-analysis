import Link from "next/link";
import { StateChip } from "@/components/kit";
import { BrandingPreview } from "@/components/settings/BrandingPreview";
import { UsagePanel } from "@/components/settings/UsagePanel";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { getRuntime } from "@/lib/runtime";
import { settings } from "@/services/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

const TABS = [
  { key: "connection", label: "Connection" },
  { key: "branding", label: "Branding" },
  { key: "usage", label: "Usage" },
  { key: "api-keys", label: "API keys" },
  { key: "about", label: "About" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab = (TABS.some((t) => t.key === raw) ? raw : "connection") as Tab;
  const rt = await getRuntime();
  const s = settings(rt);

  return (
    <>
      <PageHeader
        title="Settings"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Settings" }]}
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

      <div className="arag-pagebody narrow">
        {tab === "connection" && <Connection s={s} />}
        {tab === "branding" && <BrandingPreview branding={s.branding} />}
        {tab === "usage" && <UsagePanel />}
        {tab === "api-keys" && <ApiKeys s={s} />}
        {tab === "about" && <About s={s} />}
        <ApiMeta>
          <code>GET /api/v1/settings</code>
        </ApiMeta>
      </div>
    </>
  );
}

type Settings = ReturnType<typeof settings>;

function Connection({ s }: { s: Settings }) {
  return (
    <section className="arag-stack">
      <div className="arag-card pad">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>Knowledge Box</h2>
          <StateChip tone={s.connection.mode === "mock" ? "muted" : "ok"}>
            {s.connection.mode === "mock" ? "Sample data" : "Live"}
          </StateChip>
        </div>
        {s.connection.mode === "mock" ? (
          <p className="small" style={{ marginTop: 0 }}>
            This deployment is running against the in-process sample Knowledge Box, seeded with{" "}
            {s.connection.seededCalls ?? 0} synthetic calls. Everything on every screen is real behaviour
            against a real API — only the Knowledge Box is local. Set <code className="mono">ARAG_KB_ID</code>{" "}
            and <code className="mono">ARAG_API_KEY</code> to connect a live one.
          </p>
        ) : (
          <p className="small" style={{ marginTop: 0 }}>
            Connected to a live Knowledge Box. Credentials are read from the environment and never reach the
            browser.
          </p>
        )}
        <dl className="arag-kv" style={{ marginTop: 12 }}>
          <div>
            <dt>Mode</dt>
            <dd>{s.connection.mode}</dd>
          </div>
          <div>
            <dt>Knowledge Box</dt>
            <dd className="mono">{s.connection.kbId || "in-process"}</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{s.connection.region || "—"}</dd>
          </div>
          <div>
            <dt>Endpoint</dt>
            <dd className="mono">{s.connection.baseUrl || "—"}</dd>
          </div>
        </dl>
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <Link href="/admin/connection" className="arag-btn secondary sm">
            Run a connection test
          </Link>
          <Link href="/taxonomy" className="arag-btn secondary sm">
            Agents & taxonomy
          </Link>
        </div>
      </div>

      <div className="arag-card pad">
        <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 650 }}>What this deployment allows</h2>
        <dl className="arag-kv">
          <div>
            <dt>Uploads</dt>
            <dd>{s.features.uploads ? "Allowed" : "Disabled"}</dd>
          </div>
          <div>
            <dt>Deleting calls</dt>
            <dd>{s.features.deletes ? "Allowed" : "Disabled"}</dd>
          </div>
          <div>
            <dt>Operator panel</dt>
            <dd>{s.features.adminPanel ? "Enabled" : "Disabled (no ADMIN_TOKEN)"}</dd>
          </div>
          <div>
            <dt>API-key authentication</dt>
            <dd>{s.features.apiKeyAuth ? "Required" : "Open"}</dd>
          </div>
          <div>
            <dt>Longest question</dt>
            <dd>{s.limits.maxQuestionChars} characters</dd>
          </div>
          <div>
            <dt>Largest upload</dt>
            <dd>{Math.round(s.limits.maxUploadBytes / 1_048_576)} MB</dd>
          </div>
          <div>
            <dt>Rate limit</dt>
            <dd>{s.limits.rateLimitRps} requests per second per client</dd>
          </div>
          <div>
            <dt>Read cache</dt>
            <dd>{Math.round(s.limits.cacheTtlMs / 1000)} s</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function ApiKeys({ s }: { s: Settings }) {
  return (
    <section className="arag-card pad">
      <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 650 }}>API keys</h2>
      <p className="small" style={{ marginTop: 0 }}>
        {s.apiKeys.configured > 0
          ? `${s.apiKeys.configured} key${s.apiKeys.configured === 1 ? " is" : "s are"} configured for this deployment.`
          : "No API keys are configured, so the read API is open and writes are refused unless an operator is signed in."}
      </p>
      <div className="arag-alert" style={{ marginTop: 12 }}>
        <div>
          Keys are supplied by the <code className="mono">API_KEYS</code> environment variable and are
          read-only here. Issuing and revoking keys from inside the product is not implemented yet; the key
          material never leaves the server and is never shown on this screen.
        </div>
      </div>
      <dl className="arag-kv" style={{ marginTop: 14 }}>
        <div>
          <dt>Keys configured</dt>
          <dd>{s.apiKeys.configured}</dd>
        </div>
        <div>
          <dt>Managed in-product</dt>
          <dd>No</dd>
        </div>
        <div>
          <dt>Header</dt>
          <dd className="mono">X-API-Key, or Authorization: Bearer</dd>
        </div>
      </dl>
      <div style={{ marginTop: 14 }}>
        <a href="/api/v1/docs" className="arag-btn secondary sm">
          API reference
        </a>
      </div>
    </section>
  );
}

function About({ s }: { s: Settings }) {
  return (
    <section className="arag-stack">
      <div className="arag-card pad">
        <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 650 }}>About</h2>
        <dl className="arag-kv">
          <div>
            <dt>Product</dt>
            <dd>{s.branding.productName}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd className="mono">{s.version}</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd className="mono">arag-platform {s.platformVersion}</dd>
          </div>
          <div>
            <dt>Licence</dt>
            <dd>Apache-2.0</dd>
          </div>
          <div>
            <dt>Labelsets</dt>
            <dd>
              {s.taxonomy.labelsets} ({s.taxonomy.resourceLabelsets} call-level, {s.taxonomy.paragraphLabels}{" "}
              moment labels)
            </dd>
          </div>
        </dl>
      </div>
      <div className="arag-card pad">
        <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 650 }}>Agents</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {s.taxonomy.agents.map((a) => (
            <li key={a.key}>
              <div className="mono" style={{ fontSize: 12.5, fontWeight: 650 }}>
                {a.key}
              </div>
              <div className="small" style={{ color: "var(--arag-text-muted)" }}>
                {a.description}
              </div>
            </li>
          ))}
        </ul>
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
        </div>
      </div>
    </section>
  );
}
