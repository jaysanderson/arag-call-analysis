import Link from "next/link";
import { notFound } from "next/navigation";
import { CallWorkspace } from "@/components/calls/CallWorkspace";
import { ErrorState } from "@/components/kit";
import { PageHeader } from "@/components/shell/AppShell";
import { getRuntime } from "@/lib/runtime";
import { canWrite } from "@/lib/session";
import { tryGetCall } from "@/services/calls";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await tryGetCall(await getRuntime(), id);
  return { title: call?.title ?? "Call" };
}

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rt = await getRuntime();
  const call = await tryGetCall(rt, id);
  if (!call) notFound();
  // Per viewer, not per deployment — see lib/session.ts.
  const writable = await canWrite();

  // A call that has arrived but has not been transcribed yet has no transcript to show. Say so,
  // rather than rendering an empty workspace that looks broken.
  if (call.paragraphs.length === 0 && call.lifecycle !== "analysed") {
    return (
      <>
        <PageHeader
          title={call.title}
          breadcrumb={[
            { label: "Home", href: "/" },
            { label: "Calls", href: "/calls" },
            { label: call.slug || id.slice(0, 8) },
          ]}
        />
        <div className="arag-content">
          <ErrorState
            title="This call is still being processed."
            detail="The Knowledge Box has the recording but has not produced a transcript yet. Transcription usually takes under a minute; labelling and analysis follow it."
            action={
              <Link href="/upload/history" className="arag-btn secondary sm">
                Watch the ingest job
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return <CallWorkspace call={call} canWrite={writable} />;
}
