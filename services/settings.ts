/**
 * The in-product Settings read model.
 *
 * `GET /api/v1/admin/config` is the *operator's* view: the whole effective environment, behind the
 * admin token. This is the view a signed-in product user is entitled to — what this deployment is
 * connected to, what it will let them do, and how it is branded — with nothing secret in it. The
 * two are deliberately separate read models rather than one with fields stripped at the edge, so a
 * future change to the operator view cannot leak into the product view by accident.
 */

import type { Branding } from "@/lib/branding";
import { AGENTS, ALL_LABELSETS, PARAGRAPH_LABELSET, RESOURCE_LABELSETS } from "@/lib/domain/taxonomy";
import type { Runtime } from "@/lib/runtime";
import { APP_VERSION } from "@/lib/version";
import { PLATFORM_VERSION } from "@/vendor/arag-platform/src/index.ts";

export interface SettingsView {
  version: string;
  platformVersion: string;
  branding: Branding;
  connection: {
    mode: "mock" | "live";
    kbId: string;
    region: string;
    baseUrl: string;
    seededCalls?: number;
  };
  limits: {
    maxQuestionChars: number;
    maxUploadBytes: number;
    rateLimitRps: number;
    cacheTtlMs: number;
  };
  features: {
    uploads: boolean;
    deletes: boolean;
    adminPanel: boolean;
    apiKeyAuth: boolean;
    sampleDataset: boolean;
  };
  apiKeys: { configured: number; managed: boolean };
  taxonomy: {
    labelsets: number;
    resourceLabelsets: number;
    paragraphLabels: number;
    agents: Array<{ key: string; type: string; description: string }>;
  };
}

/** The recording size cap enforced by `POST /api/v1/calls`; mirrored here so Settings can show it. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function settings(rt: Runtime): SettingsView {
  const writeAllowed =
    rt.env.apiKeys.length > 0 ||
    Boolean(rt.env.adminToken) ||
    // A deployment with no credentials at all can only be a local mock run, and even then not in
    // production — the same rule `enforceAuth` applies, restated here so the UI agrees with the API.
    rt.env.nodeEnv !== "production";
  return {
    version: APP_VERSION,
    platformVersion: PLATFORM_VERSION,
    branding: rt.branding,
    connection: {
      mode: rt.env.arag.mock ? "mock" : "live",
      // Truncated, exactly as in the operator views: the full id never reaches a browser.
      kbId: rt.arag.kbId ? `${rt.arag.kbId.slice(0, 8)}…` : "",
      region: rt.env.arag.region ?? "",
      baseUrl: rt.env.arag.mock ? "in-process mock" : (rt.env.arag.baseUrl ?? ""),
      ...(rt.env.arag.mock ? { seededCalls: rt.mock.seeded } : {}),
    },
    limits: {
      maxQuestionChars: rt.env.maxQuestionChars,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      rateLimitRps: rt.env.rateLimitRps,
      cacheTtlMs: rt.env.cacheTtlMs,
    },
    features: {
      uploads: writeAllowed,
      deletes: writeAllowed,
      adminPanel: Boolean(rt.env.adminToken),
      apiKeyAuth: rt.env.apiKeys.length > 0,
      sampleDataset: rt.env.arag.mock,
    },
    apiKeys: { configured: rt.env.apiKeys.length, managed: false },
    taxonomy: {
      labelsets: ALL_LABELSETS.length,
      resourceLabelsets: RESOURCE_LABELSETS.length,
      paragraphLabels: PARAGRAPH_LABELSET.labels.length,
      agents: AGENTS.map((a) => ({ key: a.key, type: a.type, description: a.description })),
    },
  };
}
