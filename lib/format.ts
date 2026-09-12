export function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Both date helpers pin an explicit locale + UTC timezone. Without this,
// toLocaleDateString/toLocaleString fall back to the RUNTIME's own locale
// and timezone - which differ between the Node server (Fly's container,
// typically UTC/en-US ICU defaults) and the viewer's browser (their real
// locale/timezone), producing a different rendered string on each side.
// That's a hydration mismatch (React error #418), reproduced live on every
// call-detail route via fmtDateTime's hour/minute display. Pinning both
// sides to the same locale/timezone makes the render deterministic.
const DATE_LOCALE = "en-US";
const DATE_TZ = "UTC";

export function fmtDate(iso?: string): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  return d.toLocaleDateString(DATE_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: DATE_TZ,
  });
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  return d.toLocaleString(DATE_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DATE_TZ,
  });
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

// Stable color for a label string (used for moment chips / categories).
const PALETTE = [
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-cyan-100 text-cyan-800",
  "bg-orange-100 text-orange-800",
  "bg-lime-100 text-lime-800",
  "bg-pink-100 text-pink-800",
  "bg-indigo-100 text-indigo-800",
  "bg-teal-100 text-teal-800",
];
export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? PALETTE[0]!;
}

export const SENTIMENT_COLOR: Record<string, string> = {
  Positive: "bg-accent-fill-soft text-accent-fg-light",
  Neutral: "bg-slate-100 text-slate-700",
  Negative: "bg-danger-bg text-danger-fg",
  Mixed: "bg-warn-bg text-warn-fg",
};
