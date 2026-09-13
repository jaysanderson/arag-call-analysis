import Link from "next/link";
import { ErrorState } from "@/components/kit";
import { ApiMeta, PageHeader } from "@/components/shell/AppShell";
import { UploadFlow } from "@/components/upload/UploadFlow";
import { getRuntime } from "@/lib/runtime";
import { settings } from "@/services/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upload" };

export default async function UploadPage() {
  const s = settings(await getRuntime());
  return (
    <>
      <PageHeader
        title="Upload a call"
        description="A recording is transcribed and classified automatically. A transcript skips straight to classification."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Upload" }]}
        actions={
          <Link href="/upload/history" className="arag-btn secondary sm">
            Ingest history
          </Link>
        }
      />
      <div className="arag-content">
        {s.features.uploads ? (
          <UploadFlow maxBytes={s.limits.maxUploadBytes} />
        ) : (
          <ErrorState
            title="Uploads are disabled on this deployment."
            detail="Writing to the Knowledge Box needs an API key or the admin token. Set API_KEYS or ADMIN_TOKEN, or sign in as an operator."
            action={
              <Link href="/admin/login" className="arag-btn secondary sm">
                Sign in as an operator
              </Link>
            }
          />
        )}
        <ApiMeta>
          <code>POST /api/v1/calls</code> and <code>GET /api/v1/jobs/{"{id}"}/events</code>
        </ApiMeta>
      </div>
    </>
  );
}
