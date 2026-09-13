/**
 * The editable taxonomy: labelset definitions and agent configuration, owned by the product rather
 * than by the source tree.
 *
 * `lib/domain/taxonomy.ts` ships the health-insurance taxonomy this product was designed around.
 * That is a *default*, not a constraint: a partner classifying utility calls needs different
 * reasons, different outcomes and a different analysis prompt, and asking them to fork the repo to
 * get them is the difference between a product and a sample.
 *
 * So the store holds the whole set, seeded from the shipped definitions the first time it is read,
 * and every later read comes from the store. Editing a labelset changes what the labeler agent is
 * told to apply (the agents' `operations` are derived from the labelsets, not stored separately),
 * which is why an edit is followed by a re-provision rather than being silently half-applied.
 *
 * Deleting is the one asymmetric operation. Removing a labelset here removes it from the product's
 * vocabulary; whether the Knowledge Box also drops it is a separate, explicit choice, because the
 * labels already applied to 24 analysed calls are data, not configuration.
 */

import {
  AGENT_LLM,
  AGENTS,
  type AgentDef,
  ALL_LABELSETS,
  type LabelDef,
  type LabelsetDef,
} from "@/lib/domain/taxonomy";
import type { Runtime } from "@/lib/runtime";
import { badRequest, notFound, type StoredDoc } from "@/vendor/arag-platform/src/index.ts";

export const TAXONOMY_COLLECTION = "taxonomy";
export const LABELSET_DOC_PREFIX = "labelset:";
export const AGENT_DOC_PREFIX = "agent:";

const ID_RE = /^[a-z][a-z0-9_]{1,48}$/;
export const MAX_LABELS_PER_SET = 60;

export interface LabelsetDoc extends StoredDoc {
  def: LabelsetDef;
  /** True while this is still exactly the definition the product shipped. */
  shipped: boolean;
}

export interface AgentOverrideDoc extends StoredDoc {
  /** `id` is `agent:<key>`. */
  enabled: boolean;
  description?: string;
  /** Per-operation prompt overrides for the `ask` agent, keyed by destination field. */
  prompts?: Record<string, string>;
  /** Generative model override for this agent. */
  model?: string;
}

/**
 * One collection holds both kinds of row, distinguished by an id prefix, because they are read
 * together on every taxonomy screen and a second file would only add a second thing to keep in
 * step. The union keeps the store typed without an `any`.
 */
type TaxonomyDoc = StoredDoc &
  Partial<Omit<LabelsetDoc, keyof StoredDoc>> &
  Partial<Omit<AgentOverrideDoc, keyof StoredDoc>> & { at?: string };

function collection(rt: Runtime) {
  return rt.store.collection<TaxonomyDoc>(TAXONOMY_COLLECTION, { cap: 200 });
}

function labelsetDocs(rt: Runtime): LabelsetDoc[] {
  return collection(rt)
    .list({ filter: (d) => d.id.startsWith(LABELSET_DOC_PREFIX) })
    .filter((d): d is LabelsetDoc => Boolean(d.def));
}

/**
 * Seed the store from the shipped taxonomy the first time anything reads it.
 *
 * Idempotent, and — importantly — it never runs again: the `seeded` marker, not any per-labelset
 * tombstone, is what stops a restart resurrecting a labelset the operator deleted. `reseedMissing`
 * is the deliberate way to cross that line.
 */
export function seedTaxonomy(rt: Runtime): void {
  const c = collection(rt);
  if (c.get("seeded")) return;
  for (const def of ALL_LABELSETS) {
    c.put({ id: `${LABELSET_DOC_PREFIX}${def.id}`, def, shipped: true });
  }
  for (const a of AGENTS) {
    c.put({ id: `${AGENT_DOC_PREFIX}${a.key}`, enabled: true });
  }
  c.put({ id: "seeded", at: new Date().toISOString() });
}

/** Every labelset definition the product currently works with, in the shipped facet order. */
export function labelsetDefs(rt: Runtime): LabelsetDef[] {
  seedTaxonomy(rt);
  const shippedOrder = ALL_LABELSETS.map((l) => l.id);
  return labelsetDocs(rt)
    .map((d) => d.def)
    .sort((a, b) => {
      const ra = shippedOrder.indexOf(a.id);
      const rb = shippedOrder.indexOf(b.id);
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb) || a.id.localeCompare(b.id);
    });
}

export function labelsetDef(rt: Runtime, id: string): LabelsetDef | undefined {
  seedTaxonomy(rt);
  return collection(rt).get(`${LABELSET_DOC_PREFIX}${id}`)?.def;
}

export function isShipped(id: string): boolean {
  return ALL_LABELSETS.some((l) => l.id === id);
}

// ───────────────────────────── validation ─────────────────────────────

export function validateLabelsetDef(input: Record<string, unknown>, id?: string): LabelsetDef {
  const wantedId = String(input.id ?? id ?? "").trim();
  if (!ID_RE.test(wantedId))
    throw badRequest(
      "id must start with a letter and contain only lowercase letters, digits and underscores (2-49 characters)",
    );
  const title = String(input.title ?? "")
    .trim()
    .slice(0, 80);
  if (!title) throw badRequest("title is required");
  const kind = String(input.kind ?? "RESOURCES").toUpperCase();
  if (kind !== "RESOURCES" && kind !== "PARAGRAPHS") throw badRequest("kind must be RESOURCES or PARAGRAPHS");
  const color = String(input.color ?? "#2563eb").trim();
  if (!/^#[0-9a-f]{3,8}$/i.test(color)) throw badRequest("color must be a hex colour");

  const rawLabels = Array.isArray(input.labels) ? input.labels : [];
  if (rawLabels.length === 0) throw badRequest("a labelset needs at least one label");
  if (rawLabels.length > MAX_LABELS_PER_SET)
    throw badRequest(`a labelset may hold at most ${MAX_LABELS_PER_SET} labels`);
  const seen = new Set<string>();
  const labels: LabelDef[] = rawLabels.map((raw) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const label = String(l.label ?? "")
      .trim()
      .slice(0, 80);
    if (!label) throw badRequest("every label needs a name");
    if (seen.has(label.toLowerCase())) throw badRequest(`duplicate label "${label}"`);
    seen.add(label.toLowerCase());
    // The description is what the labeler agent is actually told; an empty one is a label the
    // model has to guess the meaning of, so it is required rather than optional.
    const description = String(l.description ?? "")
      .trim()
      .slice(0, 500);
    if (!description) throw badRequest(`label "${label}" needs a description — the agent reads it`);
    const examples = Array.isArray(l.examples)
      ? l.examples
          .map((e) => String(e).trim().slice(0, 300))
          .filter(Boolean)
          .slice(0, 10)
      : undefined;
    return { label, description, ...(examples?.length ? { examples } : {}) };
  });

  return {
    id: wantedId,
    title,
    color,
    multiple: Boolean(input.multiple),
    kind: kind as LabelsetDef["kind"],
    labels,
  };
}

// ───────────────────────────── writes ─────────────────────────────

export function createLabelset(rt: Runtime, input: Record<string, unknown>): LabelsetDef {
  seedTaxonomy(rt);
  const def = validateLabelsetDef(input);
  if (collection(rt).get(`${LABELSET_DOC_PREFIX}${def.id}`))
    throw badRequest(`A labelset with id "${def.id}" already exists`);
  collection(rt).put({ id: `${LABELSET_DOC_PREFIX}${def.id}`, def, shipped: false });
  return def;
}

export function putLabelsetDef(rt: Runtime, id: string, input: Record<string, unknown>): LabelsetDef {
  seedTaxonomy(rt);
  const existing = collection(rt).get(`${LABELSET_DOC_PREFIX}${id}`);
  if (!existing?.def) throw notFound("Labelset");
  const def = validateLabelsetDef({ ...input, id }, id);
  // Renaming the id would orphan every label already applied in the Knowledge Box under the old
  // one, so the path id always wins over a body id.
  collection(rt).put({ ...existing, id: `${LABELSET_DOC_PREFIX}${id}`, def, shipped: false });
  return def;
}

export function deleteLabelsetDef(rt: Runtime, id: string): void {
  seedTaxonomy(rt);
  if (!collection(rt).get(`${LABELSET_DOC_PREFIX}${id}`)) throw notFound("Labelset");
  collection(rt).delete(`${LABELSET_DOC_PREFIX}${id}`);
}

/**
 * Add shipped labelsets the store does not hold, leaving everything it does hold alone.
 *
 * `seedTaxonomy` runs exactly once per deployment, which is what stops *every boot* resurrecting a
 * labelset an operator deleted — but it also means a labelset added to `lib/domain/taxonomy.ts` in
 * a later release can never reach a deployment that has already been seeded. This is the explicit,
 * operator-initiated other half.
 *
 * It only ever *adds*, so a customised definition survives it untouched. A deliberately deleted one
 * does **not**: it is missing, so it comes back. That is the honest reading of a button called "add
 * the shipped labelsets this deployment does not hold", and it is why this is an action someone
 * takes rather than something that happens on restart. The result names every id it brought in, so
 * an operator who did not want one can delete it again knowing exactly what arrived.
 */
export function reseedMissing(rt: Runtime): { added: string[]; skipped: string[] } {
  seedTaxonomy(rt);
  const c = collection(rt);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const def of ALL_LABELSETS) {
    if (c.get(`${LABELSET_DOC_PREFIX}${def.id}`)) skipped.push(def.id);
    else {
      c.put({ id: `${LABELSET_DOC_PREFIX}${def.id}`, def, shipped: true });
      added.push(def.id);
    }
  }
  return { added, skipped };
}

/** Restore the shipped definition of one labelset (or re-create it after a delete). */
export function restoreLabelset(rt: Runtime, id: string): LabelsetDef {
  const shipped = ALL_LABELSETS.find((l) => l.id === id);
  if (!shipped) throw notFound("Shipped labelset");
  collection(rt).put({ id: `${LABELSET_DOC_PREFIX}${id}`, def: shipped, shipped: true });
  return shipped;
}

// ───────────────────────────── agents ─────────────────────────────

export interface AgentConfig extends AgentDef {
  enabled: boolean;
  /** Editable prompts, keyed by the resource field the operation writes. */
  prompts: Record<string, string>;
  model: string;
}

function labelOpsFor(defs: LabelsetDef[]) {
  return defs.map((ls) => ({
    label: {
      ident: ls.id,
      description: `Classify the call by ${ls.title}. ${
        ls.multiple ? "Apply all that genuinely apply." : "Choose the single best label."
      }`,
      multiple: ls.multiple,
      labels: ls.labels.map((l) => ({
        label: l.label,
        description: l.description,
        examples: l.examples ?? [],
      })),
    },
  }));
}

function overrideOf(rt: Runtime, key: string): AgentOverrideDoc {
  seedTaxonomy(rt);
  const doc = collection(rt).get(`${AGENT_DOC_PREFIX}${key}`);
  return doc && typeof doc.enabled === "boolean"
    ? (doc as AgentOverrideDoc)
    : ({ id: `${AGENT_DOC_PREFIX}${key}`, enabled: true, createdAt: "", updatedAt: "" } as AgentOverrideDoc);
}

/**
 * The agent definitions as they stand now: shipped shape, with the labeler operations rebuilt from
 * the *current* labelsets and the ask prompts replaced by any operator edits.
 *
 * Rebuilding the operations here rather than storing them is what keeps a labelset edit and the
 * agent that applies it from drifting apart.
 */
export function agentConfigs(rt: Runtime): AgentConfig[] {
  const defs = labelsetDefs(rt);
  const resourceSets = defs.filter((d) => d.kind === "RESOURCES");
  const paragraphSets = defs.filter((d) => d.kind === "PARAGRAPHS");

  return AGENTS.map((shipped) => {
    const ov = overrideOf(rt, shipped.key);
    const parameters: Record<string, unknown> = { ...shipped.parameters };
    const model = ov.model || (AGENT_LLM.model as string);
    parameters.llm = { ...AGENT_LLM, model };
    parameters.on = ov.enabled ? (shipped.parameters.on as number) : 0;

    if (shipped.type === "labeler") {
      parameters.operations = labelOpsFor(shipped.key === "paragraph-labeler" ? paragraphSets : resourceSets);
    } else {
      const ops = (shipped.parameters.operations as Array<{ ask: Record<string, unknown> }>) ?? [];
      parameters.operations = ops.map((op) => {
        const destination = String(op.ask.destination ?? "");
        const question = ov.prompts?.[destination] ?? String(op.ask.question ?? "");
        return { ask: { ...op.ask, question } };
      });
    }

    const prompts: Record<string, string> = {};
    if (shipped.type === "ask") {
      for (const op of (parameters.operations as Array<{ ask: Record<string, unknown> }>) ?? []) {
        prompts[String(op.ask.destination ?? "")] = String(op.ask.question ?? "");
      }
    }

    return {
      key: shipped.key,
      type: shipped.type,
      description: ov.description || shipped.description,
      parameters,
      enabled: ov.enabled,
      prompts,
      model,
    };
  });
}

export function agentConfig(rt: Runtime, key: string): AgentConfig {
  const hit = agentConfigs(rt).find((a) => a.key === key);
  if (!hit) throw notFound("Agent");
  return hit;
}

export function updateAgent(rt: Runtime, key: string, patch: Record<string, unknown>): AgentConfig {
  const current = agentConfig(rt, key);
  const ov = overrideOf(rt, key);
  const next: AgentOverrideDoc = { ...ov, id: `${AGENT_DOC_PREFIX}${key}`, enabled: ov.enabled };
  if ("enabled" in patch) next.enabled = Boolean(patch.enabled);
  if ("description" in patch)
    next.description = String(patch.description ?? "")
      .trim()
      .slice(0, 300);
  if ("model" in patch)
    next.model = String(patch.model ?? "")
      .trim()
      .slice(0, 100);
  if ("prompts" in patch) {
    const raw = (patch.prompts ?? {}) as Record<string, unknown>;
    const prompts: Record<string, string> = { ...(ov.prompts ?? {}) };
    for (const [dest, value] of Object.entries(raw)) {
      if (!(dest in current.prompts)) throw badRequest(`"${dest}" is not an output of this agent`);
      const text = String(value ?? "").trim();
      if (text.length < 20) throw badRequest(`the prompt for "${dest}" is too short to be an instruction`);
      if (text.length > 8000) throw badRequest(`the prompt for "${dest}" exceeds 8000 characters`);
      prompts[dest] = text;
    }
    next.prompts = prompts;
  }
  collection(rt).put(next);
  return agentConfig(rt, key);
}
