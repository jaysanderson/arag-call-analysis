/**
 * Long-running work as platform Jobs: call ingestion (upload → transcribe → augment) and
 * provisioning (labelsets + agents, sequentially). Both are observable at
 * `/api/v1/jobs/{id}` and streamed at `/api/v1/jobs/{id}/events`.
 */

import { AGENTS, ALL_LABELSETS } from "@/lib/domain/taxonomy";
import type { Runtime } from "@/lib/runtime";
import type { Job } from "@/vendor/arag-platform/src/index.ts";
import { deleteAllTasks, startAgent } from "./agents";
import { invalidateCall } from "./calls";
import { provisionLabelsets } from "./labelsets";

export const JOB_INGEST = "ingest-call";
export const JOB_PROVISION = "provision";

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

  rt.jobs.register<ProvisionJobInput, ProvisionJobResult>(JOB_PROVISION, async (ctx) => {
    const input = ctx.job.input ?? {};
    const result: ProvisionJobResult = { labelsets: [], agents: [], deletedTasks: 0 };

    result.labelsets =
      ((await ctx.stage(
        "labelsets",
        `Creating ${ALL_LABELSETS.length} labelsets`,
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
      let i = 0;
      for (const def of AGENTS) {
        i++;
        const progress = 0.35 + (0.6 * i) / AGENTS.length;
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
