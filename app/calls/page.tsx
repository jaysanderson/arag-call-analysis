import Link from "next/link";
import { Suspense } from "react";
import { CallsWorkspace } from "@/components/calls/CallsWorkspace";
import { TableSkeleton } from "@/components/kit";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Calls" };

export default function CallsPage() {
  return (
    <>
      <PageHeader
        title="Calls"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Calls" }]}
        actions={
          <Link href="/upload" className="arag-btn sm">
            Upload a call
          </Link>
        }
      />
      <div className="arag-pagebody">
        <Suspense fallback={<TableSkeleton rows={8} cols={8} />}>
          <CallsWorkspace />
        </Suspense>
        <ApiMeta>
          <code>GET /api/v1/calls</code> and <code>GET /api/v1/labelsets</code>
        </ApiMeta>
      </div>
    </>
  );
}
