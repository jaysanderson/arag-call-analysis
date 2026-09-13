/**
 * Call domain service — the one place that turns ARAG resources into product objects.
 *
 * Both the `/api/v1` route handlers and the React server components call these functions, so the
 * demo UI and the public API can never drift apart. Every read is cached (catalog ids + per-call
 * summaries, TTL from `CALLS_CACHE_TTL_MS`, default 60 s) and every write invalidates.
 */

import { type CallLifecycle, deriveLifecycle } from "@/lib/lifecycle";
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

/**
 * Sortable columns of the calls data table. Every one of them is a field the product already
 * derives from ARAG (resource origin, `extra.metadata`, or the `call_metrics` the ask agent
 * writes) — nothing here is computed for sorting alone.
 */
export const CALL_SORTS = [
  "created",
  "title",
  "duration",
  "agent",
  "queue",
  "sentiment",
  "compliance",
  "csat",
] as const;
export type CallSort = (typeof CALL_SORTS)[number];

export interface ListOptions {
  q?: string;
  labels?: string[];
  page?: number;
  pageSize?: number;
  sort?: CallSort;
  order?: "asc" | "desc";
  /** Restrict to an explicit id set (used by bulk export of a table selection). */
  ids?: string[];
  agent?: string;
  queue?: string;
  mediaType?: "audio" | "video" | "transcript";
  /** Inclusive ISO-8601 date bounds on the call time. */
  from?: string;
  to?: string;
  minDuration?: number;
  maxDuration?: number;
  complaint?: boolean;
  fcr?: boolean;
  escalated?: boolean;
  lifecycle?: CallLifecycle;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  next_page: boolean;
}

export interface FacetCount {
  labelset: string;
  label: string;
  count: number;
}

export interface CallPage extends Page<CallSummary> {
  /** Label tallies across the whole filtered set, so the filter bar can show live counts. */
  facets: FacetCount[];
  /** Distinct agents and queues in the filtered set, for the filter bar's selects. */
  agents: string[];
  queues: string[];
}

/**
 * Every resource id in the KB (cached; one catalog page walk).
 *
 * Served stale-while-revalidating: this and `summaryOf` are the two reads whose expiry used to
 * cost a reader the whole 1 + N fan-out at once. Every write path that can change the set
 * (`createCall`, `deleteCall`, `invalidateCall`, provisioning) invalidates the key outright, so
 * the staleness window is bounded by the TTL and never by a missed write.
 */
export async function catalogIds(rt: Runtime): Promise<string[]> {
  return rt.cache.getOrLoadStale(cacheKeys.catalogIds(), () =>
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
    return await rt.cache.getOrLoadStale(cacheKeys.summary(id), async () => {
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

/**
 * The status of a call's own ingest job, when this process still has one.
 *
 * Jobs are in-memory and keyed by `ref` (the call id), so this is a map lookup rather than a
 * round trip. Without it, `queued` and job-level `failed` are states the product can define but
 * never show: ARAG reports a freshly created resource as PENDING, which is "transcribing", and
 * says nothing at all about a call whose upload was accepted but not yet picked up.
 */
function jobStatusFor(rt: Runtime, callId: string): string | undefined {
  const jobs = rt.jobs.list({ ref: callId, limit: 1 });
  return jobs[0]?.status;
}

async function summariesFor(rt: Runtime, ids: string[]): Promise<CallSummary[]> {
  const rows = await Promise.all(ids.map((id) => summaryOf(rt, id)));
  return rows
    .filter((c): c is CallSummary => c !== null)
    .map((c) => {
      // The job status is deliberately applied *after* the cache: a cached summary must not
      // freeze a job state that has since moved on.
      const jobStatus = jobStatusFor(rt, c.id);
      return jobStatus ? { ...c, lifecycle: deriveLifecycle(c, jobStatus) } : c;
    });
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

/**
 * Structured (non-label) filters: the attributes that live on the resource itself or in the flat
 * `call_metrics` record. Kept separate from `filterByLabels` so both are unit-testable on their
 * own and so the facet tallies can be computed over the structurally-filtered set.
 */
export function filterByAttributes(calls: CallSummary[], opts: ListOptions): CallSummary[] {
  const idSet = opts.ids?.length ? new Set(opts.ids) : null;
  return calls.filter((c) => {
    if (idSet && !idSet.has(c.id)) return false;
    if (opts.agent && c.agentName !== opts.agent) return false;
    if (opts.queue && c.queue !== opts.queue) return false;
    if (opts.mediaType && c.mediaType !== opts.mediaType) return false;
    // Compared as ISO strings: both sides are ISO-8601 UTC, so lexicographic order is
    // chronological order and no Date objects need constructing per row.
    if (opts.from && (c.createdISO ?? "") < opts.from) return false;
    if (opts.to && (c.createdISO ?? "") > opts.to) return false;
    if (opts.minDuration !== undefined && (c.durationSec ?? 0) < opts.minDuration) return false;
    if (opts.maxDuration !== undefined && (c.durationSec ?? 0) > opts.maxDuration) return false;
    if (opts.complaint !== undefined && Boolean(c.metrics?.complaint) !== opts.complaint) return false;
    if (opts.fcr !== undefined && Boolean(c.metrics?.first_call_resolution) !== opts.fcr) return false;
    if (opts.escalated !== undefined && Boolean(c.metrics?.escalated) !== opts.escalated) return false;
    if (opts.lifecycle && (c.lifecycle ?? deriveLifecycle(c)) !== opts.lifecycle) return false;
    return true;
  });
}

/** Sentiment is ordinal in the table, not alphabetical: worst first when ascending. */
const SENTIMENT_RANK: Record<string, number> = { Negative: 0, Mixed: 1, Neutral: 2, Positive: 3 };

function sortKey(c: CallSummary, sort: CallSort): string | number {
  switch (sort) {
    case "title":
      return c.title.toLowerCase();
    case "duration":
      return c.durationSec ?? 0;
    case "agent":
      return (c.agentName ?? "").toLowerCase();
    case "queue":
      return (c.queue ?? "").toLowerCase();
    case "sentiment":
      return SENTIMENT_RANK[c.metrics?.sentiment ?? ""] ?? -1;
    case "compliance":
      return c.metrics?.compliance_score ?? -1;
    case "csat":
      return c.metrics?.csat_estimate ?? -1;
    default:
      return c.createdISO ?? "";
  }
}

/** Stable sort by any table column; ties break on call time so paging never reshuffles rows. */
export function sortCalls(calls: CallSummary[], sort: CallSort = "created", order: "asc" | "desc" = "desc") {
  const dir = order === "asc" ? 1 : -1;
  return [...calls].sort((a, b) => {
    const ka = sortKey(a, sort);
    const kb = sortKey(b, sort);
    const cmp =
      typeof ka === "number" && typeof kb === "number"
        ? ka - kb
        : String(ka).localeCompare(String(kb), undefined, { numeric: true });
    if (cmp !== 0) return cmp * dir;
    return (b.createdISO ?? "").localeCompare(a.createdISO ?? "");
  });
}

/** Label tallies across a set of calls, ordered by labelset then by descending count. */
export function facetsFor(calls: CallSummary[]): FacetCount[] {
  const tally = new Map<string, FacetCount>();
  for (const c of calls) {
    for (const l of c.labels) {
      const key = `${l.labelset}/${l.label}`;
      const hit = tally.get(key);
      if (hit) hit.count++;
      else tally.set(key, { labelset: l.labelset, label: l.label, count: 1 });
    }
  }
  return [...tally.values()].sort(
    (a, b) => a.labelset.localeCompare(b.labelset) || b.count - a.count || a.label.localeCompare(b.label),
  );
}

function distinct(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
}

/**
 * Paginated, filtered, sorted call list plus the facet tallies the filter bar renders.
 *
 * Facets are counted over the set that survives the structural filters but *before* the label
 * filter is applied, which is what makes a facet list usable: selecting "Complaint" must not
 * collapse every other facet to zero.
 */
export async function listCalls(rt: Runtime, opts: ListOptions = {}): Promise<CallPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const q = opts.q?.trim();
  const ids = q ? await searchIds(rt, q) : await catalogIds(rt);
  const all = await summariesFor(rt, ids);
  const structural = filterByAttributes(all, opts);
  const calls = sortCalls(filterByLabels(structural, opts.labels ?? []), opts.sort, opts.order);
  const total = calls.length;
  const start = (page - 1) * pageSize;
  return {
    items: calls.slice(start, start + pageSize),
    page,
    page_size: pageSize,
    total,
    next_page: start + pageSize < total,
    facets: facetsFor(structural),
    agents: distinct(structural.map((c) => c.agentName)),
    queues: distinct(structural.map((c) => c.queue)),
  };
}

/** Every call matching the filters, unpaginated — the export and bulk-selection code path. */
export async function matchingCalls(rt: Runtime, opts: ListOptions = {}): Promise<CallSummary[]> {
  const q = opts.q?.trim();
  const ids = q ? await searchIds(rt, q) : await catalogIds(rt);
  const all = await summariesFor(rt, ids);
  return sortCalls(filterByLabels(filterByAttributes(all, opts), opts.labels ?? []), opts.sort, opts.order);
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
