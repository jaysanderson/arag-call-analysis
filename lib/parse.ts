/**
 * Pure view-model parsing: raw ARAG resources → `CallSummary` / `CallDetail`.
 *
 * Everything here is deliberately defensive. Generated fields are written by a model, so a field
 * can be missing, wrapped in a code fence, or contain a refusal sentence where an enum value was
 * asked for — none of which may ever reach a chart or a badge.
 */
import type { ParagraphMeta, Resource } from "@/vendor/arag-platform/src/arag/types.ts";
// Relative, with the extension: `scripts/*.ts` import this module and run under plain `node`,
// which has no bundler and no tsconfig path mapping. A `@/` VALUE import here breaks `make smoke`
// while every bundled check stays green — see test/unit/script-imports.test.ts.
import { deriveLifecycle } from "./lifecycle.ts";
import type {
  CallAnalysis,
  CallDetail,
  CallMetrics,
  CallParagraph,
  CallSummary,
  ResourceLabel,
} from "./types";

/** Agent-generated fields are named `da-<destination>-<f|t>-<sourceField>`. */
const DA_PREFIX = "da-";
const CONTENT_PARAGRAPH_KINDS = new Set(["TRANSCRIPT", "TEXT", "TITLE"]);

type FieldGroup = "files" | "texts" | "generics";
type AnyField = NonNullable<NonNullable<Resource["data"]>[string]>[string];

function mediaTypeFromIcon(icon = ""): CallSummary["mediaType"] {
  if (icon.includes("audio")) return "audio";
  if (icon.includes("video")) return "video";
  return "transcript";
}

function detectSpeaker(text: string): "Agent" | "Member" | undefined {
  const m = text.match(/^\s*(Agent|Member)\s*:/i);
  if (!m?.[1]) return undefined;
  return (m[1][0]!.toUpperCase() + m[1].slice(1).toLowerCase()) as "Agent" | "Member";
}

function stripSpeaker(text: string): string {
  return text.replace(/^\s*(Agent|Member)\s*:\s*/i, "").trim();
}

function fieldsIn(res: Resource, group: FieldGroup): Record<string, AnyField> {
  return (res.data?.[group] ?? {}) as Record<string, AnyField>;
}

// ---- Resource-level classifications (labels) ----
export function extractLabels(res: Resource): ResourceLabel[] {
  const out: ResourceLabel[] = [];
  const seen = new Set<string>();
  const push = (labelset?: string, label?: string) => {
    if (!labelset || !label) return;
    const k = `${labelset}::${label}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ labelset, label });
  };
  for (const c of res.usermetadata?.classifications ?? []) push(c.labelset, c.label);
  for (const fc of res.computedmetadata?.field_classifications ?? []) {
    for (const c of fc.classifications ?? []) push(c.labelset, c.label);
  }
  for (const group of ["files", "texts"] as const) {
    for (const f of Object.values(fieldsIn(res, group))) {
      for (const c of f?.extracted?.metadata?.metadata?.classifications ?? []) push(c.labelset, c.label);
    }
  }
  return out;
}

export function stripCodeFence(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m?.[1] ?? t;
}

/**
 * Read a generated JSON field by its logical destination name ("call_analysis"); the stored field
 * id is `da-call_analysis-<f|t>-<sourceField>`, so it is matched by substring.
 */
export function readJsonField<T>(res: Resource, destination: string): T | undefined {
  for (const group of ["texts", "generics"] as const) {
    for (const [fid, f] of Object.entries(fieldsIn(res, group))) {
      if (!fid.startsWith(DA_PREFIX) || !fid.includes(destination)) continue;
      const body = f?.value?.body ?? f?.extracted?.text?.text;
      if (typeof body !== "string") continue;
      try {
        return JSON.parse(stripCodeFence(body)) as T;
      } catch {
        /* not JSON — try the next candidate field */
      }
    }
  }
  return undefined;
}

/**
 * Allowed values per generated metrics field — mirrors the enums in `lib/domain/taxonomy.ts`
 * (keep the two in sync). The metrics field is written by a plain-text `ask` agent and parsed as
 * JSON server-side, which means the model can return a refusal sentence in place of an enum value.
 * Found live in the 3 Sep 2026 audit: exactly that leaked "Not enough data to answer this." into
 * the Line of Business chart as if it were a real category. Never trust a generated value straight
 * into a customer-facing chart — validate it first.
 */
export const VALID_METRIC_VALUES: Partial<Record<keyof CallMetrics, Set<string>>> = {
  call_reason: new Set([
    "Claims",
    "Billing & Payments",
    "Enrollment & Eligibility",
    "Benefits & Coverage",
    "Prior Authorization",
    "Provider Network",
    "Pharmacy & Rx",
    "Complaint",
    "Cancellation & Retention",
    "Portal & Tech Support",
  ]),
  outcome: new Set(["Resolved", "Follow-up Required", "Escalated", "Transferred", "Unresolved"]),
  sentiment: new Set(["Positive", "Neutral", "Negative", "Mixed"]),
  line_of_business: new Set([
    "Individual & Family",
    "Medicare Advantage",
    "Medicaid",
    "Employer Group",
    "Dental & Vision",
    "Supplemental",
  ]),
};

export function sanitizeMetrics(raw?: CallMetrics): CallMetrics | undefined {
  if (!raw) return raw;
  const clean: CallMetrics = { ...raw };
  for (const key of Object.keys(VALID_METRIC_VALUES) as (keyof CallMetrics)[]) {
    const allowed = VALID_METRIC_VALUES[key];
    const v = clean[key];
    if (allowed && typeof v === "string" && !allowed.has(v)) {
      // Dropped, not rendered — never a raw generated string on a chart.
      (clean as Record<string, unknown>)[key] = undefined;
    }
  }
  return clean;
}

/**
 * Per-call "moment map" for the card thumbnail: the dominant paragraph-level moment label across
 * the call. Reuses metadata already fetched for the summary (no extra ARAG call).
 */
const HIGHLIGHT_MOMENTS = new Set([
  "Complaint",
  "Escalation",
  "Cross-sell Pitch",
  "Resolution",
  "Empathy Statement",
  "Objection",
]);

function extractMomentTrack(res: Resource): string[] {
  const content = findContentField(res);
  if (!content) return [];
  const field = fieldsIn(res, content.group)[content.id];
  const paras = field?.extracted?.metadata?.metadata?.paragraphs ?? [];
  const track: string[] = [];
  for (const p of paras) {
    if (!CONTENT_PARAGRAPH_KINDS.has(p.kind ?? "TEXT")) continue;
    const moments = (p.classifications ?? []).map((c) => c.label).filter(Boolean);
    track.push(moments.find((m) => HIGHLIGHT_MOMENTS.has(m)) ?? "");
  }
  return track;
}

/** The transcript-bearing field: a file field (audio/video) or the first non-generated text field. */
export function findContentField(res: Resource): { group: "files" | "texts"; id: string } | undefined {
  const fileIds = Object.keys(fieldsIn(res, "files"));
  if (fileIds[0]) return { group: "files", id: fileIds[0] };
  const textIds = Object.keys(fieldsIn(res, "texts")).filter((id) => !id.startsWith(DA_PREFIX));
  if (textIds[0]) return { group: "texts", id: textIds[0] };
  return undefined;
}

function extractParagraphs(field: AnyField | undefined): CallParagraph[] {
  const fullText = field?.extracted?.text?.text ?? "";
  const paras: ParagraphMeta[] = field?.extracted?.metadata?.metadata?.paragraphs ?? [];
  const result: CallParagraph[] = [];
  let idx = 0;
  for (const p of paras) {
    const kind = p.kind ?? "TEXT";
    if (!CONTENT_PARAGRAPH_KINDS.has(kind)) continue; // skip OCR/INCEPTION/etc.
    const raw = fullText.slice(p.start, p.end).trim();
    if (!raw) continue;
    const speaker = detectSpeaker(raw);
    const moments = (p.classifications ?? []).map((c) => c.label).filter(Boolean);
    result.push({
      index: idx++,
      text: speaker ? stripSpeaker(raw) : raw,
      charStart: p.start ?? 0,
      charEnd: p.end ?? 0,
      startSeconds: Array.isArray(p.start_seconds) ? p.start_seconds[0] : undefined,
      endSeconds: Array.isArray(p.end_seconds) ? p.end_seconds[0] : undefined,
      kind,
      moments,
      speaker,
    });
  }
  return result;
}

function baseSummary(res: Resource): CallSummary {
  const extra = (res.extra?.metadata ?? {}) as Record<string, unknown>;
  const metrics = sanitizeMetrics(readJsonField<CallMetrics>(res, "call_metrics"));
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    id: res.id ?? (res as { uuid?: string }).uuid ?? "",
    slug: res.slug ?? "",
    title: res.title ?? "Untitled call",
    icon: res.icon ?? "",
    mediaType: mediaTypeFromIcon(res.icon),
    createdISO: (res.origin?.created as string | undefined) ?? res.created,
    durationSec: typeof extra.duration_sec === "number" ? extra.duration_sec : undefined,
    agentName: str(extra.agent_name),
    memberId: str(extra.member_id),
    queue: str(extra.queue),
    labels: extractLabels(res),
    metrics,
    momentTrack: extractMomentTrack(res),
    status: (res.metadata?.status as string | undefined) ?? "PROCESSED",
  };
}

export function parseSummary(res: Resource): CallSummary {
  const summary = baseSummary(res);
  return { ...summary, lifecycle: deriveLifecycle(summary) };
}

export function parseDetail(res: Resource): CallDetail {
  const summary = baseSummary(res);
  const content = findContentField(res);
  const field = content ? fieldsIn(res, content.group)[content.id] : undefined;
  const transcriptText = field?.extracted?.text?.text ?? field?.value?.body ?? "";
  const paragraphs = field ? extractParagraphs(field) : [];
  const analysis = readJsonField<CallAnalysis>(res, "call_analysis");
  return {
    ...summary,
    // `analysis ?? null` matters: `undefined` means "this read did not look for a narrative"
    // (a summary read), `null` means "looked, and there is none" — which is what demotes a call
    // from `analysed` to `partial`.
    lifecycle: deriveLifecycle({ ...summary, analysis: analysis ?? null }),
    fieldId: content?.id ?? "media",
    fieldType: content?.group ?? "files",
    transcriptText,
    paragraphs,
    analysis,
  };
}

export { mediaTypeFromIcon };
