import Link from "next/link";
import type { CallSummary } from "@/lib/types";
import { Card, Chip, MediaBadge, CallThumb } from "./ui";
import { fmtDate, fmtTime, colorFor, SENTIMENT_COLOR } from "@/lib/format";

/**
 * The one consistent card system used everywhere a call is listed (rails,
 * the full catalogue list, the dashboard's recent-calls feed) — same frame,
 * padding, radius and metadata density throughout (ui-polish-standard §A).
 */
export function CallCard({ call, compact }: { call: CallSummary; compact?: boolean }) {
  return (
    <Link href={`/calls/${call.id}`} className="block h-full">
      <Card className={`h-full overflow-hidden transition hover:border-brand-400 hover:shadow-md ${compact ? "" : ""}`}>
        <CallThumb type={call.mediaType} className="h-24 w-full" />
        <div className="space-y-2 p-3">
          <div className="flex items-center gap-1.5">
            <MediaBadge type={call.mediaType} />
            {call.durationSec && <span className="text-[11px] text-slate-400">{fmtTime(call.durationSec)}</span>}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink-950">{call.title}</h3>
          <div className="flex flex-wrap gap-1">
            {call.metrics?.sentiment && <Chip label={call.metrics.sentiment} className={SENTIMENT_COLOR[call.metrics.sentiment]} />}
            {call.metrics?.call_reason && <Chip label={call.metrics.call_reason} className={colorFor(call.metrics.call_reason)} />}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>{fmtDate(call.createdISO)}</span>
            {call.agentName && <span className="truncate">{call.agentName}</span>}
          </div>
        </div>
      </Card>
    </Link>
  );
}
