import type {
  CallDetail, CallSummary, CallParagraph, ResourceLabel, CallAnalysis, CallMetrics,
} from "./types";

// Agent-generated fields are named `da-<destination>-<f|t>-<sourceField>`,
// e.g. "da-call_analysis-f-media" or "da-call_metrics-t-transcript".
const DA_PREFIX = "da-";
const CONTENT_PARAGRAPH_KINDS = new Set(["TRANSCRIPT", "TEXT", "TITLE"]);

function mediaTypeFromIcon(icon = ""): CallSummary["mediaType"] {
  if (icon.includes("audio")) return "audio";
  if (icon.includes("video")) return "video";
  return "transcript";
}

function detectSpeaker(text: string): "Agent" | "Member" | undefined {
  const m = text.match(/^\s*(Agent|Member)\s*:/i);
  if (!m) return undefined;
  return (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as "Agent" | "Member";
}

function stripSpeaker(text: string): string {
  return text.replace(/^\s*(Agent|Member)\s*:\s*/i, "").trim();
}

// ---- Resource-level classifications (labels) ----
export function extractLabels(res: any): ResourceLabel[] {
  const out: ResourceLabel[] = [];
  const seen = new Set<string>();
  const push = (labelset?: string, label?: string) => {
    if (!labelset || !label) return;
    const k = `${labelset}::${label}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ labelset, label });
  };
  // 1) user/computed metadata classifications
  for (const c of res?.usermetadata?.classifications ?? []) push(c.labelset, c.label);
  // 2) computedmetadata field_classifications: [{field, classifications:[{labelset,label}]}]
  for (const fc of res?.computedmetadata?.field_classifications ?? []) {
    for (const c of fc.classifications ?? []) push(c.labelset, c.label);
  }
  // 3) field-level extracted classifications
  for (const group of ["files", "texts"]) {
    const fields = res?.data?.[group] ?? {};
    for (const f of Object.values<any>(fields)) {
      const cls = f?.extracted?.metadata?.metadata?.classifications ?? [];
      for (const c of cls) push(c.labelset, c.label);
    }
  }
  return out;
}

// ---- Generated JSON fields ----
// `destination` is the logical name ("call_analysis"); the stored field id is
// "da-call_analysis-<f|t>-<sourceField>", so we match by substring.
function readJsonField(res: any, destination: string): any | undefined {
  for (const group of ["texts", "generics"]) {
    const fields = res?.data?.[group] ?? {};
    for (const [fid, f] of Object.entries<any>(fields)) {
      if (!fid.startsWith(DA_PREFIX) || !fid.includes(destination)) continue;
      const body = f?.value?.body ?? f?.body ?? f?.extracted?.text?.text;
      if (typeof body === "string") {
        try {
          return JSON.parse(stripCodeFence(body));
        } catch {
          /* not JSON */
        }
      }
    }
  }
  return undefined;
}

function stripCodeFence(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : t;
}

// ---- Content field (transcript) detection ----
function findContentField(res: any): { group: "files" | "texts"; id: string } | undefined {
  const files = res?.data?.files ?? {};
  const fileIds = Object.keys(files);
  if (fileIds.length) return { group: "files", id: fileIds[0] };
  const texts = res?.data?.texts ?? {};
  const textIds = Object.keys(texts).filter((id) => !id.startsWith(DA_PREFIX));
  if (textIds.length) return { group: "texts", id: textIds[0] };
  return undefined;
}

function extractParagraphs(field: any): CallParagraph[] {
  const fullText: string = field?.extracted?.text?.text ?? "";
  const paras: any[] = field?.extracted?.metadata?.metadata?.paragraphs ?? [];
  const result: CallParagraph[] = [];
  let idx = 0;
  for (const p of paras) {
    const kind = p.kind ?? "TEXT";
    if (!CONTENT_PARAGRAPH_KINDS.has(kind)) continue; // skip OCR/INCEPTION/etc.
    const raw = fullText.slice(p.start, p.end).trim();
    if (!raw) continue;
    const speaker = detectSpeaker(raw);
    // The only paragraph-level labelset is "moment".
    const moments: string[] = (p.classifications ?? [])
      .map((c: any) => c.label)
      .filter(Boolean);
    result.push({
      index: idx++,
      text: speaker ? stripSpeaker(raw) : raw,
      charStart: p.start,
      charEnd: p.end,
      startSeconds: Array.isArray(p.start_seconds) ? p.start_seconds[0] : p.start_seconds,
      endSeconds: Array.isArray(p.end_seconds) ? p.end_seconds[0] : p.end_seconds,
      kind,
      moments,
      speaker,
    });
  }
  return result;
}

export function parseSummary(res: any): CallSummary {
  return baseSummary(res);
}

function baseSummary(res: any): CallSummary {
  const extra = res?.extra?.metadata ?? {};
  const metrics = readJsonField(res, "call_metrics") as CallMetrics | undefined;
  return {
    id: res.id ?? res.uuid,
    slug: res.slug,
    title: res.title ?? "Untitled call",
    icon: res.icon ?? "",
    mediaType: mediaTypeFromIcon(res.icon),
    createdISO: res?.origin?.created ?? res.created,
    durationSec: typeof extra.duration_sec === "number" ? extra.duration_sec : undefined,
    agentName: extra.agent_name,
    memberId: extra.member_id,
    queue: extra.queue,
    labels: extractLabels(res),
    metrics,
  };
}

export function parseDetail(res: any): CallDetail {
  const summary = baseSummary(res);
  const content = findContentField(res);
  const field = content ? res.data[content.group][content.id] : undefined;
  const transcriptText: string = field?.extracted?.text?.text ?? field?.value?.body ?? "";
  const paragraphs = field ? extractParagraphs(field) : [];
  const analysis = readJsonField(res, "call_analysis") as CallAnalysis | undefined;
  return {
    ...summary,
    fieldId: content?.id ?? "media",
    fieldType: content?.group ?? "files",
    transcriptText,
    paragraphs,
    analysis,
  };
}

export { mediaTypeFromIcon };
