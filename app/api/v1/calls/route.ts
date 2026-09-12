import { jsonResponse, route } from "@/lib/api";
import { createCall, listCalls } from "@/services/calls";
import { JOB_INGEST, jobView } from "@/services/jobs";
import { badRequest, HttpError } from "@/vendor/arag-platform/src/index.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ path: "/api/v1/calls", method: "get" }, async (ctx) => {
  const q = ctx.query.q as string | undefined;
  const label = (ctx.query.label as string[] | undefined) ?? [];
  return listCalls(ctx.rt, {
    q,
    labels: label,
    page: (ctx.query.page as number | undefined) ?? 1,
    pageSize: (ctx.query.page_size as number | undefined) ?? 50,
  });
});

const ALLOWED_RECORDING_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;

function field(form: FormData, name: string, max = 200): string | undefined {
  const v = form.get(name);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  if (t.length > max) throw badRequest(`${name} must be at most ${max} characters`);
  return t;
}

/**
 * Upload a call. The ARAG resource is created inline (so the caller gets an id and a `Location`
 * immediately) and the slow part — transcription and retrievability — is tracked by a job.
 */
export const POST = route(
  { path: "/api/v1/calls", method: "post", auth: "api", body: "multipart", bodyLimit: MAX_RECORDING_BYTES },
  async (ctx) => {
    const form = ctx.form!;
    const title = field(form, "title");
    if (!title) throw badRequest("title is required");

    const transcript = form.get("transcript");
    const recording = form.get("recording");
    const hasTranscript = typeof transcript === "string" && transcript.trim().length > 0;
    const hasRecording = recording instanceof File && recording.size > 0;
    if (!hasTranscript && !hasRecording)
      throw badRequest("Provide either a `transcript` text field or a `recording` file");

    let recordingInput: { bytes: Uint8Array; filename: string; contentType: string } | undefined;
    if (hasRecording) {
      const file = recording as File;
      const contentType = (file.type || "application/octet-stream").toLowerCase();
      if (!ALLOWED_RECORDING_TYPES.includes(contentType))
        throw new HttpError(
          415,
          "Unsupported media type",
          `recording must be one of: ${ALLOWED_RECORDING_TYPES.join(", ")}`,
        );
      if (file.size > MAX_RECORDING_BYTES)
        throw new HttpError(413, "Payload too large", `recording exceeds ${MAX_RECORDING_BYTES} bytes`);
      recordingInput = {
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name || "recording",
        contentType,
      };
    }

    const durationRaw = field(form, "duration_sec", 20);
    const duration = durationRaw ? Number(durationRaw) : undefined;
    if (durationRaw && !Number.isFinite(duration)) throw badRequest("duration_sec must be a number");
    const created = field(form, "created", 40);
    if (created && Number.isNaN(Date.parse(created)))
      throw badRequest("created must be an ISO-8601 date-time");

    const callId = await createCall(ctx.rt, {
      title,
      agentName: field(form, "agent_name", 120),
      memberId: field(form, "member_id", 120),
      queue: field(form, "queue", 120),
      createdISO: created,
      durationSec: duration,
      transcript: hasTranscript ? (transcript as string) : undefined,
      recording: recordingInput,
    });

    const job = ctx.rt.jobs.submit(
      JOB_INGEST,
      {
        callId,
        title,
        transcribed: Boolean(recordingInput),
        // Seed the retrievability probe with the call's own words, not an instruction.
        probeQuery: (hasTranscript ? (transcript as string) : title).slice(0, 200),
      },
      { ref: callId },
    );
    ctx.log.info("calls.created", { callId, jobId: job.id, transcribed: Boolean(recordingInput) });

    return jsonResponse({ job: jobView(job), call: { id: callId, title } }, 202, {
      Location: `/api/v1/calls/${callId}`,
    });
  },
);
