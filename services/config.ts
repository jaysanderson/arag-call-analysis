/**
 * The product's settings store.
 *
 * The rule this module implements: **environment variables are defaults, the store is the
 * authority.** An operator sets `BRAND_PRODUCT_NAME` or `RATE_LIMIT_RPS` once at deploy time; from
 * then on the same value is editable in the product, persists in `DATA_DIR/settings.json`, and
 * takes effect on the next request without a restart. Nothing this product reads from
 * configuration is read-only in the UI except secrets, which are write-only: set once, then shown
 * as "set · rotate" and never returned.
 *
 * "Takes effect without a restart" is the part that needs care. The runtime container
 * (`lib/runtime.ts`) is memoised on `globalThis`, so a saved setting is applied by mutating that
 * container in place rather than by rebuilding it: `rt.env` carries the scalar limits every
 * request path already reads, `rt.branding` is the object the layout renders, and `rt.arag` is
 * replaced wholesale when a connection field changes (every call site reads `rt.arag` at call
 * time, so the swap is atomic from their point of view). The alternative — a settings object every
 * consumer has to remember to consult — is one forgotten call site away from a setting that saves
 * and does nothing.
 */

import { randomUUID } from "node:crypto";
import { BRANDING_DEFAULTS, type Branding, safeColor, safeLogoUrl } from "@/lib/branding";
import type { Runtime } from "@/lib/runtime";
import { TtlCache } from "@/services/cache";
import { AragClient, badRequest, type StoredDoc } from "@/vendor/arag-platform/src/index.ts";

export const SETTINGS_COLLECTION = "settings";
export const AUDIT_COLLECTION = "audit";
/** One document, so a write is a single atomic replace rather than a merge across rows. */
export const SETTINGS_DOC_ID = "current";

/** The recording size cap enforced by `POST /api/v1/calls` when nothing is configured. */
export const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
/** Retention off by default: silently deleting a partner's calls is never a default. */
export const DEFAULT_RETENTION_DAYS = 0;

export interface StoredLimits {
  maxQuestionChars?: number;
  maxUploadBytes?: number;
  rateLimitRps?: number;
  rateLimitBurst?: number;
  cacheTtlMs?: number;
}

export interface StoredConnection {
  kbId?: string;
  region?: string;
  baseUrl?: string;
  generativeModel?: string;
  reranker?: string;
  timeoutMs?: number;
  /** Never returned by any read model; only its presence is reported. */
  apiKey?: string;
}

export interface StoredRetention {
  /** 0 disables retention entirely. */
  days?: number;
  /** When false the policy is recorded but never applied — the safe way to stage one. */
  enabled?: boolean;
}

export interface SettingsDoc extends StoredDoc {
  branding?: Partial<Branding>;
  connection?: StoredConnection;
  limits?: StoredLimits;
  retention?: StoredRetention;
}

export interface AuditDoc extends StoredDoc {
  /** `settings.branding`, `labelset.delete`, `apikey.create`, … */
  action: string;
  /** How the caller was identified: admin-token | api-key | session | anonymous. */
  actor: string;
  /** What changed, with secrets reduced to `true`. */
  detail: Record<string, unknown>;
}

function settingsCollection(rt: Runtime) {
  return rt.store.collection<SettingsDoc>(SETTINGS_COLLECTION);
}

function auditCollection(rt: Runtime) {
  // Capped: an audit trail is evidence, not an archive, and an unbounded one is the file that
  // eventually fills the volume.
  return rt.store.collection<AuditDoc>(AUDIT_COLLECTION, { cap: 5000 });
}

/** Record who changed what, when. Every mutating settings path calls this. */
export function audit(
  rt: Runtime,
  action: string,
  actor: string,
  detail: Record<string, unknown> = {},
): AuditDoc {
  const doc = auditCollection(rt).put({ id: randomUUID(), action, actor, detail });
  rt.log.info("audit", { action, actor, ...detail });
  return doc;
}

export function listAudit(rt: Runtime, limit = 100, action?: string): AuditDoc[] {
  return auditCollection(rt)
    .list({ filter: action ? (d) => d.action === action : undefined })
    .slice(0, Math.max(1, Math.min(500, limit)));
}

/** The raw stored overrides, or an empty document when nothing has ever been saved. */
export function readStored(rt: Runtime): SettingsDoc {
  return settingsCollection(rt).get(SETTINGS_DOC_ID) ?? ({ id: SETTINGS_DOC_ID } as SettingsDoc);
}

// ───────────────────────────── validation ─────────────────────────────

const clampInt = (v: unknown, min: number, max: number, name: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw badRequest(`${name} must be a number`);
  if (n < min || n > max) throw badRequest(`${name} must be between ${min} and ${max}`);
  return Math.round(n);
};

const bounded = (v: unknown, max = 200): string =>
  String(v ?? "")
    .trim()
    .slice(0, max);

/**
 * Validate a branding patch with the same grammar the boot-time reader uses.
 *
 * The colours and URLs are interpolated into server-rendered HTML, so a value that arrives from a
 * signed-in operator gets exactly the checks a value from the environment gets — a settings screen
 * must not be a way past `safeColor` and `safeLogoUrl`.
 */
export function validateBranding(patch: Record<string, unknown>): Partial<Branding> {
  const out: Partial<Branding> = {};
  if ("productName" in patch) {
    const v = bounded(patch.productName);
    if (!v) throw badRequest("productName cannot be empty");
    out.productName = v;
  }
  if ("tagline" in patch) out.tagline = bounded(patch.tagline);
  if ("footerText" in patch) out.footerText = bounded(patch.footerText);
  if ("poweredBy" in patch) out.poweredBy = Boolean(patch.poweredBy);
  if ("primaryColor" in patch) {
    const v = bounded(patch.primaryColor, 64);
    if (v && safeColor(v, "") === "") throw badRequest("primaryColor is not a valid CSS colour");
    out.primaryColor = v || BRANDING_DEFAULTS.primaryColor;
  }
  if ("accentColor" in patch) {
    const v = bounded(patch.accentColor, 64);
    if (v && safeColor(v, "") === "") throw badRequest("accentColor is not a valid CSS colour");
    out.accentColor = v || BRANDING_DEFAULTS.accentColor;
  }
  for (const key of ["logoUrl", "docsUrl", "supportUrl"] as const) {
    if (!(key in patch)) continue;
    const raw = bounded(patch[key], 500);
    if (raw && safeLogoUrl(raw) === "") throw badRequest(`${key} must be an https URL or a same-origin path`);
    out[key] = raw;
  }
  return out;
}

export function validateLimits(patch: Record<string, unknown>): StoredLimits {
  const out: StoredLimits = {};
  if ("maxQuestionChars" in patch)
    out.maxQuestionChars = clampInt(patch.maxQuestionChars, 40, 4000, "maxQuestionChars");
  if ("maxUploadBytes" in patch)
    out.maxUploadBytes = clampInt(patch.maxUploadBytes, 1024, MAX_MAX_UPLOAD_BYTES, "maxUploadBytes");
  if ("rateLimitRps" in patch) out.rateLimitRps = clampInt(patch.rateLimitRps, 0, 10_000, "rateLimitRps");
  if ("rateLimitBurst" in patch)
    out.rateLimitBurst = clampInt(patch.rateLimitBurst, 1, 100_000, "rateLimitBurst");
  if ("cacheTtlMs" in patch) out.cacheTtlMs = clampInt(patch.cacheTtlMs, 0, 3_600_000, "cacheTtlMs");
  return out;
}

const REGION_RE = /^[a-z0-9-]{1,64}$/i;

export function validateConnection(patch: Record<string, unknown>): StoredConnection {
  const out: StoredConnection = {};
  if ("kbId" in patch) {
    const v = bounded(patch.kbId, 64);
    if (v && !/^[a-z0-9-]{8,64}$/i.test(v)) throw badRequest("kbId is not a Knowledge Box id");
    out.kbId = v;
  }
  if ("region" in patch) {
    const v = bounded(patch.region, 64);
    if (v && !REGION_RE.test(v)) throw badRequest("region must be a zone slug such as aws-us-east-2-1");
    out.region = v;
  }
  if ("baseUrl" in patch) {
    const v = bounded(patch.baseUrl, 300);
    if (v && !/^https:\/\/[^\s]+$/i.test(v)) throw badRequest("baseUrl must be an https URL");
    out.baseUrl = v.replace(/\/+$/, "");
  }
  if ("generativeModel" in patch) out.generativeModel = bounded(patch.generativeModel, 100);
  if ("reranker" in patch) {
    const v = bounded(patch.reranker, 32);
    if (v && !["predict", "noop"].includes(v)) throw badRequest("reranker must be predict or noop");
    out.reranker = v;
  }
  if ("timeoutMs" in patch) out.timeoutMs = clampInt(patch.timeoutMs, 1000, 300_000, "timeoutMs");
  if ("apiKey" in patch) {
    const v = String(patch.apiKey ?? "").trim();
    // An empty string is "leave it alone", not "clear the credential": clearing the service-account
    // token from a settings form would take the deployment offline with no way back through the UI.
    if (v) out.apiKey = v;
  }
  return out;
}

export function validateRetention(patch: Record<string, unknown>): StoredRetention {
  const out: StoredRetention = {};
  if ("days" in patch) out.days = clampInt(patch.days, 0, 3650, "days");
  if ("enabled" in patch) out.enabled = Boolean(patch.enabled);
  return out;
}

// ───────────────────────────── effective view ─────────────────────────────

export interface EffectiveLimits {
  maxQuestionChars: number;
  maxUploadBytes: number;
  rateLimitRps: number;
  rateLimitBurst: number;
  cacheTtlMs: number;
}

export interface EffectiveConnection {
  mode: "mock" | "live";
  /** Truncated. The full id never reaches a browser. */
  kbId: string;
  region: string;
  baseUrl: string;
  generativeModel: string;
  reranker: string;
  timeoutMs: number;
  /** True when a service-account token is configured (from the store or the environment). */
  apiKeySet: boolean;
  /** True when the store, rather than the environment, is supplying the credential. */
  apiKeyOverridden: boolean;
  seededCalls?: number;
}

export interface EffectiveSettings {
  branding: Branding;
  connection: EffectiveConnection;
  limits: EffectiveLimits;
  retention: Required<StoredRetention>;
  /** Which sections the store (rather than the environment) is currently driving. */
  overridden: string[];
}

export function effectiveLimits(rt: Runtime): EffectiveLimits {
  return {
    maxQuestionChars: rt.env.maxQuestionChars,
    maxUploadBytes: rt.env.maxUploadBytes,
    rateLimitRps: rt.env.rateLimitRps,
    rateLimitBurst: rt.env.rateLimitBurst,
    cacheTtlMs: rt.env.cacheTtlMs,
  };
}

export function effective(rt: Runtime): EffectiveSettings {
  const stored = readStored(rt);
  const overridden: string[] = [];
  for (const key of ["branding", "connection", "limits", "retention"] as const) {
    const section = stored[key];
    if (section && Object.keys(section).length > 0) overridden.push(key);
  }
  return {
    branding: rt.branding,
    connection: {
      mode: rt.env.arag.mock ? "mock" : "live",
      kbId: rt.arag.kbId ? `${rt.arag.kbId.slice(0, 8)}…` : "",
      region: rt.env.arag.region ?? "",
      baseUrl: rt.env.arag.mock ? "in-process mock" : (rt.arag.baseUrl ?? ""),
      generativeModel: rt.env.arag.generativeModel ?? "",
      reranker: rt.env.arag.reranker ?? "",
      timeoutMs: rt.env.arag.timeoutMs,
      apiKeySet: Boolean(rt.env.arag.apiKey || stored.connection?.apiKey),
      apiKeyOverridden: Boolean(stored.connection?.apiKey),
      ...(rt.env.arag.mock ? { seededCalls: rt.mock.seeded } : {}),
    },
    limits: effectiveLimits(rt),
    retention: {
      days: stored.retention?.days ?? DEFAULT_RETENTION_DAYS,
      enabled: stored.retention?.enabled ?? false,
    },
    overridden,
  };
}

// ───────────────────────────── applying ─────────────────────────────

/**
 * Push the stored overrides onto the live runtime. Called at boot (after the store exists) and
 * again after every write, so a setting is in force for the very next request.
 */
export function applyToRuntime(rt: Runtime, stored: SettingsDoc = readStored(rt)): void {
  if (stored.branding) {
    rt.branding = {
      ...rt.branding,
      ...stored.branding,
      primaryColor: safeColor(stored.branding.primaryColor, rt.branding.primaryColor),
      accentColor: safeColor(stored.branding.accentColor, rt.branding.accentColor),
      logoUrl:
        stored.branding.logoUrl === undefined ? rt.branding.logoUrl : safeLogoUrl(stored.branding.logoUrl),
      docsUrl: safeLogoUrl(stored.branding.docsUrl ?? rt.branding.docsUrl) || BRANDING_DEFAULTS.docsUrl,
      supportUrl:
        stored.branding.supportUrl === undefined
          ? rt.branding.supportUrl
          : safeLogoUrl(stored.branding.supportUrl),
    };
  }

  const l = stored.limits ?? {};
  if (l.maxQuestionChars !== undefined) rt.env.maxQuestionChars = l.maxQuestionChars;
  if (l.maxUploadBytes !== undefined) rt.env.maxUploadBytes = l.maxUploadBytes;
  if (l.rateLimitRps !== undefined) rt.env.rateLimitRps = l.rateLimitRps;
  if (l.rateLimitBurst !== undefined) rt.env.rateLimitBurst = l.rateLimitBurst;
  if (l.cacheTtlMs !== undefined && l.cacheTtlMs !== rt.env.cacheTtlMs) {
    rt.env.cacheTtlMs = l.cacheTtlMs;
    // `TtlCache.ttlMs` is readonly by design (an entry's expiry is decided when it is written), so
    // a TTL change swaps the cache. Dropping the entries is the correct reading of the change:
    // they were admitted under a policy that no longer applies.
    rt.cache = new TtlCache(l.cacheTtlMs);
  }

  const c = stored.connection ?? {};
  if (c.generativeModel !== undefined) rt.env.arag.generativeModel = c.generativeModel;
  if (c.reranker !== undefined) rt.env.arag.reranker = c.reranker;

  // The mock Knowledge Box is an in-process server with its own address; re-pointing the client at
  // a partner's KB from the settings screen while running in sample mode would break the sample
  // data and could not be undone from the UI. Connection edits therefore apply to live mode only.
  if (rt.env.arag.mock) return;

  const needsClient =
    c.kbId !== undefined ||
    c.region !== undefined ||
    c.baseUrl !== undefined ||
    c.timeoutMs !== undefined ||
    c.apiKey !== undefined;
  if (!needsClient) return;

  const kbId = c.kbId || rt.env.arag.kbId;
  const apiKey = c.apiKey || rt.env.arag.apiKey;
  const region = c.region || rt.env.arag.region;
  const baseUrl = c.baseUrl || rt.env.arag.baseUrl;
  const timeoutMs = c.timeoutMs ?? rt.env.arag.timeoutMs;
  if (!kbId || !apiKey || (!region && !baseUrl)) return;

  rt.env.arag.region = region;
  rt.env.arag.baseUrl = baseUrl;
  rt.env.arag.timeoutMs = timeoutMs;
  rt.arag = new AragClient({
    kbId,
    apiKey,
    region: region || undefined,
    baseUrl: baseUrl || undefined,
    timeoutMs,
    onRequest: rt.aragOnRequest,
  });
  // Every cached read was produced by the previous Knowledge Box.
  rt.cache.clear();
}

export type SettingsSection = "branding" | "connection" | "limits" | "retention";

/**
 * Persist one section and apply it. Returns the new effective settings so a caller can render the
 * saved state without a second read (and so a test can assert the write and the effect together).
 */
export function updateSettings(
  rt: Runtime,
  section: SettingsSection,
  patch: Record<string, unknown>,
  actor: string,
): EffectiveSettings {
  const stored = readStored(rt);
  let applied: Record<string, unknown>;
  if (section === "branding") applied = { ...validateBranding(patch) };
  else if (section === "limits") applied = { ...validateLimits(patch) };
  else if (section === "connection") applied = { ...validateConnection(patch) };
  else applied = { ...validateRetention(patch) };

  if (Object.keys(applied).length === 0) throw badRequest("No recognised settings in the request body");

  const next = { ...(stored[section] ?? {}), ...applied } as Record<string, unknown>;
  const doc = settingsCollection(rt).put({ ...stored, id: SETTINGS_DOC_ID, [section]: next });
  applyToRuntime(rt, doc);

  // The audit entry records the *keys* that changed, plus non-secret values. `apiKey` is reduced
  // to a boolean: an audit trail that quotes the credential is a second place to leak it.
  const detail: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(applied)) detail[k] = k === "apiKey" ? true : v;
  audit(rt, `settings.${section}`, actor, detail);
  return effective(rt);
}

/** Restore a whole section to its environment defaults. */
export function resetSettings(rt: Runtime, section: SettingsSection, actor: string): EffectiveSettings {
  const stored = readStored(rt);
  const doc = settingsCollection(rt).put({ ...stored, id: SETTINGS_DOC_ID, [section]: undefined });
  // Branding and the client are rebuilt from the environment, then the (now smaller) overrides
  // are re-applied over the top.
  rt.branding = rt.envBranding;
  rt.env.maxQuestionChars = rt.envDefaults.maxQuestionChars;
  rt.env.maxUploadBytes = rt.envDefaults.maxUploadBytes;
  rt.env.rateLimitRps = rt.envDefaults.rateLimitRps;
  rt.env.rateLimitBurst = rt.envDefaults.rateLimitBurst;
  rt.env.arag.generativeModel = rt.envDefaults.generativeModel;
  rt.env.arag.reranker = rt.envDefaults.reranker;
  rt.env.arag.timeoutMs = rt.envDefaults.timeoutMs;
  applyToRuntime(rt, doc);
  audit(rt, `settings.${section}.reset`, actor);
  return effective(rt);
}
