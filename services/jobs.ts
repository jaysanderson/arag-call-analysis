/**
 * Long-running work as platform Jobs: call ingestion (upload → transcribe → augment) and
 * provisioning (labelsets + agents, sequentially). Both are observable at
 * `/api/v1/jobs/{id}` and streamed at `/api/v1/jobs/{id}/events`.
 */

import { estimatedDurationSec, SCENARIOS, transcriptOf } from "@/lib/domain/scenarios";
import type { Runtime } from "@/lib/runtime";
import { agentConfigs, labelsetDefs } from "@/services/taxonomy-store";
import type { Job } from "@/vendor/arag-platform/src/index.ts";
import { deleteAllTasks, startAgent } from "./agents";
import { allSummaries, createCall, getCall, invalidateCall } from "./calls";
import { provisionLabelsets } from "./labelsets";

export const JOB_INGEST = "ingest-call";
export const JOB_PROVISION = "provision";
export const JOB_REANALYSE = "reanalyse-call";
export const JOB_SEED_SAMPLES = "seed-samples";

export interface IngestJobInput {
  /** Resource id created by the request handler; the job only waits for ARAG to finish with it. */
  callId: string;
  title: string;
  /**
   * Words taken from the call itself, used as the retrievability probe. A probe query with no
   * vocabulary overlap can report "not searchable" for a full minute while retrieval already
   * works (observed live against a real Knowledge Box, platform 0.1.3).
   */
  probeQuery?: string;
  /** True when a recording was uploaded (transcription takes longer than text indexing). */
  transcribed: boolean;
  /** Skip waiting for transcription (used by tests). */
  waitForProcessing?: boolean;
}

export interface IngestJobResult {
  callId: string;
  status: string;
  searchable: boolean;
}

export interface ProvisionJobInput {
  /** Also (re)start the data-augmentation agents. Default true. */
  agents?: boolean;
  /** Delete existing tasks first so the agents can be restarted. Default true. */
  resetTasks?: boolean;
}

export interface ProvisionJobResult {
  labelsets: string[];
  agents: Array<{ key: string; taskId?: string; error?: string }>;
  deletedTasks: number;
}

export interface SeedSamplesInput {
  /** How many of the shipped scenarios to load. Default: all of them. */
  count?: number;
  /** Provision the labelsets and agents first. Default true. */
  provision?: boolean;
}

export interface SeedSamplesResult {
  created: string[];
  skipped: string[];
  failed: Array<{ slug: string; error: string }>;
  provisioned: boolean;
}

export interface ReanalyseJobInput {
  callId: string;
  title?: string;
}

export interface ReanalyseJobResult {
  callId: string;
  status: string;
  /** True when the `call_analysis` / `call_metrics` fields are present after the refresh. */
  analysed: boolean;
  labels: number;
}

/** Register every job runner on the shared JobManager. Called once from the runtime builder. */
export function registerJobs(rt: Runtime): void {
  rt.jobs.register<IngestJobInput, IngestJobResult>(JOB_INGEST, async (ctx) => {
    const { callId, transcribed, waitForProcessing, probeQuery } = ctx.job.input;
    let status = "PENDING";
    let searchable = false;
    if (waitForProcessing !== false) {
      status =
        ((await ctx.stage(
          "process",
          transcribed ? "Transcribing the recording" : "Indexing the transcript",
          () => rt.arag.waitProcessed(callId, { timeoutMs: 10 * 60_000, signal: ctx.signal }),
          { soft: true, progress: 0.6 },
        )) as string | undefined) ?? "PENDING";
      searchable =
        ((await ctx.stage(
          "searchable",
          "Waiting for the call to become retrievable",
          () =>
            rt.arag.waitSearchable(callId, {
              query: probeQuery,
              timeoutMs: 60_000,
              signal: ctx.signal,
            }),
          { soft: true, progress: 0.9 },
        )) as boolean | undefined) ?? false;
      // `false` is not fatal: retrieval often works before the probe agrees. The call is usable.
      if (!searchable) ctx.emit("searchable", "skip", { message: "probe timed out; proceeding" });
    }
    invalidateCall(rt, callId);
    ctx.emit("ready", "ok", { message: "Call is available", progress: 1, data: { callId } });
    return { callId, status, searchable };
  });

  /**
   * Re-run the analysis for one call.
   *
   * ARAG's data-augmentation agents are Knowledge-Box-wide tasks, not per-resource invocations, so
   * this job does the honest per-call equivalent: it drops every cached derivative of the call,
   * waits for the Knowledge Box to report the resource fully processed, then re-reads it so any
   * labels or generated fields the agents have written since are picked up. The job reports
   * whether the analysis fields are actually present afterwards rather than claiming success
   * regardless. To re-run the agents themselves across the whole Knowledge Box, an operator uses
   * Agents & Taxonomy → Re-provision.
   */
  rt.jobs.register<ReanalyseJobInput, ReanalyseJobResult>(JOB_REANALYSE, async (ctx) => {
    const { callId } = ctx.job.input;
    invalidateCall(rt, callId);
    ctx.emit("invalidate", "ok", { message: "Cleared the cached analysis", progress: 0.2 });

    const status =
      ((await ctx.stage(
        "process",
        "Waiting for the Knowledge Box to finish processing",
        () => rt.arag.waitProcessed(callId, { timeoutMs: 5 * 60_000, signal: ctx.signal }),
        { soft: true, progress: 0.6 },
      )) as string | undefined) ?? "PENDING";

    invalidateCall(rt, callId);
    const call = await ctx.stage("reread", "Re-reading the call", () => getCall(rt, callId), {
      progress: 0.95,
    });
    const detail = call as Awaited<ReturnType<typeof getCall>>;
    const analysed = Boolean(detail.analysis?.executive_summary || detail.metrics?.call_reason);
    ctx.emit("ready", "ok", {
      message: analysed ? "Analysis refreshed" : "Refreshed; the agents have not written an analysis yet",
      progress: 1,
      data: { callId },
    });
    return { callId, status, analysed, labels: detail.labels.length };
  });

  /**
   * Load the sample dataset — the "Try with sample calls" path, and the only way a fresh live
   * Knowledge Box gets something to look at without anyone hunting for recordings.
   *
   * The taxonomy is provisioned first so the agents are running *before* the calls land: a call
   * uploaded ahead of its labeler is classified late or not at all, which is exactly the confusing
   * half-finished state onboarding is supposed to avoid. Uploads are then sequential rather than
   * parallel, to stay well inside the Knowledge Box's ingest rate.
   */
  rt.jobs.register<SeedSamplesInput, SeedSamplesResult>(JOB_SEED_SAMPLES, async (ctx) => {
    const count = Math.min(SCENARIOS.length, Math.max(1, ctx.job.input?.count ?? SCENARIOS.length));
    const wanted = SCENARIOS.slice(0, count);
    const result: SeedSamplesResult = { created: [], skipped: [], failed: [], provisioned: false };

    if (ctx.job.input?.provision !== false) {
      await ctx.stage(
        "provision",
        "Creating labelsets and starting the agents",
        async () => {
          await provisionLabelsets(rt);
          for (const def of agentConfigs(rt).filter((a) => a.enabled)) {
            try {
              await startAgent(rt, def);
              await rt.arag.waitTasksIdle({ graceMs: 1_000, timeoutMs: 4 * 60_000, signal: ctx.signal });
            } catch (err) {
              // A taxonomy that is already provisioned rejects a duplicate task; that is not a
              // reason to abandon the seed.
              ctx.emit("provision", "skip", { message: (err as Error).message });
            }
          }
          result.provisioned = true;
        },
        { soft: true, progress: 0.15 },
      );
    }

    // Slugs already present are skipped rather than duplicated, so the action is safely
    // repeatable. If this read fails the job fails with it: swallowing the error into an empty
    // set would turn a transient hiccup into a duplicate of the entire sample dataset.
    const existing = new Set(
      (
        await ctx.stage("inventory", "Checking what is already here", () => allSummaries(rt), {
          progress: 0.2,
        })
      )?.map((c) => c.slug) ?? [],
    );

    let done = 0;
    for (const sc of wanted) {
      // The uploads are emitted rather than staged, so nothing else in this loop consults the
      // abort signal: without this, Cancel marked the job cancelled and the remaining twenty-odd
      // resources were still created in the Knowledge Box. Against the in-process mock the job
      // finishes in under a second and it never showed; on a live Knowledge Box it takes minutes,
      // which is exactly when someone presses Cancel.
      ctx.check();
      done++;
      const progress = 0.15 + (0.8 * done) / wanted.length;
      if (existing.has(sc.slug)) {
        result.skipped.push(sc.slug);
        ctx.emit(`skip:${sc.slug}`, "skip", { message: `${sc.title} is already here`, progress });
        continue;
      }
      try {
        const id = await createCall(rt, {
          title: sc.title,
          slug: sc.slug,
          transcript: transcriptOf(sc),
          agentName: sc.agentName,
          memberId: sc.memberId,
          queue: sc.queue,
          createdISO: sc.createdISO,
          durationSec: estimatedDurationSec(sc),
        });
        result.created.push(id);
        ctx.emit(`upload:${sc.slug}`, "ok", { message: `Added ${sc.title}`, progress });
      } catch (err) {
        result.failed.push({ slug: sc.slug, error: (err as Error).message });
        ctx.emit(`upload:${sc.slug}`, "error", { message: (err as Error).message, progress });
      }
    }

    rt.cache.clear();
    ctx.emit("done", "ok", {
      message: `${result.created.length} sample call${result.created.length === 1 ? "" : "s"} added`,
      progress: 1,
    });
    return result;
  });

  rt.jobs.register<ProvisionJobInput, ProvisionJobResult>(JOB_PROVISION, async (ctx) => {
    const input = ctx.job.input ?? {};
    const result: ProvisionJobResult = { labelsets: [], agents: [], deletedTasks: 0 };

    result.labelsets =
      ((await ctx.stage(
        "labelsets",
        `Creating ${labelsetDefs(rt).length} labelsets`,
        () => provisionLabelsets(rt),
        { progress: 0.25 },
      )) as string[] | undefined) ?? [];

    if (input.agents !== false) {
      if (input.resetTasks !== false) {
        result.deletedTasks =
          ((await ctx.stage("reset-tasks", "Removing existing agent tasks", () => deleteAllTasks(rt), {
            soft: true,
            progress: 0.35,
          })) as number | undefined) ?? 0;
      }
      // One running task per operation type: start each agent, then wait for the KB to go idle.
      // A disabled agent is skipped rather than started with `on: 0` — an agent switched off in
      // Taxonomy should leave no task behind at all.
      const enabled = agentConfigs(rt).filter((a) => a.enabled);
      let i = 0;
      for (const def of enabled) {
        i++;
        const progress = 0.35 + (0.6 * i) / enabled.length;
        try {
          const taskId = (await ctx.stage(
            `agent:${def.key}`,
            `Starting ${def.key} (${def.type})`,
            () => startAgent(rt, def),
            { progress },
          )) as string;
          result.agents.push({ key: def.key, taskId });
          await ctx.stage(
            `settle:${def.key}`,
            `Waiting for ${def.key} to finish`,
            () => rt.arag.waitTasksIdle({ graceMs: 1_000, timeoutMs: 8 * 60_000, signal: ctx.signal }),
            { soft: true, progress },
          );
        } catch (err) {
          result.agents.push({ key: def.key, error: (err as Error).message });
        }
      }
    }
    rt.cache.clear();
    ctx.emit("done", "ok", { message: "Provisioning complete", progress: 1 });
    return result;
  });
}

/**
 * Public shape of a job (also the OpenAPI `Job` schema).
 *
 * A failed job's error message can name the upstream operation that failed ("ARAG POST /catalog
 * failed with HTTP 500"). That is useful to an operator and needless architecture disclosure to an
 * anonymous caller, so it is replaced with a generic message unless the caller is an admin.
 */
export function jobView(job: Job, opts: { admin?: boolean } = {}): Record<string, unknown> {
  const error = job.error
    ? opts.admin
      ? job.error
      : { message: "The job failed. Ask an administrator to check the logs.", kind: job.error.kind }
    : undefined;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    message: job.message,
    ref: job.ref,
    result: job.result,
    error,
    events: job.events,
    durationsMs: job.durationsMs,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}
