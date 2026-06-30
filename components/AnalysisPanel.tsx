"use client";

import type { CallAnalysis, CallMetrics } from "@/lib/types";
import { Card, Chip } from "./ui";
import { colorFor } from "@/lib/format";

function Score({ label, value }: { label: string; value?: number }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = v >= 75 ? "bg-emerald-500" : v >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-700">{value ?? "—"}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function AnalysisPanel({ analysis, metrics }: { analysis?: CallAnalysis; metrics?: CallMetrics }) {
  if (!analysis && !metrics) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-slate-700">AI Analysis</h2>
        <p className="mt-2 text-sm text-slate-400">Analysis is still being generated for this call.</p>
      </Card>
    );
  }
  const a = analysis ?? {};
  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">AI Analysis</h2>

      {a.executive_summary && <p className="text-sm leading-relaxed text-slate-700">{a.executive_summary}</p>}

      {a.key_topics && a.key_topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.key_topics.map((t) => (
            <Chip key={t} label={t} className={colorFor(t)} />
          ))}
        </div>
      )}

      {a.agent_scorecard && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Agent scorecard</div>
          <Score label="Empathy" value={a.agent_scorecard.empathy} />
          <Score label="Compliance" value={a.agent_scorecard.compliance} />
          <Score label="Resolution" value={a.agent_scorecard.resolution_effectiveness} />
        </div>
      )}

      {a.complaint?.present && (
        <div className="rounded-lg border border-rose-100 bg-rose-50 p-3">
          <div className="text-xs font-semibold text-rose-700">
            Complaint{a.complaint.severity ? ` · ${a.complaint.severity}` : ""}
            {a.complaint.category ? ` · ${a.complaint.category}` : ""}
          </div>
          {a.complaint.quote && <p className="mt-1 text-sm italic text-rose-800">“{a.complaint.quote}”</p>}
        </div>
      )}

      {a.cross_sell?.offered && (
        <div className={`rounded-lg border p-3 ${a.cross_sell.accepted ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
          <div className={`text-xs font-semibold ${a.cross_sell.accepted ? "text-emerald-700" : "text-amber-700"}`}>
            Cross-sell {a.cross_sell.accepted ? "accepted" : "offered (not accepted)"}
            {a.cross_sell.product ? ` · ${a.cross_sell.product}` : ""}
          </div>
          {a.cross_sell.objection && <p className="mt-1 text-sm text-amber-800">Objection: {a.cross_sell.objection}</p>}
        </div>
      )}

      {a.action_items && a.action_items.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Action items</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {a.action_items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
        </div>
      )}

      {a.risk_flags && a.risk_flags.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Risk flags</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {a.risk_flags.map((r) => <Chip key={r} label={r} className="bg-rose-100 text-rose-800" />)}
          </div>
        </div>
      )}

      {a.notable_quotes && a.notable_quotes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notable quotes</div>
          {a.notable_quotes.slice(0, 4).map((q, i) => (
            <blockquote key={i} className="border-l-2 border-slate-200 pl-2 text-sm text-slate-600">
              <span className="font-medium text-slate-500">{q.speaker}:</span> “{q.quote}”
            </blockquote>
          ))}
        </div>
      )}
    </Card>
  );
}
