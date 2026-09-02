/**
 * Derives a coarse, qualitative confidence label from the citation coverage
 * ARAG's own /ask response already returns for an answer — never a raw
 * REMi numeral (standard B34: REMi rewards echoing a single source and
 * penalises genuine synthesis, so a bare score misleads on a well-written
 * synthesized answer; a citation-coverage badge is the honest, non-REMi
 * signal this app can show without adding a new ARAG call).
 *
 * This is intentionally NOT presented as "REMi" anywhere in the UI — it is
 * a coverage measure computed from the real citation ranges this app's
 * existing scoped /ask call returns, disclosed as such in the
 * "How this works" reveal.
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
