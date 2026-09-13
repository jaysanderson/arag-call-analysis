"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { IconUpload } from "@/components/icons";
import { ErrorState, useToast } from "@/components/kit";

/**
 * Upload a call: choose a file or paste a transcript, add what the recording system does not
 * carry, then watch the real ingest job run.
 *
 * Progress is the job's own stage stream (`GET /api/v1/jobs/{id}/events`), so the labels on screen
 * are the labels the server emitted — the UI never invents a stage name or a percentage. If the
 * stream fails, it falls back to polling the job rather than freezing at whatever it last saw.
 */

const ACCEPTED = ".mp3,.m4a,.wav,.ogg,.webm,.mp4,.mov,.txt,.md";
const AUDIO_VIDEO = /^(audio|video)\//;

interface JobEvent {
  stage?: string;
  message?: string;
  progress?: number;
  status?: string;
}

interface JobView {
  id: string;
  status: string;
  progress?: number;
  message?: string;
  stage?: string;
  events?: Array<{ stage: string; status: string; message?: string; ms?: number }>;
  result?: { callId?: string };
  error?: { message?: string };
}

export function UploadFlow({ maxBytes }: { maxBytes: number }) {
  const { toast, show } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [useTranscript, setUseTranscript] = useState(false);
  const [title, setTitle] = useState("");
  const [agentName, setAgentName] = useState("");
  const [queue, setQueue] = useState("");
  const [memberId, setMemberId] = useState("");
  const [created, setCreated] = useState("");
  const [drag, setDrag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const step = job ? 3 : file || transcript.trim() ? 2 : 1;

  const pick = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (f.size === 0) {
      setError(`${f.name} is empty.`);
      return;
    }
    if (f.size > maxBytes) {
      setError(
        `${f.name} is ${(f.size / 1_048_576).toFixed(1)} MB; the limit is ${Math.round(maxBytes / 1_048_576)} MB.`,
      );
      return;
    }
    setFile(f);
    setUseTranscript(false);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("A title is required — it is how the call is found later.");
      return;
    }
    const form = new FormData();
    form.set("title", title.trim());
    if (agentName) form.set("agent_name", agentName);
    if (queue) form.set("queue", queue);
    if (memberId) form.set("member_id", memberId);
    if (created) form.set("created", new Date(created).toISOString());
    if (useTranscript || (file && !AUDIO_VIDEO.test(file.type))) {
      const text = useTranscript ? transcript : await file!.text();
      if (!text.trim()) {
        setError("The transcript is empty.");
        return;
      }
      form.set("transcript", text);
    } else if (file) {
      form.set("recording", file);
    } else {
      setError("Choose a recording or paste a transcript.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/calls", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.title ?? `Upload failed (${res.status})`);
      setCallId(body.call?.id ?? null);
      setJob(body.job);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setTranscript("");
    setTitle("");
    setAgentName("");
    setQueue("");
    setMemberId("");
    setCreated("");
    setJob(null);
    setCallId(null);
    setError(null);
  };

  /**
   * Follow the job's own event stream, polling as a fallback so a proxy that buffers SSE cannot
   * leave the screen stuck on "running".
   *
   * The effect is keyed on the job *id*, not on the job object. Keying it on the object would
   * make every message it receives tear the EventSource down and open a new one — a reconnect
   * loop for the life of the upload, which is the opposite of a stream.
   */
  const jobId = job?.id;
  const finished = job?.status === "succeeded" || job?.status === "failed";
  const notify = useRef(show);
  notify.current = show;

  useEffect(() => {
    if (!jobId || finished) return;
    let stopped = false;
    const source = new EventSource(`/api/v1/jobs/${jobId}/events`);
    source.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as JobEvent;
        setJob((j) => (j ? { ...j, ...data, id: jobId } : j));
      } catch {
        /* a malformed frame is not worth tearing the stream down for */
      }
    };
    source.onerror = () => source.close();
    const poll = setInterval(async () => {
      if (stopped) return;
      try {
        const r = await fetch(`/api/v1/jobs/${jobId}`);
        if (!r.ok) return;
        const j = (await r.json()) as JobView;
        setJob(j);
        if (j.status === "succeeded" || j.status === "failed") {
          clearInterval(poll);
          source.close();
          if (j.status === "succeeded") notify.current("Call ready");
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(poll);
      source.close();
    };
  }, [jobId, finished]);

  if (job) {
    return (
      <>
        <Stepper step={3} />
        <JobProgress job={job} callId={callId} onAnother={reset} />
        {toast}
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <Stepper step={step} />
      {error && (
        <div style={{ marginTop: 16 }}>
          <ErrorState title="The call could not be uploaded." detail={error} />
        </div>
      )}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 340px", minWidth: 0 }}>
          {!useTranscript && (
            <>
              <button
                type="button"
                className={`arag-dropzone${drag ? " drag" : ""}`}
                style={{ width: "100%" }}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  pick(e.dataTransfer.files?.[0] ?? null);
                }}
              >
                <span className="icon">
                  <IconUpload size={32} />
                </span>
                <strong>Drop a recording or transcript here</strong>
                <span className="small">
                  MP3, M4A, WAV, MP4, MOV or a .txt transcript · up to {Math.round(maxBytes / 1_048_576)} MB
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                hidden
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
            </>
          )}

          {file && !useTranscript && (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid var(--arag-border)",
                borderRadius: "var(--arag-radius)",
                padding: "10px 12px",
                fontSize: 13,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{file.name}</strong>
                <div className="small" style={{ color: "var(--arag-text-subtle)" }}>
                  {(file.size / 1_048_576).toFixed(1)} MB · {file.type || "unknown type"}
                </div>
              </span>
              <button type="button" className="arag-btn ghost sm" onClick={() => setFile(null)}>
                Remove
              </button>
            </div>
          )}

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={useTranscript}
              onChange={(e) => {
                setUseTranscript(e.target.checked);
                if (e.target.checked) setFile(null);
              }}
            />
            Paste a transcript instead of a file
          </label>

          {useTranscript && (
            <textarea
              className="arag-textarea"
              style={{ marginTop: 8, minHeight: 200 }}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={"Agent: Thank you for calling…\nMember: I have a question about my bill."}
              aria-label="Transcript"
            />
          )}
        </div>

        <div style={{ flex: "1 1 300px", minWidth: 0, display: "grid", gap: 12 }}>
          <div className="arag-field">
            <label htmlFor="up-title">Title</label>
            <input
              id="up-title"
              className="arag-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
            <span className="arag-help">
              How this call is found later. The filename is used if you leave it.
            </span>
          </div>
          <div className="arag-field">
            <label htmlFor="up-created">Call time</label>
            <input
              id="up-created"
              className="arag-input"
              type="datetime-local"
              value={created}
              onChange={(e) => setCreated(e.target.value)}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="arag-field">
              <label htmlFor="up-agent">Agent name</label>
              <input
                id="up-agent"
                className="arag-input"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="arag-field">
              <label htmlFor="up-queue">Queue</label>
              <input
                id="up-queue"
                className="arag-input"
                value={queue}
                onChange={(e) => setQueue(e.target.value)}
                maxLength={120}
              />
            </div>
          </div>
          <div className="arag-field">
            <label htmlFor="up-member">Member reference</label>
            <input
              id="up-member"
              className="arag-input"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              maxLength={120}
            />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="arag-btn secondary" onClick={reset}>
              Clear
            </button>
            <button type="submit" className="arag-btn" disabled={submitting}>
              {submitting ? "Uploading…" : "Upload call"}
            </button>
          </div>
        </div>
      </div>
      {toast}
    </form>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Choose a file", "Add details", "Processing"];
  return (
    <div className="ca-stepper" data-testid="upload-stepper">
      {/* The steps and separators are direct children of the stepper: the kit styles them with a
          child combinator, and wrapping each pair in a span silently loses every rule. */}
      {steps.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && <span className="sep" />}
          <span className={`step${step === i + 1 ? " current" : step > i + 1 ? " done" : ""}`}>
            <span className="n">{i + 1}</span>
            {label}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function JobProgress({
  job,
  callId,
  onAnother,
}: {
  job: JobView;
  callId: string | null;
  onAnother: () => void;
}) {
  const pct = Math.round((job.progress ?? 0) * 100);
  const failed = job.status === "failed";
  const done = job.status === "succeeded";
  return (
    <section className="arag-card" style={{ marginTop: 16, padding: 16 }} data-testid="ingest-progress">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>
          {failed ? "Ingest failed" : done ? "Call is ready" : "Processing"}
        </h2>
        <span className="small" style={{ marginLeft: "auto", color: "var(--arag-text-subtle)" }}>
          {job.message ?? job.stage ?? job.status}
        </span>
      </div>

      <div className="arag-progress" style={{ marginTop: 12 }}>
        <i
          style={{
            width: `${failed ? 100 : pct}%`,
            background: failed ? "var(--arag-danger-fg)" : undefined,
          }}
        />
      </div>

      {job.events && job.events.length > 0 && (
        <ol className="arag-steps" style={{ marginTop: 14 }}>
          {job.events.map((e, i) => (
            <li
              key={`${e.stage}-${i}`}
              className={
                e.status === "ok"
                  ? "ok"
                  : e.status === "error"
                    ? "error"
                    : e.status === "skip"
                      ? "skip"
                      : "active"
              }
            >
              <span className="ic" />
              <span>
                {e.message ?? e.stage}
                {typeof e.ms === "number" && <span className="meta">{(e.ms / 1000).toFixed(1)} s</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {failed && job.error?.message && (
        <div className="arag-alert error" style={{ marginTop: 12 }}>
          {job.error.message}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {callId && (
          <Link href={`/calls/${callId}`} className="arag-btn sm">
            Open the call
          </Link>
        )}
        <Link href="/upload/history" className="arag-btn secondary sm">
          Ingest history
        </Link>
        <button type="button" className="arag-btn secondary sm" onClick={onAnother}>
          Upload another
        </button>
      </div>
    </section>
  );
}
