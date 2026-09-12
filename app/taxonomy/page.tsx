import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { TaxonomyScreen } from "@/components/taxonomy/TaxonomyView";
import { getRuntime } from "@/lib/runtime";
import { settings } from "@/services/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agents & Taxonomy" };

export default async function TaxonomyPage() {
  const s = settings(await getRuntime());
  return (
    <>
      <PageHeader
        title="Agents & Taxonomy"
        description="The categories every call is classified against, and the agents that apply them."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Agents & Taxonomy" }]}
      />
      <div className="arag-pagebody">
        <TaxonomyScreen canProvision={s.features.adminPanel} />
        <ApiMeta>
          <code>GET /api/v1/taxonomy</code> and <code>POST /api/v1/admin/provision</code>
        </ApiMeta>
      </div>
    </>
  );
}
