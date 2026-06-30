"use client";

import { useRef, useState } from "react";
import { Card } from "./ui";

export type Citation = { key: string; field?: string; start: number; end: number };

type Msg = { role: "user" | "assistant"; text: string; citations?: Citation[] };

function parseCitationKey(key: string): Citation {
  // format: <rid>/<f|a|t|u>/<fieldName>/<start>-<end>
  const parts = key.split("/");
  const range = parts[parts.length - 1] ?? "";
  const [s, e] = range.split("-").map((n) => parseInt(n, 10));
  const field = parts.length >= 4 ? `${parts[1]}/${parts[2]}` : undefined;
  return { key, field, start: isNaN(s) ? 0 : s, end: isNaN(e) ? 0 : e };
}

export function ChatPanel({ callId, onCitation }: { callId: string; onCitation: (c: Citation) => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    setMessages((m) => [...m, { role: "user", text: question }, { role: "assistant", text: "" }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/calls/${callId}/ask`, {
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
      const flush = () => setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", text: answer, citations };
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
          let obj: any;
          try { obj = JSON.parse(t); } catch { continue; }
          const item = obj.item ?? obj;
          if (item.type === "answer") { answer += item.text ?? ""; flush(); }
          else if (item.type === "citations") {
            const cmap = item.citations ?? {};
            citations = Object.keys(cmap).map(parseCitationKey).filter((c) => c.field?.includes("/")); // drop title-only if desired
            flush();
          }
        }
      }
      flush();
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", text: `Error: ${String(e)}` };
        return copy;
      });
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }), 50);
    }
  }

  const suggestions = ["Summarize this call", "Was the member satisfied?", "What did the agent offer?"];

  return (
    <Card className="flex flex-col">
      <div className="border-b border-slate-100 p-3">
        <h2 className="text-sm font-semibold text-slate-700">Ask this call</h2>
        <p className="text-xs text-slate-400">Answers are grounded only in this call’s transcript.</p>
      </div>
      <div ref={scrollRef} className="scroll-thin max-h-[300px] min-h-[120px] space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-600"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.text || (busy ? "…" : "")}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.citations.map((c, j) => (
                  <button
                    key={c.key + j}
                    onClick={() => onCitation(c)}
                    className="rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700 hover:bg-brand-100"
                    title="Jump to this moment"
                  >
                    ⏱ source {j + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (input.trim() && !busy) { ask(input.trim()); setInput(""); } }}
        className="flex gap-2 border-t border-slate-100 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this call…"
          disabled={busy}
          className="flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </Card>
  );
}
