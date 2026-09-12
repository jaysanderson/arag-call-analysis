"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { ChatPanel, type Citation } from "@/components/ChatPanel";
import { MediaIcon } from "@/components/icons";
import { Chip } from "@/components/ui";
import { colorFor, fmtDateTime, fmtTime, SENTIMENT_COLOR } from "@/lib/format";
import type { CallDetail, CallParagraph } from "@/lib/types";
import { CallActions } from "./CallActions";
import { LifecycleChip } from "./LifecycleChip";
import { MOMENT_COLOR, MomentsTrack } from "./MomentsTrack";

/**
 * The call workspace: media, moments, transcript and an inspector, all wired to the same clock.
 *
 * The thing that makes this a workspace rather than a page of panels is that every surface seeks
 * the same recording. A citation on an answer, a segment on the moments track and a transcript
 * block are three views of one position in time, and clicking any of them moves the other two.
 */
export function CallWorkspace({
  call,
  readOnly,
  canWrite = true,
}: {
  call: CallDetail;
  readOnly?: boolean;
  /** False when this deployment refuses writes: the destructive actions are not offered at all. */
  canWrite?: boolean;
}) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<"analysis" | "ask" | "details">("analysis");
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
        mediaRef.current.play().catch(() => {
          // Autoplay refusal is expected before a user gesture; the transcript still moved.
        });
      }
    },
    [hasMedia],
  );

  // Map an ask citation (a char range on the content field) to a transcript paragraph.
  const resolveCitation = useCallback(
    (c: Citation) => {
      // Only citations on the transcript field map to paragraphs and timestamps; a citation on the
      // title or another field has char ranges that would collide with the transcript's.
      if (c.field && call.fieldId && !c.field.includes(call.fieldId)) return;
      const p = call.paragraphs.find((p) => c.start < p.charEnd && c.end > p.charStart);
      if (p) seekTo(p.startSeconds, p.index);
    },
    [call.paragraphs, call.fieldId, seekTo],
  );

  const activeIdx = useMemo(() => {
    if (!hasMedia) return focusIdx;
    let active: number | null = null;
    for (const p of call.paragraphs) {
      if (p.startSeconds !== undefined && p.startSeconds <= currentTime + 0.25) active = p.index;
    }
    return active;
  }, [currentTime, call.paragraphs, hasMedia, focusIdx]);

  return (
    <>
      <header className="arag-pagehead" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <nav className="arag-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span className="sep">/</span>
            <Link href="/calls">Calls</Link>
            <span className="sep">/</span>
            <span>{call.slug || call.id.slice(0, 8)}</span>
          </nav>
          <h1>{call.title}</h1>
          <p
            className="sub"
            style={{ display: "flex", flexWrap: "wrap", gap: "0 10px", alignItems: "center" }}
          >
            <span>{fmtDateTime(call.createdISO)}</span>
            {!!call.durationSec && <span>· {fmtTime(call.durationSec)}</span>}
            {/* Name and role together, not two fragments a reader has to connect. */}
            {call.agentName && (
              <span>
                · {call.agentName}
                {call.queue ? ` (${call.queue})` : ""}
              </span>
            )}
            {call.memberId && <span>· {call.memberId}</span>}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              · <MediaIcon type={call.mediaType} size={14} />
              {call.mediaType === "transcript"
                ? "Transcript"
                : call.mediaType === "video"
                  ? "Video"
                  : "Audio"}
            </span>
            <LifecycleChip state={call.lifecycle} />
          </p>
          {call.labels.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {call.labels.map((l) => (
                <Chip
                  key={`${l.labelset}-${l.label}`}
                  label={l.label}
                  className={l.labelset === "sentiment" ? SENTIMENT_COLOR[l.label] : colorFor(l.labelset)}
                  href={
                    readOnly ? undefined : `/calls?label=${encodeURIComponent(`${l.labelset}/${l.label}`)}`
                  }
                />
              ))}
            </div>
          )}
        </div>
        {!readOnly && (
          <div className="actions">
            <button
              type="button"
              className="arag-btn sm"
              onClick={() => {
                setTab("ask");
                document.getElementById("call-inspector")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Ask
            </button>
            <CallActions callId={call.id} title={call.title} canWrite={canWrite} />
          </div>
        )}
      </header>

      <div className="arag-pagebody">
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 560px", minWidth: 0, display: "grid", gap: 16 }}>
            {hasMedia && (
              <section className="arag-card" style={{ overflow: "hidden" }}>
                {call.mediaType === "video" ? (
                  <video
                    ref={mediaRef as React.RefObject<HTMLVideoElement>}
                    src={mediaSrc(call)}
                    controls
                    style={{ width: "100%", background: "#000", aspectRatio: "16/9", display: "block" }}
                    onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                  >
                    <track kind="captions" src={captionsSrc(call)} srcLang="en" label="Transcript" default />
                  </video>
                ) : (
                  <div style={{ padding: 14 }}>
                    <audio
                      ref={mediaRef as React.RefObject<HTMLVideoElement>}
                      src={mediaSrc(call)}
                      controls
                      style={{ width: "100%" }}
                      onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                    />
                  </div>
                )}
                <div style={{ padding: "0 14px 14px" }}>
                  <MomentsTrack paragraphs={call.paragraphs} activeIdx={activeIdx} onSeek={seekTo} />
                </div>
              </section>
            )}

            {!hasMedia && call.paragraphs.length > 0 && (
              <section className="arag-card" style={{ padding: 14 }}>
                <div className="arag-label" style={{ marginBottom: 8 }}>
                  Call moments
                </div>
                <MomentsTrack paragraphs={call.paragraphs} activeIdx={activeIdx} onSeek={seekTo} />
              </section>
            )}

            <Transcript
              paragraphs={call.paragraphs}
              activeIdx={activeIdx}
              focusIdx={focusIdx}
              hasMedia={hasMedia}
              onSeek={seekTo}
              registerRef={(i, el) => {
                paraRefs.current[i] = el;
              }}
            />
          </div>

          <aside
            id="call-inspector"
            className="arag-inspector"
            style={{ flex: "1 1 340px", maxWidth: 440 }}
            aria-label="Call inspector"
          >
            <div className="arag-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "analysis"}
                onClick={() => setTab("analysis")}
              >
                Analysis
              </button>
              {!readOnly && (
                <button type="button" role="tab" aria-selected={tab === "ask"} onClick={() => setTab("ask")}>
                  Ask
                </button>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={tab === "details"}
                onClick={() => setTab("details")}
              >
                Details
              </button>
            </div>
            <div style={{ padding: 14, overflowY: "auto" }}>
              {tab === "analysis" && <AnalysisPanel analysis={call.analysis} metrics={call.metrics} bare />}
              {tab === "ask" && !readOnly && <ChatPanel callId={call.id} onCitation={resolveCitation} bare />}
              {tab === "details" && <Details call={call} />}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

/** The media proxy keeps the service-account token server-side; `Range` is forwarded so scrubbing works. */
function mediaSrc(call: CallDetail) {
  return `/api/v1/calls/${call.id}/media?field=${encodeURIComponent(call.fieldId)}`;
}

function captionsSrc(call: CallDetail) {
  return `/api/v1/calls/${call.id}/export?format=vtt`;
}

function Details({ call }: { call: CallDetail }) {
  const rows: Array<[string, React.ReactNode]> = [
    [
      "Call id",
      <code key="id" className="mono">
        {call.id}
      </code>,
    ],
    ["Slug", call.slug || "—"],
    ["Field", `${call.fieldType}/${call.fieldId}`],
    ["Created", fmtDateTime(call.createdISO)],
    ["Duration", call.durationSec ? fmtTime(call.durationSec) : "—"],
    ["Media type", call.mediaType],
    ["Knowledge Box status", call.status ?? "—"],
    ["Transcript blocks", String(call.paragraphs.length)],
    ["Labels", String(call.labels.length)],
  ];
  const metricRows = Object.entries(call.metrics ?? {});
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <dl className="arag-kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {metricRows.length > 0 && (
        <div>
          <div className="arag-label">Metrics written by the call-insights agent</div>
          <dl className="arag-kv" style={{ marginTop: 8 }}>
            {metricRows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v === null || v === undefined ? "—" : String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <details>
        <summary className="small" style={{ cursor: "pointer" }}>
          View the API response
        </summary>
        <pre className="arag-json" style={{ marginTop: 8, maxHeight: 320 }}>
          {JSON.stringify(call, null, 2)}
        </pre>
      </details>
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

  const allMoments = useMemo(() => {
    const seen: string[] = [];
    for (const p of paragraphs) for (const m of p.moments) if (!seen.includes(m)) seen.push(m);
    return seen;
  }, [paragraphs]);

  const toggleMoment = (m: string) =>
    setActiveMoments((s) => {
      const n = new Set(s);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });

  const filtered = paragraphs.filter((p) => {
    const matchesText = !q.trim() || p.text.toLowerCase().includes(q.toLowerCase());
    const matchesMoment = activeMoments.size === 0 || p.moments.some((m) => activeMoments.has(m));
    return matchesText && matchesMoment;
  });

  return (
    <section className="arag-card" data-testid="transcript">
      <div className="head" style={{ display: "block" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2>Transcript</h2>
          <span className="small" style={{ color: "var(--arag-text-subtle)" }}>
            {filtered.length === paragraphs.length
              ? `${paragraphs.length} blocks`
              : `${filtered.length} of ${paragraphs.length} blocks`}
          </span>
          <div className="arag-search" style={{ marginLeft: "auto", maxWidth: 220, flex: "0 1 220px" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search transcript"
              aria-label="Search transcript"
              style={{ paddingLeft: 10 }}
            />
          </div>
        </div>
        {allMoments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", marginTop: 8 }}>
            <span className="arag-label" style={{ marginRight: 2 }}>
              Moments
            </span>
            {allMoments.map((m) => {
              const on = activeMoments.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMoment(m)}
                  aria-pressed={on}
                  className="arag-filterchip"
                  style={
                    MOMENT_COLOR[m]
                      ? {
                          borderColor: MOMENT_COLOR[m],
                          background: on ? MOMENT_COLOR[m] : "transparent",
                          color: on ? "#fff" : "var(--arag-text-muted)",
                          paddingRight: 9,
                          cursor: "pointer",
                        }
                      : { paddingRight: 9, cursor: "pointer" }
                  }
                >
                  {m}
                </button>
              );
            })}
            {activeMoments.size > 0 && (
              <button type="button" className="arag-btn ghost sm" onClick={() => setActiveMoments(new Set())}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="scroll-thin" style={{ maxHeight: 620, overflowY: "auto" }}>
        {filtered.map((p) => {
          const isActive = p.index === activeIdx;
          const isFocus = p.index === focusIdx;
          const turns = splitTurns(p.text, p.speaker);
          return (
            <div
              key={p.index}
              ref={(el) => registerRef(p.index, el)}
              onClick={() => onSeek(p.startSeconds, p.index)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSeek(p.startSeconds, p.index);
                }
              }}
              // biome-ignore lint/a11y/useSemanticElements: the block contains its own moment-filter buttons, and a button may not nest interactive content
              role="button"
              tabIndex={0}
              className={isFocus ? "flash" : undefined}
              style={{
                padding: "12px 16px",
                borderTop: "1px solid var(--arag-brand-50)",
                background: isActive ? "var(--arag-brand-50)" : undefined,
                cursor: hasMedia ? "pointer" : "default",
              }}
            >
              {(p.startSeconds !== undefined || p.moments.length > 0) && (
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 6 }}
                >
                  {p.startSeconds !== undefined && (
                    <span
                      className="mono"
                      style={{
                        fontSize: 11.5,
                        color: isActive ? "var(--arag-brand-600)" : "var(--arag-text-subtle)",
                      }}
                    >
                      {fmtTime(p.startSeconds)}
                    </span>
                  )}
                  {p.moments.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMoment(m);
                      }}
                      title="Filter the transcript by this moment"
                      style={{ border: 0, background: "none", padding: 0, cursor: "pointer" }}
                    >
                      <Chip label={m} className={colorFor(m)} />
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: "grid", gap: 4 }}>
                {turns.map((t, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 14, lineHeight: 1.55, maxWidth: "72ch" }}>
                    {t.speaker && (
                      <span
                        style={{
                          marginRight: 6,
                          fontSize: 12,
                          fontWeight: 650,
                          color: t.speaker === "Agent" ? "var(--arag-brand-600)" : "var(--arag-accent-fg)",
                        }}
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
          <div style={{ padding: 32, textAlign: "center", color: "var(--arag-text-subtle)", fontSize: 13 }}>
            No transcript blocks match that search or moment filter.
          </div>
        )}
      </div>
    </section>
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
