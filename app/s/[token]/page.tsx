import { notFound } from "next/navigation";
import { CallWorkspace } from "@/components/calls/CallWorkspace";
import { getRuntime } from "@/lib/runtime";
import { tryGetCall } from "@/services/calls";
import { resolveShare } from "@/services/shares";

export const dynamic = "force-dynamic";

/**
 * A shared call: the same workspace, read-only.
 *
 * An unknown, revoked or expired token is a plain 404 — the three are indistinguishable to a
 * visitor by design, so a dead link cannot confirm that a call ever existed.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rt = await getRuntime();
  const share = resolveShare(rt, token);
  return { title: share ? share.callTitle : "Shared call" };
}

export default async function SharedCallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rt = await getRuntime();
  const share = resolveShare(rt, token);
  if (!share) notFound();
  const call = await tryGetCall(rt, share.callId);
  if (!call) notFound();

  return (
    <>
      <div className="arag-alert" style={{ margin: "16px 24px 0" }}>
        <div>
          You are viewing a shared, read-only copy of this call. The link expires on{" "}
          {new Date(share.expiresISO).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
          .
        </div>
      </div>
      <CallWorkspace call={call} readOnly />
    </>
  );
}
