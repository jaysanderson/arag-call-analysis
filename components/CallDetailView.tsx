"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CallDetail, CallParagraph } from "@/lib/types";
import { Chip, Card } from "./ui";
import { fmtTime, fmtDateTime, colorFor, SENTIMENT_COLOR } from "@/lib/format";
import { AnalysisPanel } from "./AnalysisPanel";
import { ChatPanel, type Citation } from "./ChatPanel";

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
            <a href="/calls" className="hover:underline">Calls</a> / {call.slug}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{call.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>{fmtDateTime(call.createdISO)}</span>
            {call.durationSec && <span>· {fmtTime(call.durationSec)}</span>}
            {call.agentName && <span>· Agent: {call.agentName}</span>}
            {call.queue && <span>· {call.queue}</span>}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase">{call.mediaType}</span>
          </div>
        </div>
        {sentiment && <Chip label={sentiment} className={SENTIMENT_COLOR[sentiment]} />}
      </div>

      {/* Resource labels */}
      {call.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {call.labels.map((l) => (
            <Chip key={`${l.labelset}-${l.label}`} label={l.label} className={colorFor(l.labelset)} />
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
                  ref={mediaRef as any}
                  src={`/api/calls/${call.id}/media?field=${call.fieldId}`}
                  controls
                  className="w-full bg-black aspect-video"
                  onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                />
              ) : (
                <div className="p-4">
                  <audio
                    ref={mediaRef as any}
                    src={`/api/calls/${call.id}/media?field=${call.fieldId}`}
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
  const filtered = q.trim()
    ? paragraphs.filter((p) => p.text.toLowerCase().includes(q.toLowerCase()))
    : paragraphs;

  return (
    <Card className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 p-3">
        <h2 className="text-sm font-semibold text-slate-700">Transcript</h2>
        <span className="text-xs text-slate-400">{paragraphs.length} segments</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search transcript…"
          className="ml-auto w-44 rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div className="scroll-thin max-h-[560px] overflow-y-auto divide-y divide-slate-50">
        {filtered.map((p) => {
          const isActive = p.index === activeIdx;
          const isFocus = p.index === focusIdx;
          return (
            <div
              key={p.index}
              ref={(el) => registerRef(p.index, el)}
              onClick={() => onSeek(p.startSeconds, p.index)}
              className={`group p-3 transition-colors ${hasMedia ? "cursor-pointer" : ""} ${
                isActive ? "bg-brand-50" : "hover:bg-slate-50"
              } ${isFocus ? "flash" : ""}`}
            >
              <div className="flex items-center gap-2">
                {p.startSeconds !== undefined && (
                  <span className={`font-mono text-xs ${isActive ? "text-brand-600" : "text-slate-400"}`}>
                    {fmtTime(p.startSeconds)}
                  </span>
                )}
                {p.speaker && (
                  <span className={`text-xs font-semibold ${p.speaker === "Agent" ? "text-brand-600" : "text-emerald-600"}`}>
                    {p.speaker}
                  </span>
                )}
                {p.moments.map((m) => (
                  <Chip key={m} label={m} className={colorFor(m)} />
                ))}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{p.text}</p>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">No segments match “{q}”.</div>
        )}
      </div>
    </Card>
  );
}
