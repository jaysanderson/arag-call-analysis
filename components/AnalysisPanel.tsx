"use client";

import { colorFor } from "@/lib/format";
import type { CallAnalysis, CallMetrics } from "@/lib/types";
import { Markdown } from "./Markdown";
import { Card, Chip } from "./ui";

function Score({ label, value }: { label: string; value?: number }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = v >= 75 ? "bg-accent-500" : v >= 50 ? "bg-warn-fg" : "bg-danger-fg";
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-ink-950">{value ?? "n/a"}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-brand-50">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

/**
 * The written analysis the `call-insights` agent produced.
 *
 * `bare` drops the card frame so the panel can sit inside the workspace inspector, which already
 * supplies one — a card inside a card is the visual noise this product is trying to remove.
 */
export function AnalysisPanel({
  analysis,
  metrics,
  bare,
}: {
  analysis?: CallAnalysis;
  metrics?: CallMetrics;
  bare?: boolean;
}) {
  const Frame = bare
    ? ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
      )
    : Card;

  if (!analysis && !metrics) {
    return (
      <Frame className={bare ? "" : "p-4"}>
        <h2 className="text-sm font-semibold text-ink-950">Analysis</h2>
        <p className="mt-2 text-sm text-slate-500">
          The call-insights agent has not written an analysis for this call yet. Labels and metrics arrive
          first; the narrative follows.
        </p>
      </Frame>
    );
  }
  const a = analysis ?? {};
  return (
    <Frame className={bare ? "space-y-4" : "p-4 space-y-4"}>
      {!bare && <h2 className="text-sm font-semibold text-ink-950">Analysis</h2>}

      {a.executive_summary && <Markdown text={a.executive_summary} className="text-sm text-slate-700" />}

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
        <div className="rounded-lg border border-danger-dark/30 bg-danger-bg p-3">
          <div className="text-xs font-semibold text-danger-fg">
            Complaint{a.complaint.severity ? ` · ${a.complaint.severity}` : ""}
            {a.complaint.category ? ` · ${a.complaint.category}` : ""}
          </div>
          {a.complaint.quote && <p className="mt-1 text-sm italic text-danger-fg">“{a.complaint.quote}”</p>}
        </div>
      )}

      {a.cross_sell?.offered && (
        <div
          className={`rounded-lg border p-3 ${a.cross_sell.accepted ? "border-accent-500/30 bg-accent-fill-soft" : "border-warn-fg/20 bg-warn-bg"}`}
        >
          <div
            className={`text-xs font-semibold ${a.cross_sell.accepted ? "text-accent-fg-light" : "text-warn-fg"}`}
          >
            Cross-sell {a.cross_sell.accepted ? "accepted" : "offered (not accepted)"}
            {a.cross_sell.product ? ` · ${a.cross_sell.product}` : ""}
          </div>
          {a.cross_sell.objection && (
            <p className="mt-1 text-sm text-warn-fg">Objection: {a.cross_sell.objection}</p>
          )}
        </div>
      )}

      {a.action_items && a.action_items.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Action items</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {a.action_items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      )}

      {a.risk_flags && a.risk_flags.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Risk flags</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {a.risk_flags.map((r) => (
              <Chip key={r} label={r} className="bg-danger-bg text-danger-fg" />
            ))}
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
    </Frame>
  );
}
