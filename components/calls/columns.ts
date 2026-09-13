/**
 * The calls table's column catalogue and the two preferences that shape it.
 *
 * Pure: no React, no DOM, no fetch — so the table's structural rules (what a column is, which of
 * them may be hidden, what the accessible caption says) are unit-testable without rendering
 * anything, and the workspace component is left with presentation.
 *
 * Columns and density are *per-person furniture*, not part of the question the screen is asking.
 * They therefore live in `localStorage` and never in the URL: a link a supervisor sends a
 * colleague should arrive carrying the filter, not the sender's taste in row heights.
 */

/** Sort keys `GET /api/v1/calls` understands (mirrors `CALL_SORTS` in `services/calls.ts`). */
export const CALL_SORT_KEYS = [
  "created",
  "title",
  "duration",
  "agent",
  "queue",
  "sentiment",
  "compliance",
  "csat",
] as const;
export type CallSortKey = (typeof CALL_SORT_KEYS)[number];

export function isSortKey(value: string | null | undefined): value is CallSortKey {
  return Boolean(value) && (CALL_SORT_KEYS as readonly string[]).includes(value as string);
}

export interface CallColumn {
  key: string;
  /** Header text, and the word the caption uses when the table is sorted by this column. */
  label: string;
  /** Present only when the server can sort on this column. */
  sortKey?: CallSortKey;
  align?: "right";
  width?: number;
  /**
   * The Call column carries the row's title and its only link into the record. A table of rows you
   * cannot open is not a shorter table, it is a broken one — so it is offered without a checkbox.
   */
  mandatory?: boolean;
  /** One line in the picker for columns whose meaning is not obvious from the header alone. */
  hint?: string;
}

/**
 * Every column the table can show, in the order it is drawn. A stored preference only ever
 * chooses a subset of this list; it never reorders it, so two people comparing the same view are
 * looking at the same shape.
 */
export const CALL_COLUMNS: readonly CallColumn[] = [
  { key: "call", label: "Call", sortKey: "title", mandatory: true },
  { key: "created", label: "Date", sortKey: "created", width: 104 },
  { key: "duration", label: "Duration", sortKey: "duration", align: "right", width: 84 },
  { key: "agent", label: "Agent / Queue", sortKey: "agent", width: 136 },
  { key: "queue", label: "Queue", sortKey: "queue", width: 124 },
  { key: "reason", label: "Reason", width: 140 },
  { key: "outcome", label: "Outcome", width: 126 },
  { key: "sentiment", label: "Sentiment", sortKey: "sentiment", width: 104 },
  { key: "status", label: "Status", width: 122 },
  { key: "csat", label: "CSAT", sortKey: "csat", align: "right", width: 76, hint: "Estimated, 1–5" },
  {
    key: "compliance",
    label: "Compliance",
    sortKey: "compliance",
    align: "right",
    width: 104,
    hint: "Score out of 100",
  },
  { key: "lob", label: "Line of business", width: 150 },
  { key: "media", label: "Media type", width: 108 },
  { key: "complaint", label: "Complaint", width: 100 },
  { key: "escalated", label: "Escalated", width: 100 },
];

/** What a reviewer sees before they have expressed a preference. */
export const DEFAULT_COLUMNS: readonly string[] = [
  "call",
  "created",
  "duration",
  "agent",
  "reason",
  "outcome",
  "sentiment",
  "status",
];

export const COLUMNS_STORAGE_KEY = "ca.calls.columns";
export const DENSITY_STORAGE_KEY = "ca.calls.density";

export type Density = "comfortable" | "compact";

const BY_KEY = new Map(CALL_COLUMNS.map((c) => [c.key, c]));
const MANDATORY = CALL_COLUMNS.filter((c) => c.mandatory).map((c) => c.key);

/**
 * Turn whatever is in `localStorage` into a column set the table can actually draw.
 *
 * Anything unrecognised is dropped rather than trusted: a key written by an older build, or by a
 * hand-edited store, must not be able to produce a blank column or throw during render. A
 * preference that survives nothing at all falls back to the default rather than to no columns.
 */
export function parseColumns(raw: string | null | undefined): string[] {
  let wanted: string[] | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) wanted = parsed.filter((v): v is string => typeof v === "string");
    } catch {
      /* corrupt preference: the default stands */
    }
  }
  if (!wanted) return [...DEFAULT_COLUMNS];
  const chosen = new Set(wanted.filter((k) => BY_KEY.has(k)));
  for (const key of MANDATORY) chosen.add(key);
  // Only the mandatory column survived, which means the stored set named nothing real.
  if (chosen.size === MANDATORY.length && wanted.length > 0 && !wanted.some((k) => BY_KEY.has(k)))
    return [...DEFAULT_COLUMNS];
  return CALL_COLUMNS.filter((c) => chosen.has(c.key)).map((c) => c.key);
}

export function serialiseColumns(keys: readonly string[]): string {
  return JSON.stringify(keys);
}

/** The chosen columns as definitions, always in the catalogue's order. */
export function visibleColumns(keys: readonly string[]): CallColumn[] {
  const chosen = new Set(keys);
  return CALL_COLUMNS.filter((c) => c.mandatory || chosen.has(c.key));
}

/** Show or hide one column. A mandatory column is returned unchanged rather than silently dropped. */
export function toggleColumn(keys: readonly string[], key: string): string[] {
  const col = BY_KEY.get(key);
  if (!col || col.mandatory) return [...keys];
  const chosen = new Set(keys);
  if (chosen.has(key)) chosen.delete(key);
  else chosen.add(key);
  for (const m of MANDATORY) chosen.add(m);
  return CALL_COLUMNS.filter((c) => chosen.has(c.key)).map((c) => c.key);
}

export function parseDensity(raw: string | null | undefined): Density {
  return raw === "compact" ? "compact" : "comfortable";
}

/**
 * The table's `<caption>`: how many rows, how many columns, and the order they are in.
 *
 * It names the sort column by its *label*, and says so even when that column is hidden — the
 * ordering is still doing its work, and a screen-reader user who has hidden Duration should not be
 * left wondering why the rows are in an order nothing on screen explains.
 */
export function describeTable(opts: {
  total: number;
  sortKey: string;
  order: "asc" | "desc";
  columns: readonly CallColumn[];
}): string {
  const { total, sortKey, order, columns } = opts;
  const sorted = CALL_COLUMNS.find((c) => c.sortKey === sortKey);
  const shown = columns.some((c) => c.sortKey === sortKey);
  const by = sorted ? sorted.label : sortKey;
  const direction = order === "asc" ? "ascending" : "descending";
  const cols = `${columns.length} column${columns.length === 1 ? "" : "s"} shown`;
  return `${total} call${total === 1 ? "" : "s"}, ${cols}, sorted by ${by}${
    shown ? "" : " (column hidden)"
  }, ${direction}`;
}
