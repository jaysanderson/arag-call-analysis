/**
 * Call export — CSV and JSON renderings of the same call records the table shows.
 *
 * Export is a first-class product action (a reviewer hands the filtered set to a spreadsheet, a
 * case file, or a BI tool), so it reuses `matchingCalls` rather than re-implementing the filters:
 * what you exported is exactly what you were looking at.
 */

import type { CallDetail, CallSummary } from "@/lib/types";

export type ExportFormat = "csv" | "json";

/** One column per thing the data table shows, in the order the table shows it. */
export const EXPORT_COLUMNS: Array<{ key: string; header: string; of: (c: CallSummary) => unknown }> = [
  { key: "id", header: "id", of: (c) => c.id },
  { key: "title", header: "title", of: (c) => c.title },
  { key: "created", header: "created", of: (c) => c.createdISO ?? "" },
  { key: "duration_sec", header: "duration_sec", of: (c) => c.durationSec ?? "" },
  { key: "media_type", header: "media_type", of: (c) => c.mediaType },
  { key: "agent", header: "agent", of: (c) => c.agentName ?? "" },
  { key: "queue", header: "queue", of: (c) => c.queue ?? "" },
  { key: "member_id", header: "member_id", of: (c) => c.memberId ?? "" },
  { key: "call_reason", header: "call_reason", of: (c) => c.metrics?.call_reason ?? "" },
  { key: "outcome", header: "outcome", of: (c) => c.metrics?.outcome ?? "" },
  { key: "sentiment", header: "sentiment", of: (c) => c.metrics?.sentiment ?? "" },
  { key: "line_of_business", header: "line_of_business", of: (c) => c.metrics?.line_of_business ?? "" },
  { key: "complaint", header: "complaint", of: (c) => bool(c.metrics?.complaint) },
  { key: "complaint_category", header: "complaint_category", of: (c) => c.metrics?.complaint_category ?? "" },
  {
    key: "first_call_resolution",
    header: "first_call_resolution",
    of: (c) => bool(c.metrics?.first_call_resolution),
  },
  { key: "escalated", header: "escalated", of: (c) => bool(c.metrics?.escalated) },
  { key: "cross_sell_offered", header: "cross_sell_offered", of: (c) => bool(c.metrics?.cross_sell_offered) },
  {
    key: "cross_sell_accepted",
    header: "cross_sell_accepted",
    of: (c) => bool(c.metrics?.cross_sell_accepted),
  },
  { key: "compliance_score", header: "compliance_score", of: (c) => c.metrics?.compliance_score ?? "" },
  { key: "csat_estimate", header: "csat_estimate", of: (c) => c.metrics?.csat_estimate ?? "" },
  { key: "labels", header: "labels", of: (c) => c.labels.map((l) => `${l.labelset}/${l.label}`).join("|") },
];

function bool(v: boolean | undefined): string {
  return v === undefined ? "" : v ? "true" : "false";
}

/**
 * RFC 4180 quoting. A leading `=`, `+`, `-` or `@` is additionally prefixed with a single quote:
 * without it a transcript line that starts with one of those characters is executed as a formula
 * when the export is opened in a spreadsheet (CSV injection).
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  // `trimStart` first: a spreadsheet ignores leading whitespace when deciding whether a cell is a
  // formula, so " =1+1" is executed exactly as "=1+1" is.
  if (/^[=+\-@\t\r]/.test(s.trimStart())) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(calls: CallSummary[]): string {
  const head = EXPORT_COLUMNS.map((c) => c.header).join(",");
  const rows = calls.map((c) => EXPORT_COLUMNS.map((col) => csvCell(col.of(c))).join(","));
  // A trailing newline keeps `wc -l` and naive line readers honest.
  return `${[head, ...rows].join("\n")}\n`;
}

export function toJson(calls: CallSummary[]): string {
  return `${JSON.stringify({ exportedISO: new Date().toISOString(), count: calls.length, calls }, null, 2)}\n`;
}

/** A single call's full record (transcript, moments and analysis) as portable JSON. */
export function callToJson(call: CallDetail): string {
  return `${JSON.stringify({ exportedISO: new Date().toISOString(), call }, null, 2)}\n`;
}

/** `[mm:ss] Speaker: text` — the transcript as a person would paste it into a case file. */
export function transcriptText(call: CallDetail): string {
  const lines = call.paragraphs.map((p) => {
    const stamp = p.startSeconds === undefined ? "" : `[${clock(p.startSeconds)}] `;
    const who = p.speaker ? `${p.speaker}: ` : "";
    return `${stamp}${who}${p.text.replace(/\s+/g, " ").trim()}`;
  });
  return `${[`${call.title}`, "", ...lines].join("\n")}\n`;
}

/**
 * WebVTT cues from the paragraph timings, so the transcript drops straight into a media player.
 * A paragraph with no end time gets a three-second cue rather than being dropped: a caption that
 * is slightly short is more useful than a missing one.
 */
export function toVtt(call: CallDetail): string {
  const cues = call.paragraphs
    .filter((p) => p.startSeconds !== undefined)
    .map((p, i) => {
      const start = p.startSeconds ?? 0;
      const end = p.endSeconds ?? start + 3;
      const who = p.speaker ? `<v ${p.speaker}>` : "";
      return `${i + 1}\n${vttTime(start)} --> ${vttTime(Math.max(end, start + 0.5))}\n${who}${p.text.replace(/\s+/g, " ").trim()}`;
    });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function vttTime(seconds: number): string {
  // Round to milliseconds FIRST, then split. Splitting first and rounding the seconds field lets a
  // boundary within half a millisecond of a minute emit "00:01:60.000", which a player rejects.
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = (ms % 60_000) / 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

/** `calls-2026-09-12.csv` — dated, so two exports never overwrite each other in a downloads folder. */
export function exportFilename(format: ExportFormat, prefix = "calls"): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.${format}`;
}
