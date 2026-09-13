import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { TaxonomyScreen } from "@/components/taxonomy/TaxonomyView";
import { adminDisabled, isOperator } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agents & Taxonomy" };

/**
 * Agents & Taxonomy.
 *
 * The operator check happens here rather than in the browser: the screen renders the editable
 * product for someone who holds the write credential and an honest read-only view — with a route
 * to sign in — for everyone else, instead of showing everyone controls that answer 401. Every
 * write is still checked again at the route.
 */
export default async function TaxonomyPage() {
  const [canEdit, adminOff] = await Promise.all([isOperator(), adminDisabled()]);

  return (
    <>
      <PageHeader
        title="Agents & Taxonomy"
        description="The categories every call is classified against, and the agents that apply them."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Agents & Taxonomy" }]}
      />
      <div className="arag-content">
        <TaxonomyScreen canEdit={canEdit} adminOff={adminOff} />
        <ApiMeta>
          <code>GET /api/v1/taxonomy</code>, <code>GET /api/v1/agents</code>,{" "}
          <code>POST|PUT|DELETE /api/v1/labelsets</code>, <code>PUT /api/v1/agents/{"{key}"}</code> and{" "}
          <code>POST /api/v1/admin/provision</code>
        </ApiMeta>
      </div>
    </>
  );
}
