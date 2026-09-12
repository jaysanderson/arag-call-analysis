/**
 * Grounded, call-scoped question answering.
 *
 * The upstream ARAG `/ask` NDJSON stream is forwarded to the client unchanged (so the answer still
 * renders token by token) while the same bytes are tapped server-side to collect the finished
 * answer and the FULL retrieved context — every retrieved paragraph, not just the cited ones.
 * When the stream ends, the answer is scored with a real `POST /predict/remi` call and one extra
 * NDJSON line is appended: `{"item":{"type":"quality",…}}`. The confidence badge in the UI is that
 * genuine REMi read, never a raw-score proxy.
 *
 * Best-effort and time-capped: the answer is never held hostage by the scorer, and a scoring
 * failure degrades silently to the client's citation-coverage floor.
 */

import { isDeclinedAnswer } from "@/lib/confidence";
import type { Runtime } from "@/lib/runtime";
import type { AskStreamItem, RetrievalResults } from "@/vendor/arag-platform/src/arag/types.ts";
import { NdjsonSplitter, normaliseItem, toNdjsonLine } from "@/vendor/arag-platform/src/index.ts";

export const REMI_TIMEOUT_MS = 12_000;

export interface RemiQualityItem {
  type: "quality";
  answerRelevance: number | null;
  groundedness: number | null;
  contextRelevance: number | null;
}

const clean = (v?: (number | null)[] | null): number[] =>
  (v ?? []).filter((x): x is number => typeof x === "number");

/**
 * Reduce a raw REMi response to the three numbers the badge uses.
 *
 * Context expansion means most contexts are neighbouring padding, not the one that actually
 * grounds the answer — groundedness asks "is the answer supported by the retrieved material",
 * which the BEST supporting context answers, not the average across every context.
 */
export function reduceRemi(raw: {
  answer_relevance?: { score?: number } | null;
  context_relevance?: (number | null)[] | null;
  groundedness?: (number | null)[] | null;
}): Omit<RemiQualityItem, "type"> {
  const grounded = clean(raw.groundedness);
  const relevant = clean(raw.context_relevance)
    .sort((a, b) => b - a)
    .slice(0, 5);
  return {
    answerRelevance: raw.answer_relevance?.score ?? null,
    groundedness: grounded.length ? Math.max(...grounded) : null,
    contextRelevance: relevant.length
      ? Math.round((relevant.reduce((a, b) => a + b, 0) / relevant.length) * 10) / 10
      : null,
  };
}

/** Every retrieved paragraph's text, in retrieval order. */
export function contextTextsFrom(results: RetrievalResults): string[] {
  const out: string[] = [];
  for (const res of Object.values(results.resources ?? {})) {
    for (const field of Object.values(res?.fields ?? {})) {
      for (const p of Object.values(field?.paragraphs ?? {})) {
        if (typeof p?.text === "string" && p.text.trim()) out.push(p.text);
      }
    }
  }
  return out;
}

export interface AskOptions {
  signal?: AbortSignal;
  /** Skip the REMi round-trip (used by contract tests to keep runs fast). */
  skipQuality?: boolean;
}

/**
 * Ask a question scoped to one call. Returns an NDJSON `ReadableStream` ready to be handed
 * straight to a `Response`.
 *
 * The KB-level `/ask` with `resource_filters:[id]` is used rather than `/resource/{id}/ask`,
 * because the latter returns no retrieval data on this KB (see `docs/architecture/arag-integration.md`).
 */
export function askCall(
  rt: Runtime,
  callId: string,
  question: string,
  opts: AskOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  rt.usage.asks++;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      let contexts: string[] = [];
      const emit = (item: AskStreamItem | Record<string, unknown>) =>
        controller.enqueue(encoder.encode(toNdjsonLine(item)));
      try {
        const res = await rt.arag.request("POST", "/ask", {
          body: JSON.stringify({
            query: question,
            resource_filters: [callId],
            features: ["keyword", "semantic"],
            citations: true,
            top_k: 8,
            ...(rt.env.arag.generativeModel ? { generative_model: rt.env.arag.generativeModel } : {}),
            ...(rt.env.arag.reranker ? { reranker: rt.env.arag.reranker } : {}),
          }),
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          signal: opts.signal,
        });
        if (!res.body) throw new Error("ARAG /ask returned no body");
        const reader = res.body.getReader();
        const splitter = new NdjsonSplitter();
        const absorb = (objs: unknown[]) => {
          for (const obj of objs) {
            const item = normaliseItem(obj);
            if (!item) continue;
            if (item.type === "answer") answer += (item as { text?: string }).text ?? "";
            else if (item.type === "retrieval") {
              contexts = contextTextsFrom((item as { results: RetrievalResults }).results ?? {});
            } else if (item.type === "metadata") {
              const tokens = (item as { tokens?: Record<string, number> }).tokens;
              rt.usage.tokensIn += tokens?.input ?? 0;
              rt.usage.tokensOut += tokens?.output ?? 0;
            }
          }
        };
        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          controller.enqueue(value); // unchanged passthrough — streaming UX untouched
          absorb(splitter.push(value));
        }
        absorb(splitter.flush());
      } catch (err) {
        rt.log.warn("ask.stream.failed", { callId, message: (err as Error).message });
        emit({ type: "error", error: "The answer stream ended early. Please try again." });
        controller.close();
        return;
      }

      // Never score (or badge) a decline: REMi rates the retrieved context's topical relevance to
      // the question, not whether the model actually answered, so it can score a genuine refusal
      // as "High confidence". Skipping the call also avoids paying for a round-trip it cannot use.
      if (!opts.skipQuality && answer.trim() && contexts.length > 0 && !isDeclinedAnswer(answer)) {
        try {
          const quality = await Promise.race([
            rt.arag.remi({ user_id: "call-analysis", question, answer, contexts }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), REMI_TIMEOUT_MS)),
          ]);
          if (quality) emit({ type: "quality", ...reduceRemi(quality) });
        } catch (err) {
          rt.log.debug("ask.remi.failed", { callId, message: (err as Error).message });
        }
      }
      controller.close();
    },
  });
}
