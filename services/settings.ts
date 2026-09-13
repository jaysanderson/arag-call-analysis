/**
 * The in-product Settings read model.
 *
 * `GET /api/v1/admin/config` is the *operator's* view: the whole effective environment, behind the
 * admin token. This is the view a signed-in product user is entitled to — what this deployment is
 * connected to, what it will let them do, and how it is branded — with nothing secret in it. The
 * two are deliberately separate read models rather than one with fields stripped at the edge, so a
 * future change to the operator view cannot leak into the product view by accident.
 *
 * Every value here is now *editable*: the corresponding write is `PUT /api/v1/settings/{section}`,
 * which persists to the store and applies to the running process (see services/config.ts). The
 * read model therefore also reports which sections the store, rather than the environment, is
 * driving — an operator looking at a value needs to know whether changing the deployment's
 * environment would move it.
 */

import type { Branding } from "@/lib/branding";
import type { Runtime } from "@/lib/runtime";
import { APP_VERSION, PLATFORM_VERSION } from "@/lib/version";
import { listApiKeys } from "./apikeys";
import { effective } from "./config";
import { agentConfigs, labelsetDefs } from "./taxonomy-store";

export interface SettingsView {
  version: string;
  platformVersion: string;
  branding: Branding;
  connection: {
    mode: "mock" | "live";
    kbId: string;
    region: string;
    baseUrl: string;
    generativeModel: string;
    reranker: string;
    timeoutMs: number;
    apiKeySet: boolean;
    apiKeyOverridden: boolean;
    seededCalls?: number;
  };
  limits: {
    maxQuestionChars: number;
    maxUploadBytes: number;
    rateLimitRps: number;
    rateLimitBurst: number;
    cacheTtlMs: number;
  };
  retention: { days: number; enabled: boolean };
  features: {
    uploads: boolean;
    deletes: boolean;
    adminPanel: boolean;
    apiKeyAuth: boolean;
    sampleDataset: boolean;
  };
  apiKeys: { configured: number; active: number; managed: boolean };
  taxonomy: {
    labelsets: number;
    resourceLabelsets: number;
    paragraphLabels: number;
    agents: Array<{ key: string; type: string; description: string; enabled: boolean }>;
  };
  /** Which sections the settings store is currently overriding. */
  overridden: string[];
}

/**
 * The recording size cap enforced by `POST /api/v1/calls`.
 *
 * It reads from the runtime now that it is an editable setting; the constant remains as the
 * shipped default so a caller with no runtime in hand (a script, a test fixture) still has one.
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function maxUploadBytes(rt: Runtime): number {
  return rt.env.maxUploadBytes;
}

export function settings(rt: Runtime): SettingsView {
  const eff = effective(rt);
  const keys = listApiKeys(rt);
  const active = keys.filter((k) => !k.revoked).length;
  const writeAllowed =
    active > 0 ||
    Boolean(rt.env.adminToken) ||
    // A deployment with no credentials at all can only be a local mock run, and even then not in
    // production — the same rule `enforceAuth` applies, restated here so the UI agrees with the API.
    rt.env.nodeEnv !== "production";
  const defs = labelsetDefs(rt);
  const paragraph = defs.filter((d) => d.kind === "PARAGRAPHS");
  return {
    version: APP_VERSION,
    platformVersion: PLATFORM_VERSION,
    branding: eff.branding,
    connection: eff.connection,
    limits: eff.limits,
    retention: eff.retention,
    features: {
      uploads: writeAllowed,
      deletes: writeAllowed,
      adminPanel: Boolean(rt.env.adminToken),
      apiKeyAuth: active > 0,
      sampleDataset: rt.env.arag.mock,
    },
    apiKeys: { configured: keys.length, active, managed: true },
    taxonomy: {
      labelsets: defs.length,
      resourceLabelsets: defs.length - paragraph.length,
      paragraphLabels: paragraph.reduce((n, d) => n + d.labels.length, 0),
      agents: agentConfigs(rt).map((a) => ({
        key: a.key,
        type: a.type,
        description: a.description,
        enabled: a.enabled,
      })),
    },
    overridden: eff.overridden,
  };
}
