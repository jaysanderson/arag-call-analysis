import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { TaxonomyScreen } from "@/components/taxonomy/TaxonomyView";
export const dynamic = "force-dynamic";
export const metadata = { title: "Agents & Taxonomy" };

export default function TaxonomyPage() {
  return (
    <>
      <PageHeader
        title="Agents & Taxonomy"
        description="The categories every call is classified against, and the agents that apply them."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Agents & Taxonomy" }]}
      />
      <div className="arag-pagebody">
        {/* Provisioning is an operator action: this screen reads, /admin/taxonomy writes. */}
        <TaxonomyScreen canProvision={false} />
        <ApiMeta>
          <code>GET /api/v1/taxonomy</code> and <code>POST /api/v1/admin/provision</code>
        </ApiMeta>
      </div>
    </>
  );
}
