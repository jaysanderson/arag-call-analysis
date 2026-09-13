import { ApiExplorer } from "@/components/api/ApiExplorer";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";

/**
 * The API section of the product, at `/api` — deliberately alongside the `/api/v1/*` route
 * handlers, because this is the screen a reader expects to find at the API's own address.
 *
 * The document is fetched in the browser rather than rendered here so that what the screen lists
 * is provably what the running deployment serves at `/api/v1/openapi.json`.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "API" };

export default function ApiPage() {
  return (
    <>
      <PageHeader
        title="API"
        description="Every operation this deployment declares, with its schemas and a form that calls it."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "API" }]}
      />
      <div className="arag-content">
        <ApiExplorer />
        <ApiMeta>
          <code>GET /api/v1/openapi.json</code>
        </ApiMeta>
      </div>
    </>
  );
}
