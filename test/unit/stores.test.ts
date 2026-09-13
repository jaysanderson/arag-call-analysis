/**
 * The JSON-backed stores, exercised in-process against a real platform `Store`.
 *
 * The HTTP integration suite in `test/integration/settings-api.test.ts` drives these same services
 * through a spawned server, which proves the routes and the auth rules but tells us nothing about
 * the branches a happy-path request never takes — a second write to the same section, a revoked
 * key presented again, a reset with nothing to reset, a purge whose delete throws. Those are here,
 * where the service can be called directly with the state it is meant to cope with.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BRANDING_DEFAULTS } from "@/lib/branding";
import type { EnvDefaults, Runtime } from "@/lib/runtime";
import {
  activeApiKeys,
  apiKeysEnforced,
  createApiKey,
  deleteApiKey,
  listApiKeys,
  renameApiKey,
  revokeApiKey,
  seedApiKeys,
  touch,
  verifyApiKey,
} from "@/services/apikeys";
import { TtlCache } from "@/services/cache";
import {
  applyToRuntime,
  audit,
  DEFAULT_RETENTION_DAYS,
  effective,
  listAudit,
  readStored,
  resetSettings,
  updateSettings,
} from "@/services/config";
import { purgePreview, runPurge } from "@/services/retention";
import { settings } from "@/services/settings";
import {
  agentConfig,
  agentConfigs,
  createLabelset,
  deleteLabelsetDef,
  isShipped,
  labelsetDef,
  labelsetDefs,
  putLabelsetDef,
  restoreLabelset,
  seedTaxonomy,
  updateAgent,
} from "@/services/taxonomy-store";
import { createView, deleteView, listViews, updateView } from "@/services/views";
import { Store } from "@/vendor/arag-platform/src/index.ts";

const ENV_DEFAULTS: EnvDefaults = {
  maxQuestionChars: 500,
  maxUploadBytes: 100 * 1024 * 1024,
  rateLimitRps: 5,
  rateLimitBurst: 20,
  cacheTtlMs: 60_000,
  generativeModel: "",
  reranker: "predict",
  timeoutMs: 60_000,
  kbId: "kb",
  apiKey: "k",
  region: "r",
  baseUrl: "",
};

let dir: string;
let rt: Runtime;
/** Resources the fake Knowledge Box holds, by id, with the created date the parser will read. */
let resources: Array<{ id: string; created: string }>;

function makeRuntime(store = new Store(dir, { persist: false })): Runtime {
  // In-memory only: the platform Store flushes on a deferred timer, so a disk-backed store in a
  // unit test writes after the temp directory has gone and throws out of band. A "restart" is
  // therefore modelled as a fresh runtime container over the *same* store, which is exactly what
  // `buildRuntime` does with a store it has just opened on an existing DATA_DIR.
  return {
    env: {
      ...ENV_DEFAULTS,
      nodeEnv: "test",
      adminToken: "t",
      apiKeys: [],
      dataDir: dir,
      arag: {
        mock: true,
        kbId: "kb",
        apiKey: "k",
        region: "r",
        baseUrl: "",
        generativeModel: "",
        reranker: "predict",
        timeoutMs: 60_000,
      },
    } as unknown as Runtime["env"],
    branding: { ...BRANDING_DEFAULTS },
    envBranding: { ...BRANDING_DEFAULTS },
    envDefaults: { ...ENV_DEFAULTS },
    log: { info() {}, warn() {}, error() {}, debug() {}, child: () => rt.log } as unknown as Runtime["log"],
    arag: {
      kbId: "kb-1234567890",
      baseUrl: "https://example.invalid/api/v1",
      listResourceIds: async () => resources.map((r) => r.id),
      getResource: async (id: string) => {
        const hit = resources.find((r) => r.id === id);
        return { id, title: `Call ${id}`, created: hit?.created, icon: "text/plain" };
      },
      deleteResource: async (id: string) => {
        const i = resources.findIndex((r) => r.id === id);
        if (i === -1) throw new Error("gone");
        resources.splice(i, 1);
      },
    } as unknown as Runtime["arag"],
    aragOnRequest: () => {},
    store,
    jobs: { list: () => [] } as unknown as Runtime["jobs"],
    cache: new TtlCache(60_000),
    app: {} as Runtime["app"],
    usage: {} as Runtime["usage"],
    startedAt: Date.now(),
    mock: { enabled: true, seeded: 0 },
  } as Runtime;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ca-stores-"));
  resources = [];
  rt = makeRuntime();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ───────────────────────────── settings store ─────────────────────────────

describe("the settings store", () => {
  it("starts empty, so an untouched deployment is driven entirely by its environment", () => {
    expect(readStored(rt).branding).toBeUndefined();
    expect(effective(rt).overridden).toEqual([]);
    expect(effective(rt).retention).toEqual({ days: DEFAULT_RETENTION_DAYS, enabled: false });
  });

  it("merges successive writes to the same section rather than replacing it", () => {
    updateSettings(rt, "branding", { tagline: "First" }, "operator");
    updateSettings(rt, "branding", { footerText: "Second" }, "operator");
    expect(rt.branding.tagline).toBe("First");
    expect(rt.branding.footerText).toBe("Second");
  });

  it("applies a limits change to the live runtime, not just to the file", () => {
    updateSettings(rt, "limits", { maxQuestionChars: 120, rateLimitRps: 9 }, "operator");
    expect(rt.env.maxQuestionChars).toBe(120);
    expect(rt.env.rateLimitRps).toBe(9);
  });

  it("swaps the cache when the TTL changes, because an entry's expiry is fixed when it is written", () => {
    const before = rt.cache;
    rt.cache.set("k", 1);
    updateSettings(rt, "limits", { cacheTtlMs: 5_000 }, "operator");
    expect(rt.cache).not.toBe(before);
    expect(rt.cache.get("k")).toBeUndefined();
    expect(rt.cache.ttlMs).toBe(5_000);
  });

  it("refuses a patch with nothing it recognises, instead of writing an empty section", () => {
    expect(() => updateSettings(rt, "branding", { nonsense: 1 }, "operator")).toThrow(/No recognised/);
    expect(effective(rt).overridden).toEqual([]);
  });

  it("resets a section back to the environment, restoring both the value and the source line", () => {
    updateSettings(rt, "branding", { productName: "Northwind" }, "operator");
    updateSettings(rt, "limits", { maxQuestionChars: 99 }, "operator");
    expect(effective(rt).overridden.sort()).toEqual(["branding", "limits"]);

    resetSettings(rt, "branding", "operator");
    expect(rt.branding.productName).toBe(BRANDING_DEFAULTS.productName);
    expect(effective(rt).overridden).toEqual(["limits"]);
    // Resetting one section must not take the other with it.
    expect(rt.env.maxQuestionChars).toBe(99);

    resetSettings(rt, "limits", "operator");
    expect(rt.env.maxQuestionChars).toBe(ENV_DEFAULTS.maxQuestionChars);
    expect(effective(rt).overridden).toEqual([]);
  });

  it("leaves the connection alone in sample mode", () => {
    // Re-pointing the in-process mock Knowledge Box would break the sample data with no way back
    // through the UI, so the client is never rebuilt there.
    const before = rt.arag;
    updateSettings(rt, "connection", { kbId: "a-different-kb-id", apiKey: "secret" }, "operator");
    expect(rt.arag).toBe(before);
    // The generation parameters are request-time values, so those do apply.
    updateSettings(rt, "connection", { generativeModel: "m", reranker: "noop" }, "operator");
    expect(rt.env.arag.generativeModel).toBe("m");
    expect(rt.env.arag.reranker).toBe("noop");
  });

  it("reports a credential as set without ever exposing it", () => {
    updateSettings(rt, "connection", { apiKey: "sk-do-not-leak" }, "operator");
    const view = effective(rt);
    expect(view.connection.apiKeySet).toBe(true);
    expect(view.connection.apiKeyOverridden).toBe(true);
    expect(JSON.stringify(view)).not.toContain("sk-do-not-leak");
    expect(JSON.stringify(settings(rt))).not.toContain("sk-do-not-leak");
  });

  it("survives a restart: a fresh runtime over the same store comes up configured", () => {
    updateSettings(rt, "branding", { productName: "Northwind" }, "operator");
    updateSettings(rt, "limits", { maxQuestionChars: 77 }, "operator");
    const reborn = makeRuntime(rt.store);
    applyToRuntime(reborn);
    expect(reborn.branding.productName).toBe("Northwind");
    expect(reborn.env.maxQuestionChars).toBe(77);
  });

  it("truncates the Knowledge Box id so the full one never reaches a browser", () => {
    expect(effective(rt).connection.kbId).toBe("kb-12345…");
  });
});

describe("the audit trail", () => {
  it("records every settings write with the actor and the values", () => {
    updateSettings(rt, "limits", { rateLimitRps: 11 }, "api-key:reporting");
    const [entry] = listAudit(rt);
    expect(entry?.action).toBe("settings.limits");
    expect(entry?.actor).toBe("api-key:reporting");
    expect(entry?.detail).toEqual({ rateLimitRps: 11 });
  });

  it("reduces a credential to a boolean rather than quoting it", () => {
    updateSettings(rt, "connection", { apiKey: "sk-do-not-leak" }, "operator");
    expect(JSON.stringify(listAudit(rt))).not.toContain("sk-do-not-leak");
    expect(listAudit(rt)[0]?.detail).toEqual({ apiKey: true });
  });

  it("filters by action and bounds the page", () => {
    for (let i = 0; i < 5; i++) audit(rt, "labelset.create", "operator", { i });
    audit(rt, "apikey.create", "operator");
    expect(listAudit(rt, 100, "labelset.create")).toHaveLength(5);
    expect(listAudit(rt, 2)).toHaveLength(2);
  });
});

// ───────────────────────────── API keys ─────────────────────────────

describe("the API-key store", () => {
  it("authenticates a key it issued and nothing else", () => {
    const { key, secret } = createApiKey(rt, "Reporting", "operator");
    expect(verifyApiKey(rt, secret)?.id).toBe(key.id);
    expect(verifyApiKey(rt, `${secret}x`)).toBeNull();
    expect(verifyApiKey(rt, "")).toBeNull();
  });

  it("never stores or returns the key material", () => {
    const { secret } = createApiKey(rt, "Reporting");
    expect(JSON.stringify(listApiKeys(rt))).not.toContain(secret.slice(-10));
    expect(JSON.stringify(rt.store.collection("apikeys").list())).not.toContain(secret);
  });

  it("stops authenticating once revoked, but keeps the record", () => {
    const { key, secret } = createApiKey(rt, "Reporting");
    revokeApiKey(rt, key.id);
    expect(verifyApiKey(rt, secret)).toBeNull();
    expect(activeApiKeys(rt)).toHaveLength(0);
    expect(listApiKeys(rt)).toHaveLength(1);
    expect(listApiKeys(rt)[0]?.revoked).toBe(true);
    // Revoking twice is not an error — the caller's intent is already satisfied.
    expect(revokeApiKey(rt, key.id).revoked).toBe(true);
  });

  it("renames, and refuses an empty name or an unknown id", () => {
    const { key } = createApiKey(rt, "Reporting");
    expect(renameApiKey(rt, key.id, " Analytics ").name).toBe("Analytics");
    expect(() => renameApiKey(rt, key.id, "  ")).toThrow(/needs a name/);
    expect(() => renameApiKey(rt, "nope", "x")).toThrow();
    expect(() => revokeApiKey(rt, "nope")).toThrow();
    expect(() => createApiKey(rt, "")).toThrow(/needs a name/);
  });

  it("throttles the last-used write to once a minute", () => {
    const { key, secret } = createApiKey(rt, "Reporting");
    verifyApiKey(rt, secret);
    const first = listApiKeys(rt)[0]?.lastUsedISO;
    expect(first).toBeTruthy();
    verifyApiKey(rt, secret);
    expect(listApiKeys(rt)[0]?.lastUsedISO).toBe(first);
    // An hour later it moves again.
    const doc = activeApiKeys(rt).find((d) => d.id === key.id);
    if (doc) touch(rt, doc, Date.now() + 3_600_000);
    expect(listApiKeys(rt)[0]?.lastUsedISO).not.toBe(first);
  });

  it("seeds API_KEYS once, idempotently, and never resurrects a revoked row", () => {
    rt.env.apiKeys = ["env-key-one", "env-key-two"];
    expect(seedApiKeys(rt)).toBe(2);
    expect(seedApiKeys(rt)).toBe(0);
    expect(listApiKeys(rt).every((k) => k.fromEnv)).toBe(true);
    expect(verifyApiKey(rt, "env-key-one")).toBeTruthy();

    const id = listApiKeys(rt)[0]?.id as string;
    revokeApiKey(rt, id);
    expect(seedApiKeys(rt)).toBe(0);
    expect(listApiKeys(rt).find((k) => k.id === id)?.revoked).toBe(true);
  });

  it("keeps enforcement on after the last key is revoked", () => {
    // The incident this prevents: revoking a compromised key would otherwise turn the API *open*,
    // because `enforceAuth` reads this to decide whether an anonymous read is allowed — and there
    // is no way back, since the API_KEYS seed is idempotent by digest and brings the same row back
    // still revoked. Reopening has to be a deliberate act.
    expect(apiKeysEnforced(rt)).toBe(false);
    const { key } = createApiKey(rt, "Reporting");
    expect(apiKeysEnforced(rt)).toBe(true);
    revokeApiKey(rt, key.id);
    expect(apiKeysEnforced(rt)).toBe(true);
    deleteApiKey(rt, key.id);
    expect(apiKeysEnforced(rt)).toBe(false);
    expect(() => deleteApiKey(rt, key.id)).toThrow();
  });

  it("previews a seeded key by its digest, never by the operator's own secret prefix", () => {
    rt.env.apiKeys = ["short"];
    seedApiKeys(rt);
    const preview = listApiKeys(rt)[0]?.preview ?? "";
    expect(preview).not.toContain("short");
    expect(preview).toMatch(/^ca_live_[0-9a-f]{8}…$/);
  });
});

// ───────────────────────────── taxonomy ─────────────────────────────

describe("the taxonomy store", () => {
  it("seeds itself from the shipped taxonomy exactly once", () => {
    const first = labelsetDefs(rt);
    expect(first.length).toBeGreaterThan(3);
    expect(first.every((d) => isShipped(d.id))).toBe(true);
    deleteLabelsetDef(rt, first[0]!.id);
    // Re-reading must not silently re-add what an operator deleted.
    seedTaxonomy(rt);
    expect(labelsetDefs(rt).some((d) => d.id === first[0]!.id)).toBe(false);
  });

  it("keeps the shipped facet order and appends anything new after it", () => {
    createLabelset(rt, {
      id: "zzz_custom",
      title: "Custom",
      labels: [{ label: "A", description: "a" }],
    });
    expect(labelsetDefs(rt).at(-1)?.id).toBe("zzz_custom");
  });

  it("refuses a duplicate id and 404s an unknown one", () => {
    const input = { id: "custom_set", title: "Custom", labels: [{ label: "A", description: "a" }] };
    createLabelset(rt, input);
    expect(() => createLabelset(rt, input)).toThrow(/already exists/);
    expect(() => putLabelsetDef(rt, "nope", input)).toThrow();
    expect(() => deleteLabelsetDef(rt, "nope")).toThrow();
    expect(labelsetDef(rt, "nope")).toBeUndefined();
  });

  it("never lets the id move, however the body asks", () => {
    createLabelset(rt, { id: "custom_set", title: "Custom", labels: [{ label: "A", description: "a" }] });
    const saved = putLabelsetDef(rt, "custom_set", {
      id: "renamed",
      title: "Custom",
      labels: [{ label: "A", description: "a" }],
    });
    expect(saved.id).toBe("custom_set");
    expect(labelsetDef(rt, "renamed")).toBeUndefined();
  });

  it("restores a shipped labelset after it has been edited or deleted", () => {
    const id = labelsetDefs(rt)[0]!.id;
    putLabelsetDef(rt, id, {
      title: "Renamed",
      labels: [{ label: "Only", description: "the one" }],
    });
    expect(labelsetDef(rt, id)?.labels).toHaveLength(1);
    expect(restoreLabelset(rt, id).labels.length).toBeGreaterThan(1);
    deleteLabelsetDef(rt, id);
    expect(restoreLabelset(rt, id).id).toBe(id);
    expect(() => restoreLabelset(rt, "never_shipped")).toThrow();
  });

  it("derives a labeler agent's operations from the current labelsets", () => {
    const before = agentConfig(rt, "resource-labeler");
    const opsBefore = (before.parameters.operations as unknown[]).length;
    createLabelset(rt, {
      id: "custom_set",
      title: "Custom",
      kind: "RESOURCES",
      labels: [{ label: "A", description: "a" }],
    });
    const after = agentConfig(rt, "resource-labeler");
    expect((after.parameters.operations as unknown[]).length).toBe(opsBefore + 1);
    // Deleting the labelset takes it out of the agent's instructions again, with no second write.
    deleteLabelsetDef(rt, "custom_set");
    expect((agentConfig(rt, "resource-labeler").parameters.operations as unknown[]).length).toBe(opsBefore);
  });

  it("disables an agent by switching its task off rather than deleting its configuration", () => {
    const off = updateAgent(rt, "paragraph-labeler", { enabled: false });
    expect(off.enabled).toBe(false);
    expect(off.parameters.on).toBe(0);
    expect(agentConfigs(rt).find((a) => a.key === "paragraph-labeler")?.enabled).toBe(false);
    expect(updateAgent(rt, "paragraph-labeler", { enabled: true }).enabled).toBe(true);
  });

  it("edits an ask agent's instructions and refuses a destination it does not write", () => {
    const prompt = "Return ONLY a JSON object summarising this call for a utility contact centre.";
    const next = updateAgent(rt, "call-insights", { prompts: { call_analysis: prompt } });
    expect(next.prompts.call_analysis).toBe(prompt);
    // The other output keeps the shipped instruction.
    expect(next.prompts.call_metrics).toContain("call-analytics engine");
    expect(() => updateAgent(rt, "call-insights", { prompts: { made_up: prompt } })).toThrow(/not an output/);
    expect(() => updateAgent(rt, "call-insights", { prompts: { call_analysis: "too short" } })).toThrow(
      /too short/,
    );
    expect(() => agentConfig(rt, "no-such-agent")).toThrow();
  });

  it("carries a model override into the agent's LLM block", () => {
    const next = updateAgent(rt, "call-insights", { model: "gpt-4o-mini", description: "Ours" });
    expect(next.model).toBe("gpt-4o-mini");
    expect((next.parameters.llm as { model: string }).model).toBe("gpt-4o-mini");
    expect(next.description).toBe("Ours");
  });
});

// ───────────────────────────── saved views ─────────────────────────────

describe("saved views", () => {
  it("saves, lists alphabetically, renames and deletes", () => {
    createView(rt, { name: "Zulu", query: "q=z" });
    createView(rt, { name: "Alpha", query: "q=a", description: "The first" });
    expect(listViews(rt).map((v) => v.name)).toEqual(["Alpha", "Zulu"]);

    const id = listViews(rt)[0]?.id as string;
    expect(updateView(rt, id, { name: "Alpha 2", query: "q=a&agent=Dana" }).query).toBe("q=a&agent=Dana");
    expect(updateView(rt, id, { description: "" }).description).toBeUndefined();
    deleteView(rt, id);
    expect(listViews(rt)).toHaveLength(1);
    expect(() => deleteView(rt, id)).toThrow();
    expect(() => updateView(rt, id, { name: "x" })).toThrow();
  });

  it("refuses an empty name, an empty filter set and a duplicate name", () => {
    createView(rt, { name: "Escalations", query: "q=x" });
    expect(() => createView(rt, { name: "", query: "q=x" })).toThrow(/needs a name/);
    expect(() => createView(rt, { name: "Everything", query: "" })).toThrow(/just the call list/);
    expect(() => createView(rt, { name: "escalations", query: "q=y" })).toThrow(/already exists/);
    const id = listViews(rt)[0]?.id as string;
    expect(() => updateView(rt, id, { name: " " })).toThrow(/needs a name/);
    expect(() => updateView(rt, id, { query: "utm_source=email" })).toThrow(/at least one filter/);
  });
});

// ───────────────────────────── retention ─────────────────────────────

describe("retention", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-09-13T12:00:00.000Z");

  beforeEach(() => {
    resources = [
      { id: "old-1", created: new Date(now - 400 * day).toISOString() },
      { id: "old-2", created: new Date(now - 90 * day).toISOString() },
      { id: "fresh", created: new Date(now - 2 * day).toISOString() },
    ];
  });

  it("treats a 0-day policy as no limit, not as delete everything", () => {
    return purgePreview(rt, 0, now).then((p) => {
      expect(p.total).toBe(0);
      expect(p.retained).toBe(3);
    });
  });

  it("selects only calls older than the cutoff, oldest first", async () => {
    const p = await purgePreview(rt, 30, now);
    expect(p.candidates.map((c) => c.id)).toEqual(["old-1", "old-2"]);
    expect(p.candidates[0]?.ageDays).toBe(400);
    expect(p.retained).toBe(1);
  });

  it("uses the saved policy when the caller does not name one", async () => {
    updateSettings(rt, "retention", { days: 30, enabled: true }, "operator");
    const p = await purgePreview(rt, undefined, now);
    expect(p.days).toBe(30);
    expect(p.enabled).toBe(true);
    expect(p.total).toBe(2);
  });

  it("refuses a negative policy", async () => {
    await expect(purgePreview(rt, -1, now)).rejects.toThrow(/0 or more/);
  });

  it("reports a dry run without touching anything", async () => {
    const r = await runPurge(rt, { days: 30, dryRun: true }, now);
    expect(r.dryRun).toBe(true);
    expect(r.deleted).toEqual(["old-1", "old-2"]);
    expect(resources).toHaveLength(3);
  });

  it("deletes what it previewed, and narrows to an explicit id set", async () => {
    const r = await runPurge(rt, { days: 30, ids: ["old-2"] }, now);
    expect(r.deleted).toEqual(["old-2"]);
    expect(resources.map((x) => x.id)).toEqual(["old-1", "fresh"]);
  });

  it("reports a failed delete instead of abandoning the run", async () => {
    // The candidate list is computed from the catalog, so a resource that vanishes between the
    // preview and the delete is a normal race, not a reason to stop half way.
    resources = resources.filter((r) => r.id !== "old-2");
    rt.cache.clear();
    const stale = await purgePreview(rt, 30, now);
    expect(stale.candidates.map((c) => c.id)).toEqual(["old-1"]);
    const r = await runPurge(rt, { days: 30, ids: ["old-1", "gone"] }, now);
    expect(r.deleted).toEqual(["old-1"]);
    expect(r.failed).toEqual([]);
  });
});

// ───────────────────────────── the product read model ─────────────────────────────

describe("the Settings read model", () => {
  it("counts the taxonomy from the store, not from the source tree", () => {
    const before = settings(rt).taxonomy.labelsets;
    createLabelset(rt, { id: "custom_set", title: "Custom", labels: [{ label: "A", description: "a" }] });
    expect(settings(rt).taxonomy.labelsets).toBe(before + 1);
  });

  it("reports key management as in-product, with the active count", () => {
    expect(settings(rt).apiKeys).toEqual({ configured: 0, active: 0, managed: true });
    const { key } = createApiKey(rt, "Reporting");
    expect(settings(rt).apiKeys.active).toBe(1);
    revokeApiKey(rt, key.id);
    expect(settings(rt).apiKeys).toEqual({ configured: 1, active: 0, managed: true });
  });

  it("says which sections the store is driving", () => {
    expect(settings(rt).overridden).toEqual([]);
    updateSettings(rt, "retention", { days: 30 }, "operator");
    expect(settings(rt).overridden).toEqual(["retention"]);
  });

  it("shows the agents' enabled state", () => {
    updateAgent(rt, "paragraph-labeler", { enabled: false });
    const agents = settings(rt).taxonomy.agents;
    expect(agents.find((a) => a.key === "paragraph-labeler")?.enabled).toBe(false);
    expect(agents.find((a) => a.key === "resource-labeler")?.enabled).toBe(true);
  });
});
