import { CallsExplorer } from "@/components/CallsExplorer";

export const dynamic = "force-dynamic";

export default function CallsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Calls</h1>
        <p className="text-sm text-slate-500">Browse, search, and filter analyzed calls.</p>
      </div>
      <CallsExplorer />
    </div>
  );
}
