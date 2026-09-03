import { NextRequest } from "next/server";
import { askResourceStream, scoreRemi } from "@/lib/arag";
import { isDeclinedAnswer } from "@/lib/confidence";

export const dynamic = "force-dynamic";

/**
 * Proxy a resource-scoped ask. Streams the upstream NDJSON straight back to
 * the browser unchanged (so the answer still renders incrementally) while
 * also tapping the same bytes server-side to capture the full answer text
 * and the FULL retrieved context (every retrieved paragraph, not just the
 * cited ones - CLAUDE.md's documented fix for REMi groundedness swinging
 * wildly on a thin context set). Once the upstream stream ends, this scores
 * the finished answer against that context with a real `/predict/remi` call
 * and appends one more NDJSON line - `{"item":{"type":"quality",...}}` - so
 * the client's confidence badge is a genuine REMi-derived read (standard
 * B34/B39), never a raw-score proxy. Best-effort and time-capped: the
 * answer itself is never held hostage by the scorer, and a scoring failure
 * degrades silently (the client falls back to its citation-coverage floor,
 * never a visible error - standard B38).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return new Response(JSON.stringify({ error: "question required" }), { status: 400 });
  }

  const upstream = await askResourceStream(id, question);
  if (!upstream.body || !upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buf = "";
      let fullAnswer = "";
      const contextTexts: string[] = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          controller.enqueue(value); // unchanged passthrough - client streaming UX is untouched
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            let obj: any;
            try { obj = JSON.parse(t); } catch { continue; }
            const item = obj.item ?? obj;
            if (item.type === "answer") {
              fullAnswer += item.text ?? "";
            } else if (item.type === "retrieval") {
              const resources = item.results?.resources ?? {};
              for (const raw of Object.values<any>(resources)) {
                for (const field of Object.values<any>(raw?.fields ?? {})) {
                  for (const p of Object.values<any>(field?.paragraphs ?? {})) {
                    if (p?.text) contextTexts.push(p.text);
                  }
                }
              }
            }
          }
        }
      } catch {
        // Upstream read failed mid-stream - still close cleanly below rather
        // than leave the client's reader hanging.
      }

      // Never score (or badge) a decline - REMi rates the retrieved context's
      // topical relevance to the question, not whether the model actually
      // answered, so it can score a genuine refusal as "High confidence"
      // (found live by demo-tester, reproduced 2/2). Skipping the call here
      // also means a decline never pays for a REMi round-trip it can't use.
      if (fullAnswer.trim() && contextTexts.length > 0 && !isDeclinedAnswer(fullAnswer)) {
        try {
          const quality = await Promise.race([
            scoreRemi(question, fullAnswer, contextTexts),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
          ]);
          if (quality) {
            controller.enqueue(encoder.encode(`${JSON.stringify({ item: { type: "quality", ...quality } })}\n`));
          }
        } catch {
          // REMi unreachable - skip silently, client keeps its citation-coverage floor
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: upstream.status,
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
