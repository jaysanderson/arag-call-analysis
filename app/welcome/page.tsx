import { Welcome } from "@/components/onboarding/Welcome";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get started" };

export default function WelcomePage() {
  return (
    <>
      <PageHeader
        title="Get started"
        description="Four things have to be true before every call is categorised, summarised and searchable."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Get started" }]}
      />
      <div className="arag-pagebody">
        <Welcome />
        <ApiMeta>
          <code>GET /api/v1/onboarding</code> and <code>POST /api/v1/samples</code>
        </ApiMeta>
      </div>
    </>
  );
}
