import { notFound } from "next/navigation";
import { getCall } from "@/lib/calls";
import { CallDetailView } from "@/components/CallDetailView";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let call;
  try {
    call = await getCall(id);
  } catch {
    notFound();
  }
  if (!call) notFound();
  return <CallDetailView call={call} />;
}
