import Link from "next/link";
import { colorFor } from "@/lib/format";
import type { ConfidenceResult } from "@/lib/confidence";

export function Chip({ label, className, href }: { label: string; className?: string; href?: string }) {
  const cls = `inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${className ?? colorFor(label)}`;
  if (href) {
    return (
      <Link href={href} className={`${cls} transition hover:ring-2 hover:ring-brand-400 hover:ring-offset-1`}>
        {label}
      </Link>
    );
  }
  return <span className={cls}>{label}</span>;
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`arag-card shadow-sm ${className ?? ""}`}>{children}</div>;
}

/** Primary / secondary CTA — limited corner rounding, high contrast (standard B20). */
export function Button({
  children,
  href,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary";
  disabled?: boolean;
  className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "primary"
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : "border border-brand-600 bg-white text-brand-600 hover:bg-brand-50";
  const cls = `${base} ${styles} ${className ?? ""}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

type MediaType = "audio" | "video" | "transcript";

const MEDIA_BADGE: Record<MediaType, { label: string; cls: string; icon: React.ReactNode }> = {
  video: {
    label: "Video",
    cls: "bg-violet-100 text-violet-800",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="13" height="12" rx="2" />
        <path d="M15 10l6-3v10l-6-3" />
      </svg>
    ),
  },
  audio: {
    label: "Audio",
    cls: "bg-sky-100 text-sky-800",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14a8 8 0 0 1 16 0" />
        <rect x="2" y="13" width="4" height="7" rx="1.2" />
        <rect x="18" y="13" width="4" height="7" rx="1.2" />
      </svg>
    ),
  },
  transcript: {
    label: "Transcript",
    cls: "bg-slate-100 text-slate-700",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M14 3v6h6" />
        <path d="M8 13h8M8 17h5" />
      </svg>
    ),
  },
};

/** File-type badge (Video / Audio / Transcript) shown wherever a call is listed. */
export function MediaBadge({ type, className }: { type: string; className?: string }) {
  const m = MEDIA_BADGE[(type as MediaType)] ?? MEDIA_BADGE.transcript;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${m.cls} ${className ?? ""}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

/**
 * Consistent branded placeholder used wherever a call has no natural
 * "page-1" thumbnail (a phone call has no cover image) — the ui-polish
 * standard's refinement of gate B10: a CONSISTENT branded placeholder (a
 * type glyph on a tinted field) reads as intentional; the defect is an
 * inconsistent or generic one-off icon. The glyph and gradient are keyed
 * off the media type so a video, audio call and transcript are each
 * visually distinct at a glance, not one repeated stock icon.
 */
export function CallThumb({ type, className }: { type: string; className?: string }) {
  const m = MEDIA_BADGE[(type as MediaType)] ?? MEDIA_BADGE.transcript;
  const grad =
    type === "video"
      ? "from-violet-600 to-brand-700"
      : type === "audio"
        ? "from-sky-500 to-brand-700"
        : "from-slate-500 to-ink-900";
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${grad} text-white ${className ?? ""}`}>
      <div className="absolute inset-0 opacity-[0.15] [background:repeating-linear-gradient(135deg,transparent,transparent_8px,#fff_8px,#fff_9px)]" />
      <span className="relative scale-[2.1]">{m.icon}</span>
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  accent,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  href?: string;
}) {
  const inner = (
    <Card className={`h-full p-4 ${href ? "transition hover:border-brand-400 hover:shadow-md" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-display text-3xl font-semibold ${accent ?? "text-ink-950"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export function SectionTitle({ children, right, count }: { children: React.ReactNode; right?: React.ReactNode; count?: number }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {children}
        {typeof count === "number" && (
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">{count}</span>
        )}
      </h2>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-brand-200 bg-white/60 p-8 text-center text-sm text-slate-500">{children}</div>;
}

const CONFIDENCE_STYLE: Record<ConfidenceResult["level"], string> = {
  high: "bg-accent-fill-soft text-accent-fg-light",
  moderate: "bg-warn-bg text-warn-fg",
  low: "bg-danger-bg text-danger-fg",
  none: "bg-slate-100 text-slate-600",
};

/**
 * Default-visible qualitative confidence badge (standard B34) — never a raw
 * REMi/coverage numeral in the customer view. Derived from real citation
 * coverage this app's existing scoped /ask call returns; see lib/confidence.ts.
 */
export function ConfidenceBadge({ result, className }: { result: ConfidenceResult; className?: string }) {
  return (
    <span
      className={`fade-in inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${CONFIDENCE_STYLE[result.level]} ${className ?? ""}`}
      title={result.citationCount > 0 ? `${result.citationCount} source${result.citationCount === 1 ? "" : "s"} grounding this answer` : "No grounded source found for this answer"}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {result.label}
    </span>
  );
}
