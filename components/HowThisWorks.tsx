"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type FlowStep = { label: string; detail: string };
type PageFlow = {
  title: string;
  whatItDoes: string;
  why: string;
  steps: FlowStep[];
};

/**
 * Solution-architecture reveal content (table-stakes gate 11 / standard B12):
 * unique per route, three parts each — the real technical flow this page's
 * own code takes, what the page is doing in plain terms, and the value it
 * brings. Nothing here is generic; every mechanism named is one this app's
 * server code genuinely calls (see lib/arag.ts, lib/calls.ts, app/api/*).
 */
const ADMIN_FLOW: PageFlow = {
  title: "Admin - how this works",
  whatItDoes:
    "Every panel here is a live read of the running service and its Knowledge Box through /api/v1/admin/* - health, effective configuration, usage counters, job history, logs, agent status and the cache.",
  why: "An operator can prove the KB connection, watch a provisioning run, read the last 500 log lines and clear a stale cache without shell access to the machine.",
  steps: [
    {
      label: "Admin token",
      detail:
        "POST /api/v1/admin/login exchanges ADMIN_TOKEN for an HttpOnly cookie; the token never lives in browser JavaScript.",
    },
    {
      label: "KB connection test",
      detail:
        "GET /api/v1/admin/health runs a real catalog read plus a configuration read against the Knowledge Box and reports the generative model and resource count.",
    },
    {
      label: "Provisioning job",
      detail:
        "POST /api/v1/admin/provision creates every labelset and restarts the three data-augmentation agents one at a time (ARAG allows one running task per operation type), streamed as job events.",
    },
    {
      label: "Cache control",
      detail:
        "GET/POST /api/v1/admin/cache shows and invalidates the catalog + per-call summary cache that keeps the dashboard off the N+1 path.",
    },
  ],
};

const FLOWS: { match: (path: string) => boolean; flow: PageFlow }[] = [
  {
    match: (p) => p === "/",
    flow: {
      title: "Dashboard - how this works",
      whatItDoes:
        "Every KPI and chart on this page is aggregated live from each call's own AI-generated metrics - nothing here is a hand-entered number.",
      why: "A supervisor gets a real-time read on the whole queue - resolution rate, complaint rate, cross-sell performance - without anyone tagging a single call by hand.",
      steps: [
        {
          label: "Ingest",
          detail: "Each uploaded call recording is transcribed by ARAG into timestamped paragraphs.",
        },
        {
          label: "Data-Augmentation agents",
          detail:
            "A Labeler agent classifies the whole call (reason, outcome, sentiment); an Ask agent extracts a structured call_metrics field per call, parsed from the model's response server-side (ARAG's native DA JSON-schema output isn't available on this platform yet).",
        },
        {
          label: "Server proxy",
          detail:
            "This app's server (never the browser) calls the Knowledge Box catalog, reads each call's stored call_metrics field through a 60-second cache, and aggregates across all calls — one upstream fetch per call per window, not per view.",
        },
        {
          label: "Dashboard",
          detail:
            "The KPI tiles and charts render the aggregated result - every number here traces to a real ARAG-generated field.",
        },
      ],
    },
  },
  {
    match: (p) => p === "/calls",
    flow: {
      title: "Calls - how this works",
      whatItDoes:
        "This is every analyzed call, filterable by the labels ARAG assigned and searchable across full transcripts - not a keyword match on titles.",
      why: 'A team lead can find "every complaint call in Claims this week" in one click, and full-text search finds a call by what was actually said, not what it was named.',
      steps: [
        {
          label: "Labeler agent",
          detail:
            "A resource-level Labeler classified every call into facets - call reason, outcome, sentiment, line of business, disposition flags.",
        },
        {
          label: "Server proxy",
          detail:
            "The left-rail filters and the search box call this app's /api/v1/calls route, which calls ARAG's /find (semantic + keyword search across every transcript) or the plain catalog when no query is set.",
        },
        {
          label: "Live results",
          detail:
            "Matching calls render as cards, each carrying its real ARAG-assigned labels - no client-side guessing.",
        },
      ],
    },
  },
  {
    match: (p) => p.startsWith("/admin"),
    flow: ADMIN_FLOW,
  },
  {
    match: (p) => p.startsWith("/calls/"),
    flow: {
      title: "Call detail - how this works",
      whatItDoes:
        "The transcript, the paragraph-level moment labels, the AI analysis panel and the chat are all read from one ARAG resource - the media file and everything ARAG derived from it.",
      why: "An agent or QA reviewer can scrub straight to the moment a complaint was raised, read a synthesized scorecard instead of re-listening to the whole call, and ask a follow-up question that's answered ONLY from this call - grounded, cited, and provably not invented.",
      steps: [
        {
          label: "Transcription",
          detail:
            "ARAG transcribed the uploaded audio/video into paragraphs carrying start/end timestamps - that's what drives the media scrubber.",
        },
        {
          label: "Paragraph Labeler",
          detail:
            "A paragraph-level Labeler tagged individual transcript blocks (Complaint, Escalation, Cross-sell Pitch, PII, ...) - the chips under each transcript line.",
        },
        {
          label: "Ask agent (Generator)",
          detail:
            "A Data-Augmentation Ask agent wrote a structured call_analysis field per call - the executive summary, scorecard, complaint/cross-sell detail and notable quotes in the AI Analysis panel - parsed from the model's JSON response server-side (ARAG's native DA JSON-schema output isn't available on this platform yet).",
        },
        {
          label: "Scoped /ask + citations",
          detail:
            "The chat panel calls this app's own /api/v1/calls/{id}/ask route, which calls the Knowledge Box /ask scoped to resource_filters:[this call] with citations:true - the model can only answer from this call's own transcript.",
        },
        {
          label: "Citation resolution",
          detail:
            "Each citation is a char range into the transcript field. This app maps that range back to a paragraph and its timestamp, so clicking a citation scrubs the player and highlights the source line.",
        },
        {
          label: "REMi trust scoring",
          detail:
            "Once the answer finishes, the server scores it against the full set of retrieved transcript passages with a real /predict/remi call and appends the result to the stream - the confidence badge below the answer is that genuine score, shown qualitatively.",
        },
      ],
    },
  },
];

const DEFAULT_FLOW: PageFlow = FLOWS[0]!.flow;

function flowFor(path: string): PageFlow {
  return FLOWS.find((f) => f.match(path))?.flow ?? DEFAULT_FLOW;
}

export function HowThisWorks() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const flow = flowFor(pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How this works"
        className="ca-reveal-trigger inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
      >
        <svg
          aria-hidden="true"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 1.8-2.5 3.5" />
          <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
        </svg>
        {/* The label collapses to the icon in the band on a narrow screen; `aria-label` above
            keeps the accessible name either way. */}
        <span className="label">How this works</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-8 drawer-backdrop sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-ink-800 bg-ink-950 p-5 text-white shadow-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-xl font-semibold">{flow.title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-brand-100">{flow.whatItDoes}</p>

            <FlowDiagram steps={flow.steps} />

            <div className="mt-5 rounded-lg border border-accent-500/30 bg-accent-500/10 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-300">
                Why it matters
              </div>
              <p className="mt-1 text-sm text-white/90">{flow.why}</p>
            </div>

            <div className="mt-4 flex items-center gap-2 text-[11px] text-white/50">
              <span className="inline-block h-2 w-2 rounded-full bg-accent-400" />
              Built on Progress Agentic RAG - this is the real request/data flow this page uses, not a
              marketing diagram.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FlowDiagram({ steps }: { steps: FlowStep[] }) {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % steps.length), 2200);
    return () => clearInterval(t);
  }, [steps.length]);

  // The active step's node always scrolls into view - the auto-advance IS
  // the scroll affordance, so a step can never sit clipped off-screen with
  // no way to reach it (the defect a live QA pass caught: the row overflows
  // with no visible scroll cue, so trailing steps read as cut off).
  useEffect(() => {
    nodeRefs.current[active]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  const go = (i: number) => setActive(((i % steps.length) + steps.length) % steps.length);

  return (
    <div className="mt-5">
      <div className="relative">
        {/* Fade + arrow at both edges - an explicit, unmissable "there's more" cue,
            not just relying on the auto-scroll. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-ink-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-ink-950 to-transparent" />
        <button
          type="button"
          onClick={() => go(active - 1)}
          aria-label="Previous step"
          className="absolute left-0.5 top-1/2 z-20 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-ink-950/90 text-white/70 hover:text-white"
        >
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => go(active + 1)}
          aria-label="Next step"
          className="absolute right-0.5 top-1/2 z-20 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-ink-950/90 text-white/70 hover:text-white"
        >
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <div ref={scrollerRef} className="scroll-thin-x flex items-stretch gap-0 overflow-x-auto px-6 pb-2">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-stretch">
              <div
                ref={(el) => {
                  nodeRefs.current[i] = el;
                }}
                className={`w-40 shrink-0 rounded-lg border p-3 transition-colors ${
                  i === active
                    ? "border-accent-400 bg-accent-500/10 flow-node-active"
                    : "border-white/15 bg-white/5"
                }`}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wide ${i === active ? "text-accent-300" : "text-white/40"}`}
                >
                  Step {i + 1} of {steps.length}
                </div>
                <div className="mt-1 text-sm font-semibold text-white">{s.label}</div>
                <div className="mt-1 text-[11px] leading-snug text-white/60">{s.detail}</div>
              </div>
              {i < steps.length - 1 && (
                <svg
                  aria-hidden="true"
                  width="28"
                  height="100%"
                  viewBox="0 0 28 40"
                  className="shrink-0 self-center text-white/30"
                >
                  <line
                    x1="2"
                    y1="20"
                    x2="24"
                    y2="20"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="flow-line"
                  />
                  <path
                    d="M18 14l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dot pagination - makes "there are N steps" legible at a glance, never just implied by scroll. */}
      <div className="mt-2 flex justify-center gap-1.5">
        {steps.map((s, i) => (
          <button
            type="button"
            key={s.label}
            onClick={() => go(i)}
            aria-label={`Go to step ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-accent-400" : "w-1.5 bg-white/25"}`}
          />
        ))}
      </div>
    </div>
  );
}
