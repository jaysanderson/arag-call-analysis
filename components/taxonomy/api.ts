/**
 * The Agents & Taxonomy screen's talk to `/api/v1`: types, one fetch helper, one cache note.
 *
 * Every write on this screen goes through `api()` so that an RFC 9457 `detail` is what the user
 * reads when something fails — never a status code, never "Something went wrong".
 */

import type { LabelsetDef } from "@/lib/domain/taxonomy";
import type { LabelsetDetail, TaxonomyView } from "@/services/taxonomy";

export type { LabelsetDef, LabelsetDetail };
export type TaxonomyData = TaxonomyView;

/** One row of `GET /api/v1/agents` — configuration and live Knowledge Box state in one object. */
export interface AgentRow {
  key: string;
  type: "labeler" | "ask";
  description: string;
  enabled: boolean;
  model?: string;
  /** Editable instructions, keyed by the resource field the operation writes. `ask` agents only. */
  prompts?: Record<string, string>;
  state: "running" | "completed" | "failed" | "configured" | "absent";
  taskId?: string;
  operations: number;
  /** Labelsets this agent applies. Derived from the taxonomy, so `labeler` agents only. */
  labelsets?: string[];
}

export interface LabelsetWriteResult {
  labelset: LabelsetDef;
  provisioned: boolean;
  provisionError?: string;
}

/**
 * A request whose failure carries the server's own words.
 *
 * The API answers `application/problem+json` with a `detail` that was written for a person; the
 * screen shows exactly that. A body that is not JSON at all (a proxy error page, say) still has to
 * produce a sentence, hence the fallback.
 */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
  });
  const text = res.status === 204 ? "" : await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail = (body as { detail?: string; title?: string } | null)?.detail;
    throw new Error(detail || `The request to ${url} failed (${res.status}).`);
  }
  return body as T;
}

export const LABELSET_ID_RE = /^[a-z][a-z0-9_]{1,48}$/;

/** Human names for the two Knowledge Box labelset kinds. */
export function levelLabel(kind: string[] | string): string {
  const kinds = Array.isArray(kind) ? kind : [kind];
  return kinds.includes("PARAGRAPHS") ? "Transcript block" : "Whole call";
}

/** How many calls currently carry any label from this set. */
export function appliedCount(ls: LabelsetDetail): number {
  return ls.definitions.reduce((n, d) => n + (d.calls ?? 0), 0);
}

export type LabelsetOrigin = "shipped" | "customised" | "knowledge-box";

export function originOf(ls: LabelsetDetail): LabelsetOrigin {
  if (!ls.defined) return "knowledge-box";
  return ls.shipped ? "shipped" : "customised";
}

export const ORIGIN_LABEL: Record<LabelsetOrigin, string> = {
  shipped: "Shipped",
  customised: "Customised",
  "knowledge-box": "Knowledge Box only",
};

export const ORIGIN_EXPLANATION: Record<LabelsetOrigin, string> = {
  shipped: "Part of the taxonomy this product ships with, unchanged.",
  customised: "Created or edited here, so it no longer matches the shipped taxonomy.",
  "knowledge-box":
    "The Knowledge Box holds this labelset but the product does not define it — something else created it upstream. It can be filtered on, but it cannot be edited from here.",
};
