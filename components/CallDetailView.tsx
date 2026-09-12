"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { colorFor, fmtDateTime, fmtTime, SENTIMENT_COLOR } from "@/lib/format";
import type { CallDetail, CallParagraph } from "@/lib/types";
import { AnalysisPanel } from "./AnalysisPanel";
import { ChatPanel, type Citation } from "./ChatPanel";
import { Card, Chip, MediaBadge } from "./ui";

export function CallDetailView({ call }: { call: CallDetail }) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const paraRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const hasMedia = call.mediaType !== "transcript";

  const seekTo = useCallback(
    (seconds?: number, idx?: number) => {
      if (typeof idx === "number") {
        setFocusIdx(idx);
        paraRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (hasMedia && typeof seconds === "number" && mediaRef.current) {
        mediaRef.current.currentTime = seconds;
        mediaRef.current.play().catch(() => {});
      }
    },
    [hasMedia],
  );

  // Map an ask citation (char range on the content field) to a paragraph.
  const resolveCitation = useCallback(
    (c: Citation) => {
      // Only citations on the transcript field map to paragraphs/timestamps;
      // ignore title/other-field citations (their char ranges would collide).
      if (c.field && call.fieldId && !c.field.includes(call.fieldId)) return;
      const p = call.paragraphs.find((p) => c.start < p.charEnd && c.end > p.charStart);
      if (p) seekTo(p.startSeconds, p.index);
    },
    [call.paragraphs, call.fieldId, seekTo],
  );

  const activeIdx = useMemo(() => {
    if (!hasMedia) return null;
    let active: number | null = null;
    for (const p of call.paragraphs) {
      if (p.startSeconds !== undefined && p.startSeconds <= currentTime + 0.25) active = p.index;
    }
    return active;
  }, [currentTime, call.paragraphs, hasMedia]);

  const sentiment = call.metrics?.sentiment;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">
            <a href="/calls" className="hover:underline">
              Calls
            </a>{" "}
            / {call.slug}
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-950">{call.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>{fmtDateTime(call.createdISO)}</span>
            {!!call.durationSec && <span>· {fmtTime(call.durationSec)}</span>}
            {/* Name AND role together, not two separate fragments a reader has to connect (standard B14). */}
            {call.agentName ? (
              <span>
                · Agent: {call.agentName}
                {call.queue ? ` (${call.queue})` : ""}
              </span>
            ) : (
              call.queue && <span>· {call.queue}</span>
            )}
            <MediaBadge type={call.mediaType} />
          </div>
        </div>
        {sentiment && <Chip label={sentiment} className={SENTIMENT_COLOR[sentiment]} />}
      </div>

      {/* Resource labels — each drills into the filtered call list */}
      {call.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {call.labels.map((l) => (
            <Chip
              key={`${l.labelset}-${l.label}`}
              label={l.label}
              className={colorFor(l.labelset)}
              href={`/calls?label=${encodeURIComponent(`${l.labelset}/${l.label}`)}`}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: media + transcript */}
        <div className="lg:col-span-3 space-y-4">
          {hasMedia && (
            <Card className="overflow-hidden">
              {call.mediaType === "video" ? (
                <video
                  ref={mediaRef as React.RefObject<HTMLVideoElement>}
                  src={`/api/v1/calls/${call.id}/media?field=${encodeURIComponent(call.fieldId)}`}
                  controls
                  className="w-full bg-black aspect-video"
                  onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                />
              ) : (
                <div className="p-4">
                  <audio
                    ref={mediaRef as React.RefObject<HTMLVideoElement>}
                    src={`/api/v1/calls/${call.id}/media?field=${encodeURIComponent(call.fieldId)}`}
                    controls
                    className="w-full"
                    onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                  />
                </div>
              )}
            </Card>
          )}

          <Transcript
            paragraphs={call.paragraphs}
            activeIdx={activeIdx}
            focusIdx={focusIdx}
            hasMedia={hasMedia}
            onSeek={seekTo}
            registerRef={(i, el) => (paraRefs.current[i] = el)}
          />
        </div>

        {/* Right: analysis + chat */}
        <div className="lg:col-span-2 space-y-4">
          <ChatPanel callId={call.id} onCitation={resolveCitation} />
          <AnalysisPanel analysis={call.analysis} metrics={call.metrics} />
        </div>
      </div>
    </div>
  );
}

function Transcript({
  paragraphs,
  activeIdx,
  focusIdx,
  hasMedia,
  onSeek,
  registerRef,
}: {
  paragraphs: CallParagraph[];
  activeIdx: number | null;
  focusIdx: number | null;
  hasMedia: boolean;
  onSeek: (seconds?: number, idx?: number) => void;
  registerRef: (i: number, el: HTMLDivElement | null) => void;
}) {
  const [q, setQ] = useState("");
  const [activeMoments, setActiveMoments] = useState<Set<string>>(new Set());

  // Every distinct text-block (paragraph) label present in this call.
  const allMoments = useMemo(() => {
    const seen: string[] = [];
    for (const p of paragraphs) for (const m of p.moments) if (!seen.includes(m)) seen.push(m);
    return seen;
  }, [paragraphs]);

  const toggleMoment = (m: string) =>
    setActiveMoments((s) => {
      const n = new Set(s);
      n.has(m) ? n.delete(m) : n.add(m);
      return n;
    });

  const filtered = paragraphs.filter((p) => {
    const matchesText = !q.trim() || p.text.toLowerCase().includes(q.toLowerCase());
    const matchesMoment = activeMoments.size === 0 || p.moments.some((m) => activeMoments.has(m));
    return matchesText && matchesMoment;
  });

  return (
    <Card className="flex flex-col">
      <div className="border-b border-brand-100 p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink-950">Transcript</h2>
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
            {filtered.length === paragraphs.length
              ? `${paragraphs.length} segments`
              : `${filtered.length} of ${paragraphs.length}`}
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search transcript…"
            className="ml-auto w-44 rounded-md border border-brand-200 px-2 py-1 text-sm text-ink-950 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        {allMoments.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Filter by moment:
            </span>
            {allMoments.map((m) => {
              const on = activeMoments.has(m);
              return (
                <button
                  type="button"
                  key={m}
                  onClick={() => toggleMoment(m)}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${colorFor(m)} ${
                    on ? "ring-2 ring-brand-500 ring-offset-1" : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {m}
                </button>
              );
            })}
            {activeMoments.size > 0 && (
              <button
                type="button"
                onClick={() => setActiveMoments(new Set())}
                className="ml-1 text-xs text-brand-600 hover:underline"
              >
                clear
              </button>
            )}
          </div>
        )}
      </div>
      <div className="scroll-thin max-h-[560px] overflow-y-auto divide-y divide-brand-50">
        {filtered.map((p) => {
          const isActive = p.index === activeIdx;
          const isFocus = p.index === focusIdx;
          const turns = splitTurns(p.text, p.speaker);
          return (
            <div
              key={p.index}
              ref={(el) => registerRef(p.index, el)}
              onClick={() => onSeek(p.startSeconds, p.index)}
              className={`group p-3 transition-colors ${hasMedia ? "cursor-pointer" : ""} ${
                isActive ? "bg-brand-50" : "hover:bg-brand-50/60"
              } ${isFocus ? "flash" : ""}`}
            >
              {(p.startSeconds !== undefined || p.moments.length > 0) && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {p.startSeconds !== undefined && (
                    <span className={`font-mono text-xs ${isActive ? "text-brand-600" : "text-slate-400"}`}>
                      {fmtTime(p.startSeconds)}
                    </span>
                  )}
                  {/* In-line block labels double as filter toggles. */}
                  {p.moments.map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMoment(m);
                      }}
                      title="Filter transcript by this label"
                    >
                      <Chip
                        label={m}
                        className={`${colorFor(m)} ${activeMoments.has(m) ? "ring-2 ring-brand-500 ring-offset-1" : ""}`}
                      />
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {turns.map((t, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-700">
                    {t.speaker && (
                      <span
                        className={`mr-1.5 text-xs font-semibold ${t.speaker === "Agent" ? "text-brand-600" : "text-emerald-600"}`}
                      >
                        {t.speaker}:
                      </span>
                    )}
                    {t.text}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">No segments match your filters.</div>
        )}
      </div>
    </Card>
  );
}

/** Split a transcript block back into individual speaker turns for display. */
function splitTurns(text: string, firstSpeaker?: "Agent" | "Member"): { speaker?: string; text: string }[] {
  const re = /(Agent|Member):\s*/g;
  const turns: { speaker?: string; text: string }[] = [];
  let last = 0;
  let speaker: string | undefined = firstSpeaker;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const chunk = text.slice(last, m.index).trim();
    if (chunk) turns.push({ speaker, text: chunk });
    speaker = m[1];
    last = re.lastIndex;
  }
  const tail = text.slice(last).trim();
  if (tail) turns.push({ speaker, text: tail });
  return turns.length ? turns : [{ speaker: firstSpeaker, text }];
}
