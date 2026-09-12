import { notFound } from "next/navigation";
import { getRuntime } from "@/lib/runtime";
import { tryGetCall } from "@/services/calls";
import { CallDetailView } from "@/components/CallDetailView";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await tryGetCall(await getRuntime(), id);
  if (!call) notFound();
  return <CallDetailView call={call} />;
}
