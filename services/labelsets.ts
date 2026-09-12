/** Labelset reads (facet definitions for the calls explorer) and provisioning helpers. */

import { ALL_LABELSETS, type LabelsetDef } from "@/lib/domain/taxonomy";
import type { Runtime } from "@/lib/runtime";
import type { Labelset } from "@/vendor/arag-platform/src/arag/types.ts";
import { cacheKeys } from "./cache";

export interface LabelsetView {
  id: string;
  title: string;
  color?: string;
  multiple: boolean;
  kind: string[];
  labels: string[];
}

/** Facet order shown in the UI; anything else is appended in KB order. */
export const FACET_ORDER = [
  "call_reason",
  "call_outcome",
  "sentiment",
  "line_of_business",
  "disposition_flags",
];

export function toView(id: string, ls: Labelset): LabelsetView {
  return {
    id,
    title: ls.title || id,
    color: ls.color,
    multiple: Boolean(ls.multiple),
    kind: (ls.kind ?? []).map(String),
    labels: (ls.labels ?? []).map((l) => l.title).filter(Boolean),
  };
}

export function orderFacets(views: LabelsetView[]): LabelsetView[] {
  const rank = (id: string) => {
    const i = FACET_ORDER.indexOf(id);
    return i === -1 ? FACET_ORDER.length : i;
  };
  return [...views].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

/** Every labelset in the KB (cached). */
export async function listLabelsets(rt: Runtime): Promise<LabelsetView[]> {
  return rt.cache.getOrLoad(cacheKeys.labelsets(), async () => {
    const { labelsets } = await rt.arag.listLabelsets();
    return orderFacets(Object.entries(labelsets).map(([id, ls]) => toView(id, ls)));
  });
}

/** Create/replace one labelset from the product taxonomy (idempotent). */
export async function putLabelset(rt: Runtime, def: LabelsetDef): Promise<void> {
  await rt.arag.putLabelset(def.id, {
    title: def.title,
    color: def.color,
    multiple: def.multiple,
    kind: [def.kind],
    labels: def.labels.map((l) => ({ title: l.label })),
  });
}

/** Create/replace every labelset in the taxonomy. */
export async function provisionLabelsets(rt: Runtime): Promise<string[]> {
  const done: string[] = [];
  for (const def of ALL_LABELSETS) {
    await putLabelset(rt, def);
    done.push(def.id);
  }
  rt.cache.delete(cacheKeys.labelsets());
  return done;
}
