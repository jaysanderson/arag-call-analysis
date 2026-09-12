import Link from "next/link";
import { Suspense } from "react";
import { CallsWorkspace } from "@/components/calls/CallsWorkspace";
import { TableSkeleton } from "@/components/kit";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { getRuntime } from "@/lib/runtime";
import { settings } from "@/services/settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Calls" };

export default async function CallsPage() {
  // Whether this deployment allows writes is a server fact, so the table is told rather than
  // discovering it from a 401 after someone has already clicked Delete.
  const { features } = settings(await getRuntime());
  return (
    <>
      <PageHeader
        title="Calls"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Calls" }]}
        actions={
          features.uploads ? (
            <Link href="/upload" className="arag-btn sm">
              Upload a call
            </Link>
          ) : undefined
        }
      />
      <div className="arag-pagebody">
        <Suspense fallback={<TableSkeleton rows={8} cols={8} />}>
          <CallsWorkspace canWrite={features.deletes} />
        </Suspense>
        <ApiMeta>
          <code>GET /api/v1/calls</code> and <code>GET /api/v1/labelsets</code>
        </ApiMeta>
      </div>
    </>
  );
}
