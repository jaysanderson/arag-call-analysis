/** Admin read models: KB health, redacted config, usage counters and the log ring buffer. */

import type { Branding } from "@/lib/branding";
import { AGENTS, ALL_LABELSETS } from "@/lib/domain/taxonomy";
import type { Runtime } from "@/lib/runtime";
import { APP_VERSION, PLATFORM_VERSION } from "@/lib/version";
import type { LogLevel } from "@/vendor/arag-platform/src/config/env.ts";
import { describeEnv } from "@/vendor/arag-platform/src/index.ts";

export interface HealthView {
  ok: boolean;
  version: string;
  platformVersion: string;
  uptimeSec: number;
  mock: boolean;
  arag: {
    ok: boolean;
    kbId: string;
    baseUrl: string;
    resources?: number;
    generativeModel?: string;
    error?: string;
    ms: number;
  };
  jobs: { queued: number; running: number; failed: number };
  cache: { entries: number; hits: number; misses: number };
}

/** Live KB connection test: catalog read + configuration (model), plus local service state. */
export async function health(rt: Runtime): Promise<HealthView> {
  const arag = await rt.arag.health();
  // The service-account token must never reach a browser: only the KB id prefix is exposed.
  const redactedKb = arag.kbId ? `${arag.kbId.slice(0, 8)}…` : "";
  const cache = rt.cache.stats();
  return {
    ok: arag.ok,
    version: APP_VERSION,
    platformVersion: PLATFORM_VERSION,
    uptimeSec: Math.round((Date.now() - rt.startedAt) / 1000),
    mock: rt.env.arag.mock,
    arag: { ...arag, kbId: redactedKb },
    jobs: {
      queued: rt.jobs.list({ status: "queued" }).length,
      running: rt.jobs.list({ status: "running" }).length,
      failed: rt.jobs.list({ status: "failed" }).length,
    },
    cache: { entries: cache.entries, hits: cache.hits, misses: cache.misses },
  };
}

export interface ConfigView {
  version: string;
  platformVersion: string;
  env: Record<string, unknown>;
  taxonomy: { labelsets: number; resourceLabelsets: string[]; agents: string[] };
  cache: { ttlMs: number };
  limits: { maxQuestionChars: number; maxBodyBytes: number; rateLimitRps: number; rateLimitBurst: number };
  /** The effective white-label identity, so an operator can confirm what partners will see. */
  branding: Branding;
}

/**
 * Redacted configuration for the admin panel. `describeEnv` masks secrets; the Knowledge Box id is
 * additionally truncated here so the same invariant holds as in `health()` — the full id never
 * reaches a browser from any surface.
 *
 * The id shown is the one the client is actually using, not the raw environment variable: in mock
 * mode the variable is empty while the effective Knowledge Box is the in-process mock, and an
 * operator needs to see which one is really in play.
 */
export function config(rt: Runtime): ConfigView {
  const env = describeEnv(rt.env) as Record<string, unknown> & { arag?: Record<string, unknown> };
  if (env.arag) env.arag = { ...env.arag, kbId: rt.arag.kbId ? `${rt.arag.kbId.slice(0, 8)}…` : "" };
  return {
    version: APP_VERSION,
    platformVersion: PLATFORM_VERSION,
    env,
    taxonomy: {
      labelsets: ALL_LABELSETS.length,
      resourceLabelsets: ALL_LABELSETS.filter((l) => l.kind === "RESOURCES").map((l) => l.id),
      agents: AGENTS.map((a) => a.key),
    },
    branding: rt.branding,
    cache: { ttlMs: rt.env.cacheTtlMs },
    limits: {
      maxQuestionChars: rt.env.maxQuestionChars,
      maxBodyBytes: rt.env.maxBodyBytes,
      rateLimitRps: rt.env.rateLimitRps,
      rateLimitBurst: rt.env.rateLimitBurst,
    },
  };
}

export interface UsageView {
  uptimeSec: number;
  requests: number;
  errors: number;
  asks: number;
  uploads: number;
  deletes: number;
  byRoute: Record<string, number>;
  arag: { calls: number; errors: number; avgMs: number };
  tokens: { input: number; output: number };
  jobs: { total: number; byStatus: Record<string, number> };
  cache: ReturnType<Runtime["cache"]["stats"]>;
}

export function usage(rt: Runtime): UsageView {
  const jobs = rt.jobs.list({});
  const byStatus: Record<string, number> = {};
  for (const j of jobs) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
  const u = rt.usage;
  return {
    uptimeSec: Math.round((Date.now() - rt.startedAt) / 1000),
    requests: u.requests,
    errors: u.errors,
    asks: u.asks,
    uploads: u.uploads,
    deletes: u.deletes,
    byRoute: u.byRoute,
    arag: {
      calls: u.aragCalls,
      errors: u.aragErrors,
      avgMs: u.aragCalls ? Math.round(u.aragMs / u.aragCalls) : 0,
    },
    tokens: { input: u.tokensIn, output: u.tokensOut },
    jobs: { total: jobs.length, byStatus },
    cache: rt.cache.stats(),
  };
}

export function logs(
  rt: Runtime,
  opts: { level?: string; contains?: string; limit?: number } = {},
): { items: unknown[] } {
  const level = ["debug", "info", "warn", "error"].includes(opts.level ?? "")
    ? (opts.level as LogLevel)
    : undefined;
  return {
    items: rt.log.recent({ level, contains: opts.contains, limit: Math.min(500, opts.limit ?? 200) }),
  };
}
