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
