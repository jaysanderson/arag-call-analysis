import Link from "next/link";
import { colorFor } from "@/lib/format";

export function Chip({ label, className, href }: { label: string; className?: string; href?: string }) {
  const cls = `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className ?? colorFor(label)}`;
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
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className ?? ""}`}>{children}</div>;
}

type MediaType = "audio" | "video" | "transcript";

const MEDIA_BADGE: Record<MediaType, { label: string; cls: string; icon: React.ReactNode }> = {
  video: {
    label: "Video",
    cls: "bg-violet-100 text-violet-700",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="13" height="12" rx="2" />
        <path d="M15 10l6-3v10l-6-3" />
      </svg>
    ),
  },
  audio: {
    label: "Audio",
    cls: "bg-sky-100 text-sky-700",
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
    cls: "bg-slate-100 text-slate-600",
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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls} ${className ?? ""}`}>
      {m.icon}
      {m.label}
    </span>
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
    <Card className={`h-full p-4 ${href ? "transition hover:border-brand-300 hover:shadow-md" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${accent ?? "text-slate-900"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}
