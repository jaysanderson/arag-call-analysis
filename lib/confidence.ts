/**
 * Two confidence sources, both feeding the same qualitative badge (standard
 * B34/B39 - a real REMi-derived read, qualitative only, never a raw
 * numeral):
 *  - `deriveConfidence` - an instant citation-coverage floor from the
 *    citation ranges /ask already returns, shown the moment the answer
 *    finishes streaming so the badge is never blank.
 *  - `deriveConfidenceFromRemi` - the genuine `/predict/remi` score
 *    (lib/arag.ts's scoreRemi, called server-side against the FULL
 *    retrieved context per CLAUDE.md's documented fix for score
 *    instability on synthesized answers), which upgrades the badge the
 *    instant it resolves. Best-effort and time-capped server-side; if it
 *    never arrives the coverage floor simply stays as the shown value -
 *    never a visible error state (standard B38).
 */
export type ConfidenceLevel = "high" | "moderate" | "low" | "none";

export type ConfidenceResult = {
  level: ConfidenceLevel;
  label: string;
  citationCount: number;
  coveragePct: number; // 0-100
};

export function deriveConfidence(answerLength: number, ranges: [number, number][]): ConfidenceResult {
  const clean = ranges
    .map(([s, e]) => [Math.max(0, Math.min(s, e)), Math.max(0, Math.max(s, e))] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  let covered = 0;
  let cursor = -1;
  for (const [s, e] of clean) {
    const start = Math.max(s, cursor);
    if (e > start) covered += e - start;
    cursor = Math.max(cursor, e);
  }

  const coveragePct = answerLength > 0 ? Math.round((covered / answerLength) * 100) : 0;
  const citationCount = clean.length;

  if (citationCount === 0) {
    return { level: "none", label: "No grounded citations", citationCount, coveragePct: 0 };
  }
  if (citationCount >= 2 && coveragePct >= 40) {
    return { level: "high", label: "High confidence", citationCount, coveragePct };
  }
  if (citationCount >= 1 && coveragePct >= 15) {
    return { level: "moderate", label: "Moderate confidence", citationCount, coveragePct };
  }
  return { level: "low", label: "Low confidence", citationCount, coveragePct };
}

export type RemiQuality = { answerRelevance: number | null; groundedness: number | null; contextRelevance: number | null };

/**
 * Qualitative bucket from a real REMi score (0-5 scale on both fields).
 * Takes the MAX of answer relevance and groundedness rather than the
 * average - REMi rewards echoing a single source and penalises genuine
 * synthesis (a mostly-grounded answer with a small fused-in detail scores
 * ~4/5, not 0/5), so averaging in a lower groundedness score would punish
 * exactly the kind of good synthesized answer (an executive summary, a
 * scorecard read-out) this app's chat produces most often. Full-context
 * scoring (lib/arag.ts's scoreRemi) already removes most of the swing;
 * this is the remaining safety margin.
 */
export function deriveConfidenceFromRemi(q: RemiQuality, citationCount: number): ConfidenceResult | null {
  if (q.answerRelevance == null && q.groundedness == null) return null;
  const score = Math.max(q.answerRelevance ?? 0, q.groundedness ?? 0) / 5;
  if (score >= 0.7) return { level: "high", label: "High confidence", citationCount, coveragePct: Math.round(score * 100) };
  if (score >= 0.4) return { level: "moderate", label: "Moderate confidence", citationCount, coveragePct: Math.round(score * 100) };
  if (score > 0) return { level: "low", label: "Low confidence", citationCount, coveragePct: Math.round(score * 100) };
  return { level: "none", label: "No grounded citations", citationCount: 0, coveragePct: 0 };
}
