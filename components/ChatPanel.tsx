"use client";

import { useRef, useState } from "react";
import {
  deriveConfidence,
  deriveConfidenceFromRemi,
  isDeclinedAnswer,
  type RemiQuality,
} from "@/lib/confidence";
import { Markdown } from "./Markdown";
import { Card, ConfidenceBadge } from "./ui";

/** One NDJSON line from POST /api/v1/calls/{id}/ask (the platform's `{item:{…}}` envelope). */
type StreamItem = {
  type?: string;
  text?: string;
  citations?: Record<string, [number, number][]>;
  answerRelevance?: number | null;
  groundedness?: number | null;
  contextRelevance?: number | null;
};

export type Citation = {
  key: string;
  field?: string;
  start: number;
  end: number;
  n: number;
  answerRanges: [number, number][];
};

function parseCitationKey(key: string, answerRanges: [number, number][], n: number): Citation {
  // format: <rid>/<f|a|t|u>/<fieldName>/<start>-<end>
  const parts = key.split("/");
  const range = parts[parts.length - 1] ?? "";
  const [rawStart, rawEnd] = range.split("-").map((x) => Number.parseInt(x, 10));
  const field = parts.length >= 4 ? `${parts[1]}/${parts[2]}` : undefined;
  return {
    key,
    field,
    start: Number.isFinite(rawStart) ? (rawStart as number) : 0,
    end: Number.isFinite(rawEnd) ? (rawEnd as number) : 0,
    n,
    answerRanges,
  };
}

type Msg = {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  error?: boolean;
  quality?: RemiQuality;
};

export function ChatPanel({
  callId,
  onCitation,
  bare,
}: {
  callId: string;
  onCitation: (c: Citation) => void;
  /** Drop the card frame when the panel sits inside a container that already has one. */
  bare?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    setMessages((m) => [...m, { role: "user", text: question }, { role: "assistant", text: "" }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/calls/${callId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let answer = "";
      let citations: Citation[] = [];
      let quality: RemiQuality | undefined;
      const flush = () =>
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", text: answer, citations, quality };
          return copy;
        });
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          let obj: { item?: StreamItem } & StreamItem;
          try {
            obj = JSON.parse(t);
          } catch {
            continue;
          }
          const item = obj.item ?? obj;
          if (item.type === "answer") {
            answer += item.text ?? "";
            flush();
          } else if (item.type === "citations") {
            const cmap: Record<string, [number, number][]> = item.citations ?? {};
            // Number citations in reading order (earliest answer-range offset first)
            // so inline [1][2][3] markers appear left-to-right through the prose.
            const withRanges = Object.entries(cmap)
              .filter(([key]) => key.includes("/")) // drop title/other-field citations
              .map(([key, ranges]) => ({
                key,
                ranges: ranges ?? [],
                first: Math.min(...(ranges ?? [[Infinity, Infinity]]).map((r) => r[0])),
              }))
              .sort((a, b) => a.first - b.first);
            citations = withRanges.map((c, i) => parseCitationKey(c.key, c.ranges, i + 1));
            flush();
          } else if (item.type === "quality") {
            // Server-appended after the stream finishes (see the ask route) -
            // a genuine REMi read replacing the citation-coverage floor the
            // moment it resolves. Silently absent on a scoring timeout.
            quality = {
              answerRelevance: item.answerRelevance ?? null,
              groundedness: item.groundedness ?? null,
              contextRelevance: item.contextRelevance ?? null,
            };
            flush();
          }
        }
      }
      flush();
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          text: `Sorry, something went wrong answering that. Try again in a moment.`,
          error: true,
        };
        return copy;
      });
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }), 50);
    }
  }

  const suggestions = ["Summarize this call", "Was the member satisfied?", "What did the agent offer?"];

  const Frame = bare
    ? ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
      )
    : Card;

  return (
    <Frame className="flex flex-col">
      <div className={bare ? "pb-3" : "border-b border-brand-100 p-3"}>
        <h2 className="text-sm font-semibold text-ink-950">Ask this call</h2>
        <p className="text-xs text-slate-500">Answers come only from this call\u2019s own transcript.</p>
      </div>
      <div ref={scrollRef} className="scroll-thin max-h-[420px] min-h-[140px] space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => ask(s)}
                className="rounded-md border border-brand-200 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-600"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            {m.role === "user" ? (
              <div className="inline-block max-w-[90%] rounded-lg bg-brand-600 px-3 py-2 text-left text-sm text-white">
                {m.text}
              </div>
            ) : (
              <div className="inline-block max-w-full rounded-lg bg-brand-50 px-3 py-2.5 text-left text-sm text-ink-950">
                {m.text ? (
                  <Markdown
                    text={m.text}
                    // A decline carries no real grounding for the question asked
                    // (ARAG's own honest refusal) - never splice citation markers
                    // into it, even if the platform still returned a citations
                    // map alongside it.
                    citations={
                      m.error || isDeclinedAnswer(m.text)
                        ? []
                        : (m.citations ?? []).flatMap((c) =>
                            c.answerRanges.map(([, end]) => ({ end, n: c.n })),
                          )
                    }
                    onCite={(n) => {
                      const c = m.citations?.find((x) => x.n === n);
                      if (c) onCitation(c);
                    }}
                  />
                ) : (
                  busy && <span className="text-slate-400">Thinking…</span>
                )}
                {/* No confidence badge or source chips on a decline (standard B34) -
                    a "confidence" reading next to "not enough data to answer this"
                    is self-contradicting; found live by demo-tester, reproduced 2/2. */}
                {m.text && !m.error && !isDeclinedAnswer(m.text) && !(busy && i === messages.length - 1) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-brand-100 pt-2">
                    <ConfidenceBadge
                      result={
                        (m.quality && deriveConfidenceFromRemi(m.quality, (m.citations ?? []).length)) ??
                        deriveConfidence(
                          m.text.length,
                          (m.citations ?? []).flatMap((c) => c.answerRanges),
                        )
                      }
                    />
                    {(m.citations ?? []).map((c) => (
                      <button
                        type="button"
                        key={c.key}
                        onClick={() => onCitation(c)}
                        className="rounded-md border border-brand-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                        title="Play this moment"
                      >
                        [{c.n}] source
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) {
            ask(input.trim());
            setInput("");
          }
        }}
        className={bare ? "flex gap-2 pt-3" : "flex gap-2 border-t border-brand-100 p-3"}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this call…"
          disabled={busy}
          className="flex-1 rounded-md border border-brand-200 px-3 py-1.5 text-sm text-ink-950 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </Frame>
  );
}
