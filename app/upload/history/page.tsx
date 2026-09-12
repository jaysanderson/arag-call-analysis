import Link from "next/link";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { IngestHistory } from "@/components/upload/IngestHistory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingest history" };

export default function IngestHistoryPage() {
  return (
    <>
      <PageHeader
        title="Ingest history"
        description="Every upload, sample load, re-analysis and provisioning run, with its stages and timings."
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Upload", href: "/upload" },
          { label: "History" },
        ]}
        actions={
          <Link href="/upload" className="arag-btn sm">
            Upload a call
          </Link>
        }
      />
      <div className="arag-pagebody">
        <IngestHistory />
        <ApiMeta>
          <code>GET /api/v1/jobs</code>
        </ApiMeta>
      </div>
    </>
  );
}
