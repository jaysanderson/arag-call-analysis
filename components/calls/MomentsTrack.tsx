"use client";

import type { CallParagraph } from "@/lib/types";

/**
 * The moments track: one segment per transcript paragraph, laid out against the recording's
 * timeline and coloured by the moment the paragraph-level labeler assigned.
 *
 * This is the "a transcript broken into moments" promise made literal — the shape of the call at a
 * glance, and a click-to-seek control over it. The colours are deliberate hex literals, shared
 * with the card thumbnail and the transcript chips, so one colour means one thing in all three
 * places; a CSS custom property that failed to resolve would render a segment transparent and
 * silently lose a moment.
 */
export const MOMENT_COLOR: Record<string, string> = {
  Complaint: "#e2536b",
  Escalation: "#e0ab00",
  "Cross-sell Pitch": "#9333ea",
  Resolution: "#00b563",
  "Empathy Statement": "#0891b2",
  Objection: "#ea580c",
  "Greeting & Verification": "#64748b",
  "Problem Statement": "#2563eb",
  "Compliance Disclosure": "#0f766e",
  "Next Steps": "#475569",
  "Sensitive / PII": "#7c3aed",
};

export function momentColor(moment?: string): string | undefined {
  return moment ? MOMENT_COLOR[moment] : undefined;
}

function clock(seconds?: number): string {
  if (seconds === undefined) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MomentsTrack({
  paragraphs,
  activeIdx,
  onSeek,
}: {
  paragraphs: CallParagraph[];
  activeIdx: number | null;
  onSeek: (seconds: number | undefined, index: number) => void;
}) {
  if (paragraphs.length === 0) return null;

  // Segment width follows the paragraph's real duration where the transcription supplied one, so
  // the track is a timeline rather than a bar chart of paragraph counts. Where it did not, every
  // remaining segment shares the slack equally.
  const total = paragraphs.reduce((max, p) => Math.max(max, p.endSeconds ?? p.startSeconds ?? 0), 0);
  const legend = [...new Set(paragraphs.flatMap((p) => p.moments))].filter((m) => MOMENT_COLOR[m]);

  return (
    <div>
      <fieldset className="arag-moments" data-testid="moments-track" aria-label="Call moments">
        {paragraphs.map((p) => {
          const moment = p.moments.find((m) => MOMENT_COLOR[m]);
          const colour = momentColor(moment);
          const span =
            total > 0 && p.startSeconds !== undefined && p.endSeconds !== undefined
              ? Math.max(0.4, ((p.endSeconds - p.startSeconds) / total) * paragraphs.length)
              : 1;
          return (
            <button
              key={p.index}
              type="button"
              data-moment={colour ? 1 : 0}
              aria-current={p.index === activeIdx}
              aria-label={`${moment ?? "Transcript"} at ${clock(p.startSeconds)}`}
              title={`${moment ? `${moment} · ` : ""}${clock(p.startSeconds)}`}
              style={{ background: colour ?? "var(--arag-border)", flexGrow: span }}
              onClick={() => onSeek(p.startSeconds, p.index)}
            />
          );
        })}
      </fieldset>
      {legend.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 12px",
            marginTop: 6,
            fontSize: 11,
            color: "var(--arag-text-muted)",
          }}
        >
          {legend.map((m) => (
            <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: MOMENT_COLOR[m],
                  display: "inline-block",
                }}
              />
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
