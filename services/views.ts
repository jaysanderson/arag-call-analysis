/**
 * Saved views on the calls list.
 *
 * A view is a name for a query string — "Escalated complaints this week", "Agent: Dana, negative
 * sentiment". The calls screen already keeps every filter in the URL, so a saved view needs to
 * store nothing but that URL's search parameters; what it adds is a name, a place in the product
 * where a supervisor can find it again, and the fact that it is *shared* rather than sitting in
 * one person's browser. A rota of supervisors all reviewing the same queue should be looking at
 * the same definition of it.
 *
 * The stored query is re-parsed through an allowlist on write, so a saved view can only ever
 * contain parameters the calls list actually understands — a saved URL is a link the product will
 * follow, and an unbounded one is a place to park anything.
 */

import { randomUUID } from "node:crypto";
import type { Runtime } from "@/lib/runtime";
import { badRequest, notFound, type StoredDoc } from "@/vendor/arag-platform/src/index.ts";

export const VIEWS_COLLECTION = "views";
export const MAX_VIEWS = 100;

/** Every calls-list parameter a view may carry. Anything else is dropped on save. */
export const VIEW_PARAMS = [
  "q",
  "label",
  "agent",
  "queue",
  "media_type",
  "lifecycle",
  "from",
  "to",
  "sort",
  "order",
  "page_size",
  "mode",
] as const;

const MULTI = new Set(["label"]);

export interface ViewDoc extends StoredDoc {
  name: string;
  /** Normalised query string, without a leading `?`. */
  query: string;
  description?: string;
  createdBy?: string;
}

export interface ViewView {
  id: string;
  name: string;
  query: string;
  href: string;
  description?: string;
  createdISO: string;
  createdBy?: string;
}

function collection(rt: Runtime) {
  return rt.store.collection<ViewDoc>(VIEWS_COLLECTION, { cap: MAX_VIEWS });
}

/**
 * Keep only the parameters the calls list understands, in a stable order, so two people who built
 * the same filter stack in a different order save the same view.
 */
export function normaliseQuery(input: string): string {
  const src = new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  const out = new URLSearchParams();
  for (const key of VIEW_PARAMS) {
    const values = src.getAll(key).filter((v) => v !== "");
    if (values.length === 0) continue;
    if (MULTI.has(key)) for (const v of values.slice(0, 30)) out.append(key, v.slice(0, 200));
    else out.set(key, (values[values.length - 1] ?? "").slice(0, 200));
  }
  return out.toString();
}

export function toViewView(doc: ViewDoc): ViewView {
  return {
    id: doc.id,
    name: doc.name,
    query: doc.query,
    href: doc.query ? `/calls?${doc.query}` : "/calls",
    description: doc.description,
    createdISO: doc.createdAt,
    createdBy: doc.createdBy,
  };
}

export function listViews(rt: Runtime): ViewView[] {
  return collection(rt)
    .list()
    .map(toViewView)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createView(
  rt: Runtime,
  input: { name: string; query: string; description?: string; createdBy?: string },
): ViewView {
  const name = String(input.name ?? "")
    .trim()
    .slice(0, 80);
  if (!name) throw badRequest("A view needs a name");
  const query = normaliseQuery(String(input.query ?? ""));
  if (!query) throw badRequest("A view with no filters is just the call list — add at least one filter.");
  const existing = collection(rt).list();
  if (existing.some((v) => v.name.toLowerCase() === name.toLowerCase()))
    throw badRequest(`A view called "${name}" already exists`);
  if (existing.length >= MAX_VIEWS) throw badRequest(`At most ${MAX_VIEWS} saved views`);
  const doc = collection(rt).put({
    id: randomUUID(),
    name,
    query,
    description:
      String(input.description ?? "")
        .trim()
        .slice(0, 200) || undefined,
    createdBy: input.createdBy,
  });
  return toViewView(doc);
}

export function updateView(
  rt: Runtime,
  id: string,
  patch: { name?: string; query?: string; description?: string },
): ViewView {
  const doc = collection(rt).get(id);
  if (!doc) throw notFound("Saved view");
  const next: Partial<ViewDoc> = {};
  if (patch.name !== undefined) {
    const name = String(patch.name).trim().slice(0, 80);
    if (!name) throw badRequest("A view needs a name");
    next.name = name;
  }
  if (patch.query !== undefined) {
    const query = normaliseQuery(String(patch.query));
    if (!query) throw badRequest("A view needs at least one filter");
    next.query = query;
  }
  if (patch.description !== undefined)
    next.description = String(patch.description).trim().slice(0, 200) || undefined;
  return toViewView(collection(rt).update(id, next) ?? doc);
}

export function deleteView(rt: Runtime, id: string): void {
  if (!collection(rt).get(id)) throw notFound("Saved view");
  collection(rt).delete(id);
}
