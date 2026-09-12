/**
 * Call domain service — the one place that turns ARAG resources into product objects.
 *
 * Both the `/api/v1` route handlers and the React server components call these functions, so the
 * demo UI and the public API can never drift apart. Every read is cached (catalog ids + per-call
 * summaries, TTL from `CALLS_CACHE_TTL_MS`, default 60 s) and every write invalidates.
 */

import { parseDetail, parseSummary } from "@/lib/parse";
import type { Runtime } from "@/lib/runtime";
import type { CallDetail, CallSummary } from "@/lib/types";
import type { Resource } from "@/vendor/arag-platform/src/arag/types.ts";
import { AragError, badRequest, HttpError, notFound, withRetry } from "@/vendor/arag-platform/src/index.ts";
import { cacheKeys } from "./cache";

/**
 * Light `show` set for list/dashboard: `basic` (incl. computedmetadata labels), `values`
 * (generated JSON fields), `extra` (call metadata) and `extracted` — which MUST be present for the
 * `extracted=metadata` selector to return paragraph classifications at all, while still excluding
 * the full transcript text, so summaries stay cheap.
 */
export const SUMMARY_SHOW = ["basic", "values", "extracted", "extra"];
export const DETAIL_SHOW = ["basic", "values", "extracted", "origin", "extra"];

export const MEDIA_FIELD_ALLOWLIST = ["media", "transcript"] as const;
export type MediaField = (typeof MEDIA_FIELD_ALLOWLIST)[number];

export interface ListOptions {
  q?: string;
  labels?: string[];
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  next_page: boolean;
}

/** Every resource id in the KB (cached; one catalog page walk). */
export async function catalogIds(rt: Runtime): Promise<string[]> {
  return rt.cache.getOrLoad(cacheKeys.catalogIds(), () =>
    withRetry(() => rt.arag.listResourceIds({ pageSize: 100, max: 500 })),
  );
}

/** Semantic + keyword search across transcripts; returns matching resource ids (cached). */
export async function searchIds(rt: Runtime, query: string): Promise<string[]> {
  return rt.cache.getOrLoad(cacheKeys.find(query), async () => {
    const r = await withRetry(() => rt.arag.find({ query, features: ["keyword", "semantic"], top_k: 60 }));
    return Object.keys(r.resources ?? {});
  });
}

/** One call summary (cached per id). Returns null when the resource is gone or unreadable. */
export async function summaryOf(rt: Runtime, id: string): Promise<CallSummary | null> {
  try {
    return await rt.cache.getOrLoad(cacheKeys.summary(id), async () => {
      const res = (await rt.arag.getResource(id, {
        show: SUMMARY_SHOW,
        extracted: ["metadata"],
      })) as Resource;
      return parseSummary(res);
    });
  } catch (err) {
    rt.log.warn("calls.summary.failed", { id, message: (err as Error).message });
    return null;
  }
}

async function summariesFor(rt: Runtime, ids: string[]): Promise<CallSummary[]> {
  const rows = await Promise.all(ids.map((id) => summaryOf(rt, id)));
  return rows.filter((c): c is CallSummary => c !== null);
}

function parseLabelFilter(label: string): { labelset: string; label: string } | null {
  const i = label.indexOf("/");
  if (i <= 0 || i === label.length - 1) return null;
  return { labelset: label.slice(0, i), label: label.slice(i + 1) };
}

/** Apply the label facet filter (AND across facets) to a list of summaries. */
export function filterByLabels(calls: CallSummary[], labels: string[]): CallSummary[] {
  const wanted = labels.map(parseLabelFilter).filter((w): w is { labelset: string; label: string } => !!w);
  if (wanted.length === 0) return calls;
  return calls.filter((c) =>
    wanted.every((w) => c.labels.some((l) => l.labelset === w.labelset && l.label === w.label)),
  );
}

/** Paginated, filtered call list. */
export async function listCalls(rt: Runtime, opts: ListOptions = {}): Promise<Page<CallSummary>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const q = opts.q?.trim();
  const ids = q ? await searchIds(rt, q) : await catalogIds(rt);
  let calls = await summariesFor(rt, ids);
  calls = filterByLabels(calls, opts.labels ?? []);
  calls.sort((a, b) => (b.createdISO ?? "").localeCompare(a.createdISO ?? ""));
  const total = calls.length;
  const start = (page - 1) * pageSize;
  return {
    items: calls.slice(start, start + pageSize),
    page,
    page_size: pageSize,
    total,
    next_page: start + pageSize < total,
  };
}

/** All summaries (dashboard aggregation, rails). */
export async function allSummaries(rt: Runtime): Promise<CallSummary[]> {
  const ids = await catalogIds(rt);
  const calls = await summariesFor(rt, ids);
  calls.sort((a, b) => (b.createdISO ?? "").localeCompare(a.createdISO ?? ""));
  return calls;
}

/** Full call detail (transcript, paragraphs, moments, analysis). Throws 404 when unknown. */
export async function getCall(rt: Runtime, id: string): Promise<CallDetail> {
  try {
    return await rt.cache.getOrLoad(cacheKeys.detail(id), async () => {
      const res = (await rt.arag.getResource(id, {
        show: DETAIL_SHOW,
        extracted: ["text", "metadata"],
      })) as Resource;
      return parseDetail(res);
    });
  } catch (err) {
    if (err instanceof AragError && err.status === 404) throw notFound("Call");
    throw err;
  }
}

/** Best-effort detail read for server components: null instead of throwing. */
export async function tryGetCall(rt: Runtime, id: string): Promise<CallDetail | null> {
  try {
    return await getCall(rt, id);
  } catch {
    return null;
  }
}

export interface CreateCallInput {
  title: string;
  slug?: string;
  agentName?: string;
  memberId?: string;
  queue?: string;
  createdISO?: string;
  durationSec?: number;
  /** Plain-text transcript (creates a text resource). */
  transcript?: string;
  /** Recording bytes (creates a resource shell + `media` file field; ARAG transcribes it). */
  recording?: { bytes: Uint8Array; filename: string; contentType: string };
}

const AUDIO_VIDEO_RE = /^(audio|video)\//;

export function mediaTypeFor(input: CreateCallInput): "audio" | "video" | "transcript" {
  if (!input.recording) return "transcript";
  return input.recording.contentType.startsWith("video/") ? "video" : "audio";
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `call-${Date.now()}`
  );
}

/** Create a call resource from a transcript or a recording. Returns the ARAG resource id. */
export async function createCall(rt: Runtime, input: CreateCallInput): Promise<string> {
  // Route handlers validate first; these are the service-layer invariants, as problem documents
  // rather than 500s, so any caller of the service (a script, a test) gets the same contract.
  if (!input.transcript && !input.recording)
    throw badRequest("Either a transcript or a recording is required");
  if (input.recording && !AUDIO_VIDEO_RE.test(input.recording.contentType))
    throw new HttpError(
      415,
      "Unsupported media type",
      `recording content type ${input.recording.contentType} is not audio or video`,
    );
  const createdISO = input.createdISO ?? new Date().toISOString();
  const mediaType = mediaTypeFor(input);
  const icon = input.recording?.contentType ?? "text/plain";
  const body = {
    title: input.title,
    slug: input.slug ?? slugify(input.title),
    icon,
    origin: {
      created: createdISO,
      modified: createdISO,
      path: `/${input.queue ?? "Unassigned"}`,
      tags: [mediaType, input.queue ?? "Unassigned"],
      collaborators: input.agentName ? [input.agentName] : [],
    },
    extra: {
      metadata: {
        agent_name: input.agentName,
        member_id: input.memberId,
        queue: input.queue,
        duration_sec: input.durationSec,
        media_type: mediaType,
      },
    },
    ...(input.transcript
      ? { texts: { transcript: { body: input.transcript, format: "PLAIN" as const } } }
      : {}),
  };
  const { uuid } = await rt.arag.createResource(body);
  if (input.recording) {
    await rt.arag.uploadFileField(
      uuid,
      "media",
      input.recording.bytes,
      input.recording.filename,
      input.recording.contentType,
      { language: "en" },
    );
  }
  rt.usage.uploads++;
  invalidateCall(rt, uuid);
  return uuid;
}

/** Delete a call and its KB resource. */
export async function deleteCall(rt: Runtime, id: string): Promise<void> {
  try {
    await rt.arag.deleteResource(id);
  } catch (err) {
    if (err instanceof AragError && err.status === 404) throw notFound("Call");
    throw err;
  }
  rt.usage.deletes++;
  invalidateCall(rt, id);
}

/** Invalidate everything a call participates in (its own entries plus every aggregate). */
export function invalidateCall(rt: Runtime, id?: string): void {
  if (id) {
    rt.cache.delete(cacheKeys.summary(id));
    rt.cache.delete(cacheKeys.detail(id));
  }
  rt.cache.invalidatePrefix("catalog:");
  rt.cache.invalidatePrefix("find:");
  rt.cache.delete(cacheKeys.dashboard());
}

/** Stream a call's media/transcript file field, forwarding Range so the player can scrub. */
export async function mediaStream(
  rt: Runtime,
  id: string,
  field: string,
  range: string | null,
  signal?: AbortSignal,
): Promise<Response> {
  if (!(MEDIA_FIELD_ALLOWLIST as readonly string[]).includes(field))
    throw badRequest(`field must be one of ${MEDIA_FIELD_ALLOWLIST.join(", ")}`);
  try {
    return await rt.arag.downloadFileField(id, field, { range, signal });
  } catch (err) {
    if (err instanceof AragError && err.status === 404) throw notFound("Media field");
    throw err;
  }
}
