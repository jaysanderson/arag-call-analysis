"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IconCheck } from "@/components/icons";
import { ErrorState, Skeleton, useToast } from "@/components/kit";

/**
 * First run: the four things that have to be true before this product is useful, each showing its
 * real state, and the one-click path that makes them true with the sample dataset.
 *
 * This is also the demo. There is no demo-only route and no scripted overlay: "Try with sample
 * calls" runs the same seeding job an operator would run, through the same screens, and the
 * showcase recording simply follows a person doing it.
 */

interface Step {
  key: string;
  title: string;
  detail: string;
  state: "done" | "current" | "blocked" | "pending";
  actionLabel?: string;
  actionHref?: string;
}

interface OnboardingState {
  complete: boolean;
  mode: "mock" | "live";
  callCount: number;
  analysedCount: number;
  steps: Step[];
  sample: { available: boolean; count: number; seeded: boolean; jobId?: string };
}

interface JobView {
  id: string;
  status: string;
  progress?: number;
  message?: string;
  events?: Array<{ stage: string; status: string; message?: string; ms?: number }>;
  error?: { message?: string };
}

export function Welcome() {
  const { toast, show } = useToast();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/v1/onboarding")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.detail ?? `Request failed (${r.status})`);
        return body as OnboardingState;
      })
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const seed = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provision: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`);
      setJob(body as JobView);
    } catch (e) {
      show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Follow the seeding job to completion, then refresh the checklist from the live system.
   * Keyed on the job id, not the job object: keying it on the object restarts the interval on
   * every tick.
   */
  const jobId = job?.id;
  const finished = job?.status === "succeeded" || job?.status === "failed";

  useEffect(() => {
    if (!jobId || finished) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/v1/jobs/${jobId}`);
        if (!r.ok) return;
        const j = (await r.json()) as JobView;
        setJob(j);
        if (j.status === "succeeded" || j.status === "failed") load();
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [jobId, finished, load]);

  if (error)
    return (
      <ErrorState
        title="The first-run checks could not run."
        detail={error}
        action={
          <button type="button" className="arag-btn secondary sm" onClick={load}>
            Try again
          </button>
        }
      />
    );

  if (!state)
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Skeleton height={22} width="40%" />
        <Skeleton height={72} />
        <Skeleton height={72} />
      </div>
    );

  const ready = state.callCount > 0;

  return (
    <>
      <section style={{ maxWidth: 720 }}>
        <p style={{ fontSize: 15, color: "var(--arag-text-muted)", marginTop: 0 }}>
          {state.mode === "mock"
            ? "This deployment runs against an in-process sample Knowledge Box, so you can evaluate the whole product without credentials. Everything you do here is real behaviour against the real API."
            : "Connected to a live Knowledge Box. Four things have to be true before calls start being classified."}
        </p>

        <ol style={{ listStyle: "none", padding: 0, margin: "20px 0 0", display: "grid", gap: 10 }}>
          {state.steps.map((s, i) => (
            <li
              key={s.key}
              className="arag-card"
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                padding: 16,
                opacity: s.state === "pending" ? 0.6 : 1,
              }}
              data-testid={`onboarding-step-${s.key}`}
            >
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 26,
                  height: 26,
                  flex: "0 0 26px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background:
                    s.state === "done"
                      ? "var(--arag-accent-500)"
                      : s.state === "current"
                        ? "var(--arag-brand-600)"
                        : "var(--arag-brand-50)",
                  color: s.state === "done" || s.state === "current" ? "#fff" : "var(--arag-text-subtle)",
                }}
              >
                {s.state === "done" ? <IconCheck size={14} /> : i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, color: "var(--arag-ink-950)", fontSize: 14 }}>{s.title}</div>
                <p className="small" style={{ margin: "3px 0 0", color: "var(--arag-text-muted)" }}>
                  {s.detail}
                </p>
              </div>
              {s.state !== "done" && s.actionHref && s.state !== "pending" && (
                <Link href={s.actionHref} className="arag-btn secondary sm">
                  {s.actionLabel}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      {job ? (
        <section
          className="arag-card"
          style={{ marginTop: 24, padding: 16, maxWidth: 720 }}
          data-testid="seed-progress"
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 650 }}>
            {job.status === "failed"
              ? "Loading the sample dataset failed"
              : job.status === "succeeded"
                ? "Sample dataset loaded"
                : "Loading the sample dataset"}
          </h2>
          <div className="arag-progress">
            <i style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }} />
          </div>
          <p className="small" style={{ marginTop: 8, color: "var(--arag-text-muted)" }}>
            {job.message ?? job.status}
          </p>
          {job.error?.message && <div className="arag-alert error">{job.error.message}</div>}
          {job.status === "succeeded" && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Link href="/" className="arag-btn sm">
                See the analysis
              </Link>
              <Link href="/calls" className="arag-btn secondary sm">
                Browse the calls
              </Link>
            </div>
          )}
        </section>
      ) : (
        <section style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 16, maxWidth: 720 }}>
          <div className="arag-card pad" style={{ flex: "1 1 300px" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 650 }}>Try with sample calls</h2>
            <p className="small" style={{ marginTop: 0 }}>
              {state.sample.count} synthetic contact-centre calls — complaints, escalations, cross-sell
              attempts, compliance disclosures — with the taxonomy provisioned and the agents started. Nothing
              here is real customer data.
            </p>
            {ready ? (
              <Link href="/" className="arag-btn sm" data-testid="see-the-analysis">
                See the analysis
              </Link>
            ) : (
              <button
                type="button"
                className="arag-btn sm"
                onClick={seed}
                disabled={busy}
                data-testid="try-sample-calls"
              >
                {busy ? "Starting…" : "Try with sample calls"}
              </button>
            )}
          </div>
          <div className="arag-card pad" style={{ flex: "1 1 260px" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 650 }}>Use your own</h2>
            <p className="small" style={{ marginTop: 0 }}>
              Upload a recording or paste a transcript. It is transcribed, classified and analysed the same
              way every sample call was.
            </p>
            <Link href="/upload" className="arag-btn secondary sm">
              Upload a call
            </Link>
          </div>
        </section>
      )}
      {toast}
    </>
  );
}
