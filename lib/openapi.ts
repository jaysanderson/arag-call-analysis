/**
 * The Call Analysis public API contract — authored here first, implemented second.
 *
 * This document is the single source of truth: it is served at `/api/v1/openapi.json`, rendered by
 * Redoc (`/api/v1/docs`) and Swagger UI (`/api/v1/swagger`), used by `operationSchemas()` to
 * validate every incoming request, and used by the contract tests (`lintSpec`, response checks and
 * the route-coverage check built from `API_ROUTES` below).
 */
import {
  BrandingSchema,
  buildOpenApi,
  jsonBody,
  jsonResponse,
  PageQuery,
  pageSchema,
  standardResponses,
} from "../vendor/arag-platform/src/index.ts";
import { APP_VERSION } from "./version.ts";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const err = standardResponses;

/**
 * Auth mode per route, consumed by `lib/api.ts` and asserted by the contract tests.
 * - `none`   public read
 * - `api`    open unless `API_KEYS` is set, then key or demo session
 * - `write`  always needs the admin token or an API key (never the demo session); allowed without
 *            either only when the deployment has no credentials configured at all and is not
 *            production
 * - `admin`  always needs `ADMIN_TOKEN`
 */
export type RouteAuth = "none" | "api" | "write" | "admin";

export interface RouteDef {
  method: "get" | "post" | "put" | "delete";
  /** OpenAPI path (with `{id}` placeholders). */
  path: string;
  auth: RouteAuth;
  /** Path of the Next.js route handler file, relative to the repo root. */
  file: string;
}

// ───────────────────────────── schemas ─────────────────────────────

const ResourceLabel = {
  type: "object",
  required: ["labelset", "label"],
  properties: { labelset: { type: "string" }, label: { type: "string" } },
};

const CallMetrics = {
  type: "object",
  description:
    "Flat metrics written by the `call-insights` data-augmentation agent. Values that fail the taxonomy enum check are dropped rather than rendered.",
  properties: {
    call_reason: { type: "string" },
    outcome: { type: "string" },
    sentiment: { type: "string", enum: ["Positive", "Neutral", "Negative", "Mixed"] },
    line_of_business: { type: "string" },
    complaint: { type: "boolean" },
    complaint_category: { type: "string", nullable: true },
    cross_sell_offered: { type: "boolean" },
    cross_sell_accepted: { type: "boolean" },
    csat_estimate: { type: "number" },
    compliance_score: { type: "number" },
    first_call_resolution: { type: "boolean" },
    escalated: { type: "boolean" },
    product_mentioned: { type: "string", nullable: true },
  },
  additionalProperties: true,
};

const CallAnalysis = {
  type: "object",
  description: "Narrative analysis written by the `call-insights` agent.",
  properties: {
    executive_summary: { type: "string" },
    member_intent: { type: "string" },
    key_topics: { type: "array", items: { type: "string" } },
    agent_scorecard: {
      type: "object",
      properties: {
        empathy: { type: "number" },
        compliance: { type: "number" },
        resolution_effectiveness: { type: "number" },
      },
      additionalProperties: true,
    },
    complaint: {
      type: "object",
      properties: {
        present: { type: "boolean" },
        category: { type: "string", nullable: true },
        severity: { type: "string", nullable: true },
        quote: { type: "string", nullable: true },
      },
      additionalProperties: true,
    },
    cross_sell: {
      type: "object",
      properties: {
        offered: { type: "boolean" },
        product: { type: "string", nullable: true },
        accepted: { type: "boolean" },
        objection: { type: "string", nullable: true },
      },
      additionalProperties: true,
    },
    action_items: { type: "array", items: { type: "string" } },
    risk_flags: { type: "array", items: { type: "string" } },
    notable_quotes: {
      type: "array",
      items: {
        type: "object",
        properties: { speaker: { type: "string" }, quote: { type: "string" } },
        additionalProperties: true,
      },
    },
  },
  additionalProperties: true,
};

const CallSummary = {
  type: "object",
  required: ["id", "title", "mediaType", "labels"],
  properties: {
    id: { type: "string", description: "ARAG resource id." },
    slug: { type: "string" },
    title: { type: "string" },
    icon: { type: "string", description: "Content type of the call recording or transcript." },
    mediaType: { type: "string", enum: ["audio", "video", "transcript"] },
    createdISO: { type: "string" },
    durationSec: { type: "number" },
    agentName: { type: "string" },
    memberId: { type: "string" },
    queue: { type: "string" },
    status: { type: "string", description: "ARAG processing status (PENDING while transcribing)." },
    lifecycle: {
      type: "string",
      enum: ["queued", "transcribing", "labelling", "partial", "analysed", "failed"],
      description:
        "Derived pipeline state: where this call has got to, in one word. ARAG reports a processing status, a label set and generated fields independently; this collapses the three into the state a reviewer acts on.",
    },
    labels: { type: "array", items: ResourceLabel },
    metrics: CallMetrics,
    momentTrack: {
      type: "array",
      items: { type: "string" },
      description: "Dominant moment label per transcript paragraph (empty string = none).",
    },
  },
};

const CallParagraph = {
  type: "object",
  required: ["index", "text", "charStart", "charEnd"],
  properties: {
    index: { type: "integer" },
    text: { type: "string" },
    charStart: {
      type: "integer",
      description: "Offset into the field's extracted text; citations use the same range.",
    },
    charEnd: { type: "integer" },
    startSeconds: { type: "number" },
    endSeconds: { type: "number" },
    kind: { type: "string" },
    moments: { type: "array", items: { type: "string" } },
    speaker: { type: "string", enum: ["Agent", "Member"] },
  },
};

const CallDetail = {
  allOf: [
    ref("CallSummary"),
    {
      type: "object",
      required: ["fieldId", "fieldType", "transcriptText", "paragraphs"],
      properties: {
        fieldId: { type: "string" },
        fieldType: { type: "string", enum: ["files", "texts"] },
        transcriptText: { type: "string" },
        paragraphs: { type: "array", items: ref("CallParagraph") },
        analysis: CallAnalysis,
      },
    },
  ],
};

const Datum = {
  type: "object",
  required: ["name", "value"],
  properties: { name: { type: "string" }, value: { type: "number" } },
};

const Dashboard = {
  type: "object",
  required: ["total", "withMetrics", "byReason", "bySentiment", "byOutcome", "recent"],
  properties: {
    total: { type: "integer" },
    withMetrics: { type: "integer" },
    fcrRate: { type: "number" },
    complaintRate: { type: "number" },
    crossSellOfferRate: { type: "number" },
    crossSellAcceptRate: { type: "number" },
    escalationRate: { type: "number" },
    avgCompliance: { type: "number" },
    avgCsat: { type: "number" },
    byReason: { type: "array", items: Datum },
    bySentiment: { type: "array", items: Datum },
    byOutcome: { type: "array", items: Datum },
    byLob: { type: "array", items: Datum },
    complaintsByCategory: { type: "array", items: Datum },
    crossSell: {
      type: "object",
      properties: { offered: { type: "integer" }, accepted: { type: "integer" } },
    },
    byAgent: { type: "array", items: ref("Rollup") },
    byQueue: { type: "array", items: ref("Rollup") },
    recent: { type: "array", items: ref("CallSummary") },
  },
};

const Rollup = {
  type: "object",
  required: ["name", "calls", "analysed"],
  description:
    "Per-agent or per-queue roll-up. Rates are computed over the calls in the group that carry metrics (`analysed`), never over the group size, so a partly-analysed group is not misreported.",
  properties: {
    name: { type: "string" },
    calls: { type: "integer" },
    analysed: { type: "integer" },
    fcrRate: { type: "number" },
    complaintRate: { type: "number" },
    escalationRate: { type: "number" },
    avgCsat: { type: "number" },
    avgCompliance: { type: "number" },
  },
};

const LabelsetView = {
  type: "object",
  required: ["id", "title", "labels"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    color: { type: "string" },
    multiple: { type: "boolean" },
    kind: { type: "array", items: { type: "string" } },
    labels: { type: "array", items: { type: "string" } },
  },
};

const AgentStatus = {
  type: "object",
  required: ["key", "type", "state"],
  properties: {
    key: { type: "string" },
    type: { type: "string", enum: ["labeler", "ask"] },
    description: { type: "string" },
    state: { type: "string", enum: ["running", "completed", "failed", "configured", "absent"] },
    taskId: { type: "string" },
    operations: { type: "integer" },
  },
};

const CacheStats = {
  type: "object",
  required: ["entries", "hits", "misses", "ttlMs"],
  properties: {
    entries: { type: "integer" },
    hits: { type: "integer" },
    misses: { type: "integer" },
    evictions: { type: "integer" },
    invalidations: { type: "integer" },
    ttlMs: { type: "integer" },
    byNamespace: { type: "object", additionalProperties: { type: "integer" } },
  },
};

/**
 * The platform's shared branding schema, with product-specific documentation added. Using the
 * platform schema keeps `GET /api/v1/branding` identical in shape across every ARAG product.
 */
const Branding = {
  ...BrandingSchema,
  description:
    "White-label identity for this deployment, configured with the BRAND_* environment variables. Public and free of secrets, so a partner front-end can theme itself from the same source the bundled UI uses.",
  properties: {
    ...BrandingSchema.properties,
    logoUrl: {
      type: "string",
      description: "Absolute URL, or a path served from DATA_DIR/branding/ (e.g. /branding/logo.svg).",
    },
    poweredBy: {
      type: "boolean",
      description: "False hides the Progress Agentic RAG band and the footer credit.",
    },
  },
};

const schemas: Record<string, unknown> = {
  Branding,
  ResourceLabel,
  CallMetrics,
  CallAnalysis,
  CallSummary,
  CallParagraph,
  CallDetail,
  Datum,
  Rollup,
  Dashboard,
  LabelsetView,
  AgentStatus,
  CacheStats,
  FacetCount: {
    type: "object",
    required: ["labelset", "label", "count"],
    properties: {
      labelset: { type: "string" },
      label: { type: "string" },
      count: { type: "integer" },
    },
  },
  /**
   * The shared page envelope plus the aggregates the data table's filter bar needs. Facets are
   * counted over the set that survives the structural filters but *before* the label filter, so
   * selecting one facet does not collapse the others to zero.
   */
  CallPage: (() => {
    const base = pageSchema("#/components/schemas/CallSummary") as {
      required: string[];
      properties: Record<string, unknown>;
    };
    return {
      ...base,
      required: [...base.required, "facets"],
      properties: {
        ...base.properties,
        facets: { type: "array", items: ref("FacetCount") },
        agents: { type: "array", items: { type: "string" } },
        queues: { type: "array", items: { type: "string" } },
      },
    };
  })(),
  BulkActionRequest: {
    type: "object",
    required: ["action", "ids"],
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: ["delete", "reanalyze"],
        description:
          "`delete` removes the calls and their Knowledge Box resources; `reanalyze` queues a refresh job per call.",
      },
      ids: {
        type: "array",
        items: { type: "string", maxLength: 64 },
        minItems: 1,
        maxItems: 200,
        description: "Call ids, as selected in the table.",
      },
    },
  },
  BulkActionResult: {
    type: "object",
    required: ["action", "requested", "succeeded", "failed"],
    properties: {
      action: { type: "string" },
      requested: { type: "integer" },
      succeeded: { type: "integer" },
      failed: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "error"],
          properties: { id: { type: "string" }, error: { type: "string" } },
        },
      },
      jobs: {
        type: "array",
        items: ref("Job"),
        description: "One job per call, for actions that run asynchronously.",
      },
    },
  },
  ShareLink: {
    type: "object",
    required: ["token", "callId", "url", "createdISO", "expiresISO", "revoked", "expired"],
    properties: {
      token: { type: "string", description: "Opaque 256-bit token; the only secret in the link." },
      callId: { type: "string" },
      callTitle: { type: "string" },
      url: { type: "string", description: "Path to the read-only call view, e.g. `/s/<token>`." },
      createdISO: { type: "string" },
      expiresISO: { type: "string" },
      revoked: { type: "boolean" },
      expired: { type: "boolean" },
      note: { type: "string" },
    },
  },
  ShareCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      ttlDays: { type: "integer", minimum: 1, maximum: 90, default: 7 },
      note: { type: "string", maxLength: 200, description: "Why the link was created; shown in the list." },
    },
  },
  ShareList: {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: ref("ShareLink") } },
  },
  LabelsetDetail: {
    allOf: [
      ref("LabelsetView"),
      {
        type: "object",
        required: ["shipped", "provisioned", "definitions"],
        properties: {
          shipped: { type: "boolean", description: "Part of the taxonomy this product ships." },
          provisioned: { type: "boolean", description: "The Knowledge Box actually holds it." },
          definitions: {
            type: "array",
            items: {
              type: "object",
              required: ["label", "present"],
              properties: {
                label: { type: "string" },
                description: { type: "string" },
                present: { type: "boolean" },
                calls: { type: "integer", description: "Calls currently carrying this label." },
              },
            },
          },
        },
      },
    ],
  },
  TaxonomyView: {
    type: "object",
    required: ["labelsets", "agents", "provisioning"],
    properties: {
      labelsets: { type: "array", items: ref("LabelsetDetail") },
      agents: { type: "array", items: ref("AgentStatus") },
      provisioning: {
        type: "object",
        required: ["state", "missingLabelsets", "missingAgents"],
        properties: {
          state: { type: "string", enum: ["provisioned", "partial", "absent", "running"] },
          missingLabelsets: { type: "array", items: { type: "string" } },
          missingAgents: { type: "array", items: { type: "string" } },
          lastJobId: { type: "string" },
          lastRunISO: { type: "string" },
        },
      },
    },
  },
  OnboardingState: {
    type: "object",
    required: ["complete", "mode", "callCount", "steps", "sample"],
    description:
      "Computed live on every read rather than stored, so a Knowledge Box that is emptied, or one provisioned outside the product, reports the truth instead of a stale checklist.",
    properties: {
      complete: { type: "boolean" },
      mode: { type: "string", enum: ["mock", "live"] },
      callCount: { type: "integer" },
      analysedCount: { type: "integer" },
      steps: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "title", "detail", "state"],
          properties: {
            key: { type: "string", enum: ["connect", "taxonomy", "calls", "analysis"] },
            title: { type: "string" },
            detail: { type: "string" },
            state: { type: "string", enum: ["done", "current", "blocked", "pending"] },
            actionLabel: { type: "string" },
            actionHref: { type: "string" },
          },
        },
      },
      sample: {
        type: "object",
        required: ["available", "count", "seeded"],
        properties: {
          available: { type: "boolean" },
          count: { type: "integer" },
          seeded: { type: "boolean" },
          jobId: { type: "string" },
        },
      },
    },
  },
  SeedSamplesRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      count: { type: "integer", minimum: 1, maximum: 24 },
      provision: { type: "boolean", default: true, description: "Provision the taxonomy first." },
    },
  },
  SettingsView: {
    type: "object",
    required: ["version", "branding", "connection", "limits", "features"],
    description:
      "Non-sensitive deployment settings for the in-product Settings area. Contains no secrets: the Knowledge Box id is truncated and no key material is ever included.",
    properties: {
      version: { type: "string" },
      platformVersion: { type: "string" },
      branding: ref("Branding"),
      connection: {
        type: "object",
        required: ["mode"],
        properties: {
          mode: { type: "string", enum: ["mock", "live"] },
          kbId: { type: "string", description: "Truncated." },
          region: { type: "string" },
          baseUrl: { type: "string" },
          generativeModel: { type: "string" },
          reranker: { type: "string" },
          timeoutMs: { type: "integer" },
          apiKeySet: { type: "boolean", description: "A service-account token is configured." },
          apiKeyOverridden: {
            type: "boolean",
            description: "The settings store, not the environment, supplies the token.",
          },
          seededCalls: { type: "integer", description: "Calls in the sample dataset (mock mode only)." },
        },
      },
      limits: { type: "object", additionalProperties: true },
      retention: {
        type: "object",
        properties: {
          days: { type: "integer", description: "0 means no retention limit." },
          enabled: { type: "boolean" },
        },
      },
      overridden: {
        type: "array",
        items: { type: "string" },
        description: "Sections the settings store is currently overriding the environment for.",
      },
      features: {
        type: "object",
        additionalProperties: true,
        description: "What this deployment allows: uploads, deletes, admin panel, API-key auth.",
      },
      apiKeys: {
        type: "object",
        required: ["configured", "managed"],
        properties: {
          configured: { type: "integer", description: "Keys in the store, revoked ones included." },
          active: { type: "integer", description: "Keys that can currently authenticate." },
          managed: {
            type: "boolean",
            description: "True: keys are issued and revoked in the product (`/api/v1/api-keys`).",
          },
        },
      },
      taxonomy: { type: "object", additionalProperties: true },
    },
  },
  SettingsUpdateRequest: {
    type: "object",
    description:
      "A patch for one settings section. Only the keys present are changed; the rest of the section keeps its current value. Unknown keys are rejected so a typo in a partner's automation fails loudly instead of silently doing nothing.",
    additionalProperties: false,
    properties: {
      productName: { type: "string", maxLength: 200 },
      tagline: { type: "string", maxLength: 200 },
      footerText: { type: "string", maxLength: 200 },
      poweredBy: { type: "boolean" },
      primaryColor: { type: "string", maxLength: 64 },
      accentColor: { type: "string", maxLength: 64 },
      logoUrl: { type: "string", maxLength: 500 },
      docsUrl: { type: "string", maxLength: 500 },
      supportUrl: { type: "string", maxLength: 500 },
      kbId: { type: "string", maxLength: 64 },
      region: { type: "string", maxLength: 64 },
      baseUrl: { type: "string", maxLength: 300 },
      generativeModel: { type: "string", maxLength: 100 },
      reranker: { type: "string", enum: ["predict", "noop", ""] },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 300000 },
      apiKey: {
        type: "string",
        maxLength: 500,
        description: "Write-only. An empty string leaves the stored credential untouched.",
      },
      maxQuestionChars: { type: "integer", minimum: 40, maximum: 4000 },
      maxUploadBytes: { type: "integer", minimum: 1024 },
      rateLimitRps: { type: "integer", minimum: 0, maximum: 10000 },
      rateLimitBurst: { type: "integer", minimum: 1, maximum: 100000 },
      cacheTtlMs: { type: "integer", minimum: 0, maximum: 3600000 },
      days: { type: "integer", minimum: 0, maximum: 3650 },
      enabled: { type: "boolean" },
    },
  },
  ApiKey: {
    type: "object",
    required: ["id", "name", "preview", "createdISO", "revoked", "fromEnv"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      preview: {
        type: "string",
        description:
          "`ca_live_` plus the first 8 characters. The key itself is stored hashed and is never returned after creation.",
      },
      createdISO: { type: "string" },
      lastUsedISO: { type: "string", description: "Recorded at most once a minute per key." },
      revoked: { type: "boolean" },
      fromEnv: { type: "boolean", description: "Imported from the `API_KEYS` seed." },
      purged: { type: "boolean", description: "Present on a purge: the record was deleted too." },
      createdBy: { type: "string" },
    },
  },
  ApiKeyList: {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: ref("ApiKey") } },
  },
  ApiKeyCreateRequest: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: { name: { type: "string", minLength: 1, maxLength: 80 } },
  },
  ApiKeyCreated: {
    type: "object",
    required: ["key", "secret"],
    properties: {
      key: ref("ApiKey"),
      secret: {
        type: "string",
        description: "The key material, returned exactly once. It cannot be recovered afterwards.",
      },
    },
  },
  ApiKeyUpdateRequest: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: { name: { type: "string", minLength: 1, maxLength: 80 } },
  },
  LabelsetDefinition: {
    type: "object",
    required: ["id", "title", "labels"],
    description: "A labelset as the product defines it: the vocabulary the labeler agent is told to apply.",
    properties: {
      id: {
        type: "string",
        pattern: "^[a-z][a-z0-9_]{1,48}$",
        description: "Stable identifier; also the Knowledge Box labelset id. Never changes after creation.",
      },
      title: { type: "string", minLength: 1, maxLength: 80 },
      color: { type: "string", pattern: "^#[0-9a-fA-F]{3,8}$" },
      multiple: { type: "boolean", description: "May several labels from this set apply to one call?" },
      kind: { type: "string", enum: ["RESOURCES", "PARAGRAPHS"] },
      labels: {
        type: "array",
        minItems: 1,
        maxItems: 60,
        items: {
          type: "object",
          required: ["label", "description"],
          properties: {
            label: { type: "string", minLength: 1, maxLength: 80 },
            description: {
              type: "string",
              minLength: 1,
              maxLength: 500,
              description:
                "Required: this is the instruction the agent reads when deciding to apply the label.",
            },
            examples: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 10 },
          },
        },
      },
    },
  },
  LabelsetWriteResult: {
    type: "object",
    required: ["labelset", "provisioned"],
    properties: {
      labelset: ref("LabelsetDefinition"),
      provisioned: { type: "boolean", description: "The Knowledge Box was updated in the same request." },
      provisionError: {
        type: "string",
        description: "Set when the definition was saved but the Knowledge Box write failed.",
      },
    },
  },
  AgentConfig: {
    type: "object",
    required: ["key", "type", "description", "enabled"],
    properties: {
      key: { type: "string" },
      type: { type: "string", enum: ["labeler", "ask"] },
      description: { type: "string" },
      enabled: { type: "boolean" },
      model: { type: "string" },
      state: { type: "string", enum: ["running", "completed", "failed", "configured", "absent"] },
      taskId: { type: "string" },
      operations: { type: "integer" },
      prompts: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Editable instructions, keyed by the resource field the operation writes.",
      },
      labelsets: {
        type: "array",
        items: { type: "string" },
        description: "Labelsets this agent applies (labeler agents only). Derived from the taxonomy.",
      },
    },
  },
  AgentList: {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: ref("AgentConfig") } },
  },
  AgentUpdateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" },
      description: { type: "string", maxLength: 300 },
      model: { type: "string", maxLength: 100 },
      prompts: { type: "object", additionalProperties: { type: "string", maxLength: 8000 } },
    },
  },
  SavedView: {
    type: "object",
    required: ["id", "name", "query", "href", "createdISO"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      query: { type: "string", description: "Normalised calls-list query string, without the leading `?`." },
      href: { type: "string" },
      description: { type: "string" },
      createdISO: { type: "string" },
      createdBy: { type: "string" },
    },
  },
  SavedViewList: {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: ref("SavedView") } },
  },
  SavedViewRequest: {
    type: "object",
    required: ["name", "query"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      query: { type: "string", maxLength: 2000 },
      description: { type: "string", maxLength: 200 },
    },
  },
  PurgePreview: {
    type: "object",
    required: ["days", "enabled", "cutoffISO", "candidates", "total", "retained"],
    properties: {
      days: { type: "integer" },
      enabled: { type: "boolean" },
      cutoffISO: { type: "string" },
      total: { type: "integer" },
      retained: { type: "integer" },
      candidates: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "title", "ageDays"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            createdISO: { type: "string" },
            ageDays: { type: "integer" },
          },
        },
      },
    },
  },
  PurgeRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      days: {
        type: "integer",
        minimum: 0,
        maximum: 3650,
        description: "Override the saved policy for this run.",
      },
      dryRun: { type: "boolean", description: "Report what would be deleted without deleting it." },
      ids: { type: "array", items: { type: "string", maxLength: 128 }, maxItems: 200 },
    },
  },
  PurgeResult: {
    type: "object",
    required: ["days", "cutoffISO", "deleted", "failed", "dryRun"],
    properties: {
      days: { type: "integer" },
      cutoffISO: { type: "string" },
      deleted: { type: "array", items: { type: "string" } },
      failed: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "error"],
          properties: { id: { type: "string" }, error: { type: "string" } },
        },
      },
      sharesRevoked: { type: "integer" },
      dryRun: { type: "boolean" },
      scoped: {
        type: "integer",
        description:
          "Calls this run was asked to delete: the policy's candidates, narrowed by `ids` if given.",
      },
      remaining: {
        type: "integer",
        description:
          "Of those, how many are still outstanding — the per-run cap of 200, plus anything that failed. Non-zero means run again.",
      },
    },
  },
  AuditPage: {
    type: "object",
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "action", "actor", "createdAt"],
          properties: {
            id: { type: "string" },
            action: { type: "string" },
            actor: { type: "string" },
            createdAt: { type: "string" },
            detail: { type: "object", additionalProperties: true },
          },
        },
      },
    },
  },
  CallCreateAccepted: {
    type: "object",
    required: ["job", "call"],
    properties: {
      job: ref("Job"),
      call: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" }, title: { type: "string" } },
      },
    },
  },
  AskRequest: {
    type: "object",
    required: ["question"],
    additionalProperties: false,
    properties: {
      question: {
        type: "string",
        minLength: 3,
        maxLength: 500,
        description: "Natural-language question. Answered only from this call's own transcript.",
      },
    },
  },
  SessionResponse: {
    type: "object",
    required: ["ok", "expiresIn"],
    properties: { ok: { type: "boolean" }, expiresIn: { type: "integer" } },
  },
  AdminLoginRequest: {
    type: "object",
    required: ["token"],
    additionalProperties: false,
    properties: { token: { type: "string", minLength: 1, maxLength: 512 } },
  },
  AdminLoginResponse: {
    type: "object",
    required: ["ok"],
    properties: { ok: { type: "boolean" } },
  },
  HealthView: {
    type: "object",
    required: ["ok", "version", "arag"],
    properties: {
      ok: { type: "boolean" },
      version: { type: "string" },
      platformVersion: { type: "string" },
      uptimeSec: { type: "number" },
      mock: { type: "boolean" },
      arag: {
        type: "object",
        required: ["ok", "kbId", "baseUrl", "ms"],
        properties: {
          ok: { type: "boolean" },
          kbId: { type: "string", description: "Truncated; the full id is never sent to a browser." },
          baseUrl: { type: "string" },
          resources: { type: "integer" },
          generativeModel: { type: "string" },
          error: { type: "string" },
          ms: { type: "number" },
        },
        additionalProperties: true,
      },
      jobs: { type: "object", additionalProperties: true },
      cache: { type: "object", additionalProperties: true },
    },
  },
  ConfigView: {
    type: "object",
    required: ["version", "env"],
    properties: {
      version: { type: "string" },
      platformVersion: { type: "string" },
      env: { type: "object", additionalProperties: true },
      taxonomy: { type: "object", additionalProperties: true },
      cache: { type: "object", additionalProperties: true },
      limits: { type: "object", additionalProperties: true },
      branding: ref("Branding"),
    },
  },
  UsageView: {
    type: "object",
    required: ["requests", "arag", "cache"],
    properties: {
      uptimeSec: { type: "number" },
      requests: { type: "integer" },
      errors: { type: "integer" },
      asks: { type: "integer" },
      uploads: { type: "integer" },
      deletes: { type: "integer" },
      byRoute: { type: "object", additionalProperties: { type: "integer" } },
      arag: { type: "object", additionalProperties: true },
      tokens: { type: "object", additionalProperties: true },
      jobs: { type: "object", additionalProperties: true },
      cache: ref("CacheStats"),
    },
  },
  LogPage: {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: ref("LogRecord") } },
  },
  AgentsView: {
    type: "object",
    required: ["agents"],
    properties: {
      agents: { type: "array", items: ref("AgentStatus") },
      running: { type: "integer" },
      raw: { type: "object", additionalProperties: true },
    },
  },
  ProvisionRequest: {
    type: "object",
    additionalProperties: false,
    properties: { agents: { type: "boolean" }, resetTasks: { type: "boolean" } },
  },
  CacheView: {
    type: "object",
    required: ["stats"],
    properties: { stats: ref("CacheStats"), keys: { type: "array", items: { type: "string" } } },
  },
  CacheInvalidateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      prefix: { type: "string", description: "Invalidate only keys with this prefix (e.g. `summary:`)." },
    },
  },
  CacheInvalidateResponse: {
    type: "object",
    required: ["invalidated"],
    properties: { invalidated: { type: "integer" } },
  },
  JobPage: {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: ref("Job") } },
  },
};

// ───────────────────────────── paths ─────────────────────────────

const problemResponses = { ...err };

/**
 * The filter/sort query surface shared by `GET /api/v1/calls` and `GET /api/v1/calls/export`, so
 * an export is provably the same set the table was showing.
 */
const CALL_FILTER_PARAMS = [
  {
    name: "q",
    in: "query",
    description: "Search query across transcripts.",
    schema: { type: "string", maxLength: 200 },
  },
  {
    name: "label",
    in: "query",
    description: "Facet filter as `labelset/label`; repeat for AND across facets.",
    schema: { type: "array", items: { type: "string", maxLength: 120 }, maxItems: 20 },
  },
  {
    name: "agent",
    in: "query",
    description: "Exact agent name.",
    schema: { type: "string", maxLength: 120 },
  },
  {
    name: "queue",
    in: "query",
    description: "Exact queue name.",
    schema: { type: "string", maxLength: 120 },
  },
  {
    name: "media_type",
    in: "query",
    schema: { type: "string", enum: ["audio", "video", "transcript"] },
  },
  {
    name: "from",
    in: "query",
    description: "Inclusive lower bound on the call time (ISO-8601).",
    schema: { type: "string", maxLength: 40 },
  },
  {
    name: "to",
    in: "query",
    description: "Inclusive upper bound on the call time (ISO-8601).",
    schema: { type: "string", maxLength: 40 },
  },
  { name: "min_duration", in: "query", schema: { type: "integer", minimum: 0, maximum: 86_400 } },
  { name: "max_duration", in: "query", schema: { type: "integer", minimum: 0, maximum: 86_400 } },
  {
    name: "complaint",
    in: "query",
    description: "Only calls with/without a complaint.",
    schema: { type: "boolean" },
  },
  {
    name: "fcr",
    in: "query",
    description: "Only calls resolved first time (or not).",
    schema: { type: "boolean" },
  },
  { name: "escalated", in: "query", schema: { type: "boolean" } },
  {
    name: "lifecycle",
    in: "query",
    description: "Only calls in this pipeline state.",
    schema: {
      type: "string",
      enum: ["queued", "transcribing", "labelling", "partial", "analysed", "failed"],
    },
  },
  {
    name: "sort",
    in: "query",
    description: "Table column to sort by.",
    schema: {
      type: "string",
      enum: ["created", "title", "duration", "agent", "queue", "sentiment", "compliance", "csat"],
      default: "created",
    },
  },
  { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
];

const paths: Record<string, Record<string, unknown>> = {
  "/api/v1/calls": {
    get: {
      operationId: "listCalls",
      tags: ["Calls"],
      summary: "List analysed calls",
      description:
        "Full-text/semantic search across transcripts when `q` is set, otherwise the whole catalog, filtered by ARAG-assigned labels and by the structured attributes of the call. The response carries the facet tallies, agents and queues the filter bar renders, so a table view needs one request rather than four.",
      parameters: [...CALL_FILTER_PARAMS, PageQuery.page, PageQuery.pageSize],
      responses: { 200: jsonResponse(ref("CallPage"), "A page of calls"), ...problemResponses },
    },
    post: {
      operationId: "createCall",
      tags: ["Calls"],
      summary: "Upload a call",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      description:
        "Accepts `multipart/form-data` with either a `recording` file (audio/video — ARAG transcribes it) or a `transcript` text field, plus call metadata. Returns a job that completes when the call is retrievable.",
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["title"],
              properties: {
                title: { type: "string", maxLength: 200 },
                transcript: { type: "string" },
                recording: { type: "string", format: "binary" },
                agent_name: { type: "string", maxLength: 120 },
                member_id: { type: "string", maxLength: 120 },
                queue: { type: "string", maxLength: 120 },
                created: { type: "string", description: "ISO-8601 call time." },
                duration_sec: { type: "number" },
              },
            },
          },
        },
      },
      responses: {
        202: jsonResponse(ref("CallCreateAccepted"), "Accepted; processing continues as a job"),
        ...problemResponses,
        413: {
          description: "Recording too large",
          content: { "application/problem+json": { schema: ref("Problem") } },
        },
        415: {
          description: "Unsupported media type",
          content: { "application/problem+json": { schema: ref("Problem") } },
        },
      },
    },
  },
  "/api/v1/calls/export": {
    get: {
      operationId: "exportCalls",
      tags: ["Calls"],
      summary: "Export the filtered call list",
      description:
        "Renders the same set `GET /api/v1/calls` would return — same filters, same sort — as a CSV or JSON download. Pass `ids` to export an explicit table selection instead of a filter. Spreadsheet formula characters are escaped in CSV output.",
      parameters: [
        ...CALL_FILTER_PARAMS,
        {
          name: "format",
          in: "query",
          schema: { type: "string", enum: ["csv", "json"], default: "csv" },
        },
        {
          name: "ids",
          in: "query",
          description: "Explicit call ids (a table selection). Repeat the parameter.",
          schema: { type: "array", items: { type: "string", maxLength: 64 }, maxItems: 500 },
        },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 5000, default: 1000 },
        },
      ],
      responses: {
        200: {
          description: "The export, as an attachment",
          content: {
            "text/csv": { schema: { type: "string" } },
            "application/json": { schema: { type: "string" } },
          },
        },
        ...problemResponses,
      },
    },
  },
  "/api/v1/calls/bulk": {
    post: {
      operationId: "bulkCallAction",
      tags: ["Calls"],
      summary: "Apply an action to several calls at once",
      description:
        "The table's bulk actions. Partial success is the normal case and is reported per id rather than failing the whole batch.",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      requestBody: jsonBody(ref("BulkActionRequest")),
      responses: {
        200: jsonResponse(ref("BulkActionResult"), "Per-id outcome"),
        ...problemResponses,
      },
    },
  },
  "/api/v1/calls/{id}": {
    get: {
      operationId: "getCall",
      tags: ["Calls"],
      summary: "Get one call with transcript, moments and analysis",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 200: jsonResponse(ref("CallDetail"), "The call"), ...problemResponses },
    },
    delete: {
      operationId: "deleteCall",
      tags: ["Calls"],
      summary: "Delete a call and its Knowledge Box resource",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 204: { description: "Deleted" }, ...problemResponses },
    },
  },
  "/api/v1/calls/{id}/media": {
    get: {
      operationId: "getCallMedia",
      tags: ["Calls"],
      summary: "Stream the call recording",
      description:
        "Proxies the ARAG file field so the service-account token never reaches the browser. `Range` is forwarded, so the player can scrub (206 Partial Content).",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } },
        {
          name: "field",
          in: "query",
          description: "File field to stream. Allowlisted.",
          schema: { type: "string", enum: ["media", "transcript"], default: "media" },
        },
      ],
      responses: {
        200: {
          description: "The media stream",
          content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        },
        206: {
          description: "Partial content (Range request)",
          content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        },
        ...problemResponses,
      },
    },
  },
  "/api/v1/calls/{id}/ask": {
    post: {
      operationId: "askCall",
      tags: ["Calls"],
      summary: "Ask a grounded question about one call",
      description:
        "Streams ARAG's NDJSON answer (`retrieval`, `answer`, `citations`, `metadata`, `status`) and appends one extra `quality` item carrying the REMi answer-quality read. Answers are restricted to this call's own transcript.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      requestBody: jsonBody(ref("AskRequest")),
      responses: {
        200: {
          description: "NDJSON answer stream",
          content: { "application/x-ndjson": { schema: { type: "string" } } },
        },
        ...problemResponses,
      },
    },
  },
  "/api/v1/calls/{id}/reanalyze": {
    post: {
      operationId: "reanalyzeCall",
      tags: ["Calls"],
      summary: "Re-run the analysis for one call",
      description:
        "Drops every cached derivative of the call, waits for the Knowledge Box to report the resource processed, and re-reads it so labels and generated fields written since are picked up. ARAG's data-augmentation agents are Knowledge-Box-wide tasks, so this refreshes one call's analysis rather than re-invoking a model for it; the job result says whether an analysis is actually present afterwards. To re-run the agents themselves, use `POST /api/v1/admin/provision`.",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: {
        202: jsonResponse(ref("Job"), "Refresh job accepted"),
        ...problemResponses,
      },
    },
  },
  "/api/v1/calls/{id}/export": {
    get: {
      operationId: "exportCall",
      tags: ["Calls"],
      summary: "Export one call's record",
      description:
        "`json` is the whole record (transcript, moments, analysis, metrics). `txt` is the transcript with `[mm:ss] Speaker:` prefixes. `vtt` is WebVTT cues built from the paragraph timings, so the transcript drops straight into a media player.",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } },
        {
          name: "format",
          in: "query",
          schema: { type: "string", enum: ["json", "txt", "vtt"], default: "json" },
        },
      ],
      responses: {
        200: {
          description: "The call, as an attachment",
          content: {
            "application/json": { schema: { type: "string" } },
            "text/plain": { schema: { type: "string" } },
            "text/vtt": { schema: { type: "string" } },
          },
        },
        ...problemResponses,
      },
    },
  },
  "/api/v1/calls/{id}/shares": {
    get: {
      operationId: "listCallShares",
      tags: ["Shares"],
      summary: "Every share link ever created for a call",
      security: [{ ApiKey: [] }],
      description: "Includes revoked and expired links, so the history of who was given a pointer survives.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 200: jsonResponse(ref("ShareList"), "Share links"), ...problemResponses },
    },
    post: {
      operationId: "createCallShare",
      tags: ["Shares"],
      summary: "Create a revocable, expiring link to one call",
      security: [{ ApiKey: [] }],
      description:
        "Share links are application state, not a Knowledge Box mutation, and they grant no access the read API does not already give — so they need only the same credentials a read does. Revoking one is the control that matters, and it is available to every caller who can create one.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      requestBody: jsonBody(ref("ShareCreateRequest"), false),
      responses: { 201: jsonResponse(ref("ShareLink"), "The link"), ...problemResponses },
    },
  },
  "/api/v1/shares/{token}": {
    get: {
      operationId: "resolveShare",
      tags: ["Shares"],
      summary: "Resolve a share token to the call it points at",
      description:
        "404 for an unknown, revoked or expired token — the three are indistinguishable to the caller by design.",
      parameters: [{ name: "token", in: "path", required: true, schema: { type: "string", maxLength: 128 } }],
      responses: { 200: jsonResponse(ref("ShareLink"), "The link"), ...problemResponses },
    },
    delete: {
      operationId: "revokeShare",
      tags: ["Shares"],
      summary: "Revoke a share link",
      security: [{ ApiKey: [] }],
      parameters: [{ name: "token", in: "path", required: true, schema: { type: "string", maxLength: 128 } }],
      responses: { 200: jsonResponse(ref("ShareLink"), "The revoked link"), ...problemResponses },
    },
  },
  "/api/v1/settings": {
    get: {
      operationId: "getSettings",
      tags: ["Settings"],
      summary: "Non-sensitive deployment settings for the in-product Settings area",
      description:
        "Branding, connection, limits, retention, which features this deployment allows, and how many API keys exist. Contains no secrets and no key material; the operator view with the full effective environment is `GET /api/v1/admin/config`.",
      responses: { 200: jsonResponse(ref("SettingsView"), "Settings"), ...problemResponses },
    },
  },
  "/api/v1/settings/{section}": {
    put: {
      operationId: "updateSettings",
      tags: ["Settings"],
      summary: "Edit one section of the deployment settings",
      description:
        "Environment variables are *defaults*; this write is the authority. The patch is validated, persisted to the product's JSON store and applied to the running process, so the change is in force for the very next request without a restart. Colours and URLs go through the same grammar the boot-time reader uses, so a settings form is not a way past them. `connection.apiKey` is write-only: it is never returned by any read model, and an empty value leaves the stored credential alone.",
      security: [{ AdminToken: [] }],
      parameters: [
        {
          name: "section",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["branding", "connection", "limits", "retention"] },
        },
      ],
      requestBody: jsonBody(ref("SettingsUpdateRequest"), true),
      responses: {
        200: jsonResponse(ref("SettingsView"), "The settings after the edit"),
        ...problemResponses,
      },
    },
    delete: {
      operationId: "resetSettings",
      tags: ["Settings"],
      summary: "Restore one section to its environment defaults",
      security: [{ AdminToken: [] }],
      parameters: [
        {
          name: "section",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["branding", "connection", "limits", "retention"] },
        },
      ],
      responses: {
        200: jsonResponse(ref("SettingsView"), "The settings after the reset"),
        ...problemResponses,
      },
    },
  },
  "/api/v1/settings/logo": {
    post: {
      operationId: "uploadLogo",
      tags: ["Settings"],
      summary: "Upload the partner logo",
      description:
        "Stores an SVG, PNG, JPEG or WebP under `DATA_DIR/branding/` and points `branding.logoUrl` at it, so a white-label deployment needs no image baked into the container and no volume edited by hand. The file is served by `GET /branding/{path}` with `Content-Security-Policy: sandbox`, because an SVG is a document.",
      security: [{ AdminToken: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["logo"],
              properties: { logo: { type: "string", format: "binary" } },
            },
          },
        },
      },
      responses: {
        200: jsonResponse(ref("SettingsView"), "The settings after the upload"),
        ...problemResponses,
      },
    },
    delete: {
      operationId: "removeLogo",
      tags: ["Settings"],
      summary: "Remove the uploaded partner logo",
      security: [{ AdminToken: [] }],
      responses: {
        200: jsonResponse(ref("SettingsView"), "The settings after the removal"),
        ...problemResponses,
      },
    },
  },
  "/api/v1/api-keys": {
    get: {
      operationId: "listApiKeys",
      tags: ["API keys"],
      summary: "Every API key this deployment has issued",
      description:
        "Names, previews, creation and last-used times, and whether each key is revoked. The key material is stored as a SHA-256 digest and is never returned — a leaked store grants nothing.",
      security: [{ AdminToken: [] }],
      responses: { 200: jsonResponse(ref("ApiKeyList"), "API keys"), ...problemResponses },
    },
    post: {
      operationId: "createApiKey",
      tags: ["API keys"],
      summary: "Issue a new API key",
      description:
        "Returns the key material **once**. It cannot be recovered afterwards; a key that is lost is revoked and reissued.",
      security: [{ AdminToken: [] }],
      requestBody: jsonBody(ref("ApiKeyCreateRequest"), true),
      responses: {
        201: jsonResponse(ref("ApiKeyCreated"), "The new key, with its secret"),
        ...problemResponses,
      },
    },
  },
  "/api/v1/api-keys/{id}": {
    put: {
      operationId: "renameApiKey",
      tags: ["API keys"],
      summary: "Rename an API key",
      security: [{ AdminToken: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      requestBody: jsonBody(ref("ApiKeyUpdateRequest"), true),
      responses: { 200: jsonResponse(ref("ApiKey"), "The renamed key"), ...problemResponses },
    },
    delete: {
      operationId: "revokeApiKey",
      tags: ["API keys"],
      summary: "Revoke an API key",
      description:
        "Revokes rather than deletes: the record of a key that once had access, and when it was last used, is exactly what an incident review needs. `purge=true` removes the row as well — which destroys that record, and is also the only way to reopen an API that keys have closed, because enforcement is sticky once a deployment has ever had a key.",
      security: [{ AdminToken: [] }],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } },
        {
          name: "purge",
          in: "query",
          schema: { type: "boolean", default: false },
          description: "Also delete the record, reopening the API if this was the last key.",
        },
      ],
      responses: { 200: jsonResponse(ref("ApiKey"), "The revoked key"), ...problemResponses },
    },
  },
  "/api/v1/views": {
    get: {
      operationId: "listViews",
      tags: ["Views"],
      summary: "Saved views on the calls list",
      security: [{ ApiKey: [] }],
      responses: { 200: jsonResponse(ref("SavedViewList"), "Saved views"), ...problemResponses },
    },
    post: {
      operationId: "createView",
      tags: ["Views"],
      summary: "Save the current calls-list filters as a named view",
      description:
        "A view is a name for a query string. It is stored on the server rather than in one browser, because a rota of supervisors reviewing the same queue should be looking at the same definition of it. The query is re-parsed through an allowlist on save. Like a share link this writes application state only and grants no access the read API does not already give, so it sits at read-level auth rather than behind the write credential.",
      security: [{ ApiKey: [] }],
      requestBody: jsonBody(ref("SavedViewRequest"), true),
      responses: { 201: jsonResponse(ref("SavedView"), "The saved view"), ...problemResponses },
    },
  },
  "/api/v1/views/{id}": {
    put: {
      operationId: "updateView",
      tags: ["Views"],
      summary: "Rename a saved view or update its filters",
      security: [{ ApiKey: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      requestBody: jsonBody(ref("SavedViewRequest"), true),
      responses: { 200: jsonResponse(ref("SavedView"), "The updated view"), ...problemResponses },
    },
    delete: {
      operationId: "deleteView",
      tags: ["Views"],
      summary: "Delete a saved view",
      security: [{ ApiKey: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 204: { description: "Deleted" }, ...problemResponses },
    },
  },
  "/api/v1/shares": {
    get: {
      operationId: "listShares",
      tags: ["Shares"],
      summary: "Every share link this deployment has issued",
      description:
        "The whole register, across every call, so links can be reviewed and revoked from one place rather than only from the call they point at. The rows carry the tokens, so this needs whatever a read needs on the deployment — it is the per-call list widened, not the public token resolver.",
      security: [{ ApiKey: [] }],
      parameters: [
        { name: "call_id", in: "query", schema: { type: "string", maxLength: 128 } },
        {
          name: "state",
          in: "query",
          schema: { type: "string", enum: ["all", "active", "revoked", "expired"], default: "all" },
        },
      ],
      responses: { 200: jsonResponse(ref("ShareList"), "Share links"), ...problemResponses },
    },
  },
  "/api/v1/retention/preview": {
    get: {
      operationId: "previewPurge",
      tags: ["Retention"],
      summary: "Which calls the retention policy would remove",
      description:
        "Always available, whether or not the policy is enabled, so an operator can see the consequence of a policy before saving it. `days=0` means no retention limit and returns no candidates — the destructive reading of a default-valued field is never the right one.",
      parameters: [
        {
          name: "days",
          in: "query",
          schema: { type: "integer", minimum: 0, maximum: 3650 },
          description: "Preview a policy other than the saved one.",
        },
      ],
      responses: {
        200: jsonResponse(ref("PurgePreview"), "What the policy would remove"),
        ...problemResponses,
      },
    },
  },
  "/api/v1/retention/purge": {
    post: {
      operationId: "runPurge",
      tags: ["Retention"],
      summary: "Delete the calls the retention policy covers",
      description:
        "Irreversible: the Knowledge Box resource, its recording and every label and analysis derived from it are removed. Share links pointing at a purged call are revoked in the same pass, so no live URL is left resolving to nothing. `dryRun` returns the same shape without deleting. One run is capped at 200 calls; `remaining` reports what the policy still covers afterwards.",
      security: [{ AdminToken: [] }],
      requestBody: jsonBody(ref("PurgeRequest"), false),
      responses: { 200: jsonResponse(ref("PurgeResult"), "What was removed"), ...problemResponses },
    },
  },
  "/api/v1/dashboard": {
    get: {
      operationId: "getDashboard",
      tags: ["Analytics"],
      summary: "Aggregated analytics across a date window",
      description:
        "Named windows are resolved on the server and snapped to whole UTC days, so a link reproduces the dashboard the sender saw and two people opening it four minutes apart share one cache entry. `from`/`to` override `range`.",
      parameters: [
        {
          name: "range",
          in: "query",
          schema: { type: "string", enum: ["7d", "30d", "90d", "12m", "all"], default: "all" },
        },
        {
          name: "from",
          in: "query",
          schema: { type: "string", maxLength: 40 },
          description: "Inclusive ISO-8601 lower bound.",
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", maxLength: 40 },
          description: "Inclusive ISO-8601 upper bound.",
        },
      ],
      responses: { 200: jsonResponse(ref("Dashboard"), "Dashboard aggregation"), ...problemResponses },
    },
  },
  "/api/v1/branding": {
    get: {
      operationId: "getBranding",
      tags: ["Branding"],
      summary: "White-label identity for this deployment",
      description:
        "Product name, wordmark or logo, colours, the powered-by toggle and the footer/docs/support links. Read by the demo UI, the admin console and any partner front-end.",
      responses: { 200: jsonResponse(ref("Branding"), "Branding"), ...problemResponses },
    },
  },
  "/api/v1/taxonomy": {
    get: {
      operationId: "getTaxonomy",
      tags: ["Analytics"],
      summary: "Labelsets, agent definitions and provisioning state in one read",
      description:
        "The Agents & Taxonomy screen asks one question — is my taxonomy live? — and answering it needs the shipped definitions, the labelsets the Knowledge Box really holds, and the agent task state compared against each other. That comparison is made here rather than in the browser.",
      responses: { 200: jsonResponse(ref("TaxonomyView"), "Taxonomy"), ...problemResponses },
    },
  },
  "/api/v1/onboarding": {
    get: {
      operationId: "getOnboarding",
      tags: ["Onboarding"],
      summary: "First-run state: what still has to happen before this deployment is useful",
      responses: { 200: jsonResponse(ref("OnboardingState"), "Onboarding state"), ...problemResponses },
    },
  },
  "/api/v1/samples": {
    post: {
      operationId: "seedSampleCalls",
      tags: ["Onboarding"],
      summary: "Load the sample dataset",
      description:
        "Provisions the taxonomy, then uploads the shipped synthetic scenarios. Repeatable: calls whose slug is already present are skipped rather than duplicated. Runs as a job so the first-run screen can show real progress.",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      requestBody: jsonBody(ref("SeedSamplesRequest"), false),
      responses: {
        202: jsonResponse(ref("Job"), "Seeding job accepted"),
        409: {
          description: "A seeding job is already running",
          content: { "application/problem+json": { schema: ref("Problem") } },
        },
        ...problemResponses,
      },
    },
  },
  "/api/v1/labelsets": {
    get: {
      operationId: "listLabelsets",
      tags: ["Taxonomy"],
      summary: "List the Knowledge Box labelsets used as filter facets",
      responses: {
        200: jsonResponse(
          {
            type: "object",
            required: ["items"],
            properties: { items: { type: "array", items: ref("LabelsetView") } },
          },
          "Labelsets",
        ),
        ...problemResponses,
      },
    },
    post: {
      operationId: "createLabelset",
      tags: ["Taxonomy"],
      summary: "Define a new labelset",
      description:
        "The shipped health-insurance taxonomy is a default, not a constraint: a partner classifying utility calls needs different reasons and different outcomes, and forking the repo to get them is the difference between a product and a sample. Creating a labelset also writes it to the Knowledge Box, so the labeler agent can apply it on the next run.",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      requestBody: jsonBody(ref("LabelsetDefinition"), true),
      responses: {
        201: jsonResponse(
          ref("LabelsetWriteResult"),
          "The labelset, and whether it reached the Knowledge Box",
        ),
        ...problemResponses,
      },
    },
  },
  "/api/v1/labelsets/{id}": {
    get: {
      operationId: "getLabelset",
      tags: ["Taxonomy"],
      summary: "One labelset definition",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 200: jsonResponse(ref("LabelsetDefinition"), "The labelset"), ...problemResponses },
    },
    put: {
      operationId: "updateLabelset",
      tags: ["Taxonomy"],
      summary: "Replace a labelset definition",
      description:
        "The path id always wins over a body id: renaming it would orphan every label already applied in the Knowledge Box under the old one. Saving also re-provisions the labelset, so the definition and the Knowledge Box cannot drift apart.",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      requestBody: jsonBody(ref("LabelsetDefinition"), true),
      responses: { 200: jsonResponse(ref("LabelsetWriteResult"), "The saved labelset"), ...problemResponses },
    },
    delete: {
      operationId: "deleteLabelset",
      tags: ["Taxonomy"],
      summary: "Remove a labelset from the taxonomy",
      description:
        "Removes it from the product's vocabulary. Whether the Knowledge Box also drops it is an explicit second choice (`?knowledge_box=true`), because the labels already applied to analysed calls are data, not configuration.",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } },
        {
          name: "knowledge_box",
          in: "query",
          schema: { type: "boolean", default: false },
          description: "Also delete the labelset — and the labels applied with it — from the Knowledge Box.",
        },
      ],
      responses: { 204: { description: "Deleted" }, ...problemResponses },
    },
  },
  "/api/v1/labelsets/{id}/provision": {
    post: {
      operationId: "provisionLabelset",
      tags: ["Taxonomy"],
      summary: "Write one labelset to the Knowledge Box",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 200: jsonResponse(ref("LabelsetWriteResult"), "Provisioned"), ...problemResponses },
    },
  },
  "/api/v1/agents": {
    get: {
      operationId: "listAgents",
      tags: ["Taxonomy"],
      summary: "The data-augmentation agents, their configuration and their live state",
      description:
        "The labeler agents' operations are derived from the current labelsets rather than stored separately, which is what keeps a labelset edit and the agent that applies it from drifting apart.",
      responses: { 200: jsonResponse(ref("AgentList"), "Agents"), ...problemResponses },
    },
  },
  "/api/v1/agents/{key}": {
    put: {
      operationId: "updateAgent",
      tags: ["Taxonomy"],
      summary: "Enable, disable or re-instruct an agent",
      description:
        "`enabled` decides whether provisioning starts the agent at all; `prompts` replaces the instruction for one of the agent's outputs, keyed by the resource field it writes. A change takes effect on the next provision — the Knowledge Box holds the running task, and rewriting an agent under a task that is mid-run is how you get half a corpus labelled two different ways.",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      parameters: [{ name: "key", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      requestBody: jsonBody(ref("AgentUpdateRequest"), true),
      responses: { 200: jsonResponse(ref("AgentConfig"), "The agent after the edit"), ...problemResponses },
    },
    delete: {
      operationId: "stopAgent",
      tags: ["Taxonomy"],
      summary: "Stop an agent's Knowledge Box task",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      parameters: [{ name: "key", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 200: jsonResponse(ref("AgentConfig"), "The agent after stopping"), ...problemResponses },
    },
  },
  "/api/v1/agents/{key}/start": {
    post: {
      operationId: "startAgent",
      tags: ["Taxonomy"],
      summary: "Start one agent against the Knowledge Box",
      description:
        "ARAG allows exactly one running task per operation type, so starting an agent that already has one fails rather than silently queueing a second.",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      parameters: [{ name: "key", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 200: jsonResponse(ref("AgentConfig"), "The agent after starting"), ...problemResponses },
    },
  },
  "/api/v1/jobs": {
    get: {
      operationId: "listJobs",
      tags: ["Jobs"],
      summary: "List background jobs",
      parameters: [
        {
          name: "kind",
          in: "query",
          schema: {
            type: "string",
            enum: ["ingest-call", "provision", "reanalyse-call", "seed-samples"],
          },
        },
        {
          name: "status",
          in: "query",
          schema: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
        },
        {
          name: "ref",
          in: "query",
          schema: { type: "string", maxLength: 128 },
          description: "The object the job is about — a call id for an ingestion.",
        },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
      ],
      responses: { 200: jsonResponse(ref("JobPage"), "Jobs"), ...problemResponses },
    },
  },
  "/api/v1/jobs/{id}": {
    get: {
      operationId: "getJob",
      tags: ["Jobs"],
      summary: "Get one job",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 200: jsonResponse(ref("Job"), "The job"), ...problemResponses },
    },
    delete: {
      operationId: "cancelJob",
      tags: ["Jobs"],
      summary: "Cancel a queued or running job",
      description:
        "Signals the job's abort controller and marks it cancelled. Work already committed upstream is not rolled back — a cancelled ingestion leaves the Knowledge Box resource it had already created, which the call list then shows as incomplete rather than pretending it never existed. A job that has already finished returns 409.",
      security: [{ ApiKey: [] }, { AdminToken: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: {
        200: jsonResponse(ref("Job"), "The cancelled job"),
        409: {
          description: "The job had already finished",
          content: { "application/problem+json": { schema: ref("Problem") } },
        },
        ...problemResponses,
      },
    },
  },
  "/api/v1/jobs/{id}/events": {
    get: {
      operationId: "getJobEvents",
      tags: ["Jobs"],
      summary: "Stream job progress (SSE)",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: {
        200: {
          description: "Server-sent events",
          content: { "text/event-stream": { schema: { type: "string" } } },
        },
        ...problemResponses,
      },
    },
  },
  "/api/v1/session": {
    post: {
      operationId: "createSession",
      tags: ["Auth"],
      summary: "Issue a same-origin demo session cookie",
      description:
        "Lets the demo UI call API-key-protected routes without exposing a key to the browser. No-op (still 200) when `API_KEYS` is unset.",
      responses: { 200: jsonResponse(ref("SessionResponse"), "Session issued"), ...problemResponses },
    },
  },
  "/api/v1/admin/login": {
    post: {
      operationId: "adminLogin",
      tags: ["Admin"],
      summary: "Exchange the admin token for an HttpOnly cookie",
      requestBody: jsonBody(ref("AdminLoginRequest")),
      responses: { 200: jsonResponse(ref("AdminLoginResponse"), "Signed in"), ...problemResponses },
    },
  },
  "/api/v1/admin/health": {
    get: {
      operationId: "adminHealth",
      tags: ["Admin"],
      summary: "Knowledge Box connection test and service health",
      security: [{ AdminToken: [] }],
      responses: { 200: jsonResponse(ref("HealthView"), "Health"), ...problemResponses },
    },
  },
  "/api/v1/admin/config": {
    get: {
      operationId: "adminConfig",
      tags: ["Admin"],
      summary: "Effective configuration (secrets redacted)",
      security: [{ AdminToken: [] }],
      responses: { 200: jsonResponse(ref("ConfigView"), "Configuration"), ...problemResponses },
    },
  },
  "/api/v1/admin/usage": {
    get: {
      operationId: "adminUsage",
      tags: ["Admin"],
      summary: "Request, ARAG, token, job and cache counters",
      security: [{ AdminToken: [] }],
      responses: { 200: jsonResponse(ref("UsageView"), "Usage"), ...problemResponses },
    },
  },
  "/api/v1/admin/logs": {
    get: {
      operationId: "adminLogs",
      tags: ["Admin"],
      summary: "Recent structured log records",
      security: [{ AdminToken: [] }],
      parameters: [
        { name: "level", in: "query", schema: { type: "string", enum: ["debug", "info", "warn", "error"] } },
        { name: "contains", in: "query", schema: { type: "string", maxLength: 200 } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 200 } },
      ],
      responses: { 200: jsonResponse(ref("LogPage"), "Log records"), ...problemResponses },
    },
  },
  "/api/v1/admin/agents": {
    get: {
      operationId: "adminAgents",
      tags: ["Admin"],
      summary: "Data-augmentation agent status from the Knowledge Box",
      security: [{ AdminToken: [] }],
      responses: { 200: jsonResponse(ref("AgentsView"), "Agents"), ...problemResponses },
    },
  },
  "/api/v1/admin/provision": {
    post: {
      operationId: "adminProvision",
      tags: ["Admin"],
      summary: "Provision labelsets and (re)start the agents",
      description:
        "Idempotent. Runs as a job because ARAG allows only one running task per operation type, so the agents must be started sequentially.",
      security: [{ AdminToken: [] }],
      requestBody: jsonBody(ref("ProvisionRequest"), false),
      responses: { 202: jsonResponse(ref("Job"), "Provisioning job accepted"), ...problemResponses },
    },
  },
  "/api/v1/admin/audit": {
    get: {
      operationId: "adminAudit",
      tags: ["Admin"],
      summary: "Who changed what, and when",
      description:
        "Every settings edit, key issue or revocation, taxonomy change and purge, with the actor and the values that changed. Secrets are reduced to `true`: an audit trail that quotes the credential is a second place to leak it.",
      security: [{ AdminToken: [] }],
      parameters: [
        { name: "action", in: "query", schema: { type: "string", maxLength: 64 } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
      ],
      responses: { 200: jsonResponse(ref("AuditPage"), "Audit records"), ...problemResponses },
    },
  },
  "/api/v1/admin/cache": {
    get: {
      operationId: "adminCache",
      tags: ["Admin"],
      summary: "Cache statistics and keys",
      security: [{ AdminToken: [] }],
      responses: { 200: jsonResponse(ref("CacheView"), "Cache"), ...problemResponses },
    },
  },
  "/api/v1/admin/cache/invalidate": {
    post: {
      operationId: "adminCacheInvalidate",
      tags: ["Admin"],
      summary: "Invalidate cached catalog ids and call summaries",
      security: [{ AdminToken: [] }],
      requestBody: jsonBody(ref("CacheInvalidateRequest"), false),
      responses: {
        200: jsonResponse(ref("CacheInvalidateResponse"), "Invalidated"),
        ...problemResponses,
      },
    },
  },
};

export const openapi: Record<string, unknown> = buildOpenApi({
  info: {
    title: "Call Analysis API",
    version: APP_VERSION,
    description:
      "Contact-centre call intelligence on Progress Agentic RAG. Upload a recording, let ARAG transcribe and augment it, then browse, filter, analyse and ask grounded questions about every call.\n\nErrors are RFC 9457 problem documents (`application/problem+json`). Public routes are rate limited per IP; `/api/v1/admin/*` requires the admin token.",
    contact: { name: "Call Analysis", url: "https://github.com/" },
  },
  tags: [
    { name: "Calls", description: "Upload, browse, stream and question analysed calls." },
    { name: "Analytics", description: "Aggregated metrics over a date window." },
    { name: "Taxonomy", description: "Labelsets and the data-augmentation agents that apply them." },
    { name: "Views", description: "Saved, shared filter sets on the calls list." },
    { name: "API keys", description: "Issue, name, revoke and audit the keys that authenticate the API." },
    { name: "Retention", description: "What the retention policy would remove, and removing it." },
    { name: "Shares", description: "Revocable, expiring links to a single call's read-only view." },
    { name: "Onboarding", description: "First-run state and the sample dataset." },
    { name: "Settings", description: "Non-sensitive deployment settings shown in the product." },
    { name: "Branding", description: "White-label identity for this deployment." },
    { name: "Jobs", description: "Background ingestion and provisioning work." },
    { name: "Auth", description: "Demo session issuance." },
    { name: "Admin", description: "Operations: health, config, usage, logs, agents, provisioning, cache." },
  ],
  paths,
  schemas,
});

/**
 * Every implemented `/api/v1` route, with the handler file that serves it. The contract tests
 * assert this list matches the spec in both directions and that each file exists, which is the
 * Next.js equivalent of the platform's `missingFromSpec(app, doc)`.
 */
export const API_ROUTES: RouteDef[] = [
  { method: "get", path: "/api/v1/calls", auth: "none", file: "app/api/v1/calls/route.ts" },
  { method: "post", path: "/api/v1/calls", auth: "write", file: "app/api/v1/calls/route.ts" },
  { method: "get", path: "/api/v1/calls/export", auth: "none", file: "app/api/v1/calls/export/route.ts" },
  { method: "post", path: "/api/v1/calls/bulk", auth: "write", file: "app/api/v1/calls/bulk/route.ts" },
  { method: "get", path: "/api/v1/calls/{id}", auth: "none", file: "app/api/v1/calls/[id]/route.ts" },
  { method: "delete", path: "/api/v1/calls/{id}", auth: "write", file: "app/api/v1/calls/[id]/route.ts" },
  {
    method: "get",
    path: "/api/v1/calls/{id}/media",
    auth: "none",
    file: "app/api/v1/calls/[id]/media/route.ts",
  },
  {
    method: "post",
    path: "/api/v1/calls/{id}/ask",
    auth: "none",
    file: "app/api/v1/calls/[id]/ask/route.ts",
  },
  {
    method: "post",
    path: "/api/v1/calls/{id}/reanalyze",
    auth: "write",
    file: "app/api/v1/calls/[id]/reanalyze/route.ts",
  },
  {
    method: "get",
    path: "/api/v1/calls/{id}/shares",
    auth: "api",
    file: "app/api/v1/calls/[id]/shares/route.ts",
  },
  {
    method: "post",
    path: "/api/v1/calls/{id}/shares",
    auth: "api",
    file: "app/api/v1/calls/[id]/shares/route.ts",
  },
  { method: "get", path: "/api/v1/shares/{token}", auth: "none", file: "app/api/v1/shares/[token]/route.ts" },
  {
    method: "delete",
    path: "/api/v1/shares/{token}",
    auth: "api",
    file: "app/api/v1/shares/[token]/route.ts",
  },
  {
    method: "get",
    path: "/api/v1/calls/{id}/export",
    auth: "none",
    file: "app/api/v1/calls/[id]/export/route.ts",
  },
  { method: "get", path: "/api/v1/settings", auth: "none", file: "app/api/v1/settings/route.ts" },
  {
    method: "put",
    path: "/api/v1/settings/{section}",
    auth: "admin",
    file: "app/api/v1/settings/[section]/route.ts",
  },
  {
    method: "delete",
    path: "/api/v1/settings/{section}",
    auth: "admin",
    file: "app/api/v1/settings/[section]/route.ts",
  },
  { method: "post", path: "/api/v1/settings/logo", auth: "admin", file: "app/api/v1/settings/logo/route.ts" },
  {
    method: "delete",
    path: "/api/v1/settings/logo",
    auth: "admin",
    file: "app/api/v1/settings/logo/route.ts",
  },
  { method: "get", path: "/api/v1/api-keys", auth: "admin", file: "app/api/v1/api-keys/route.ts" },
  { method: "post", path: "/api/v1/api-keys", auth: "admin", file: "app/api/v1/api-keys/route.ts" },
  { method: "put", path: "/api/v1/api-keys/{id}", auth: "admin", file: "app/api/v1/api-keys/[id]/route.ts" },
  {
    method: "delete",
    path: "/api/v1/api-keys/{id}",
    auth: "admin",
    file: "app/api/v1/api-keys/[id]/route.ts",
  },
  { method: "get", path: "/api/v1/views", auth: "api", file: "app/api/v1/views/route.ts" },
  { method: "post", path: "/api/v1/views", auth: "api", file: "app/api/v1/views/route.ts" },
  { method: "put", path: "/api/v1/views/{id}", auth: "api", file: "app/api/v1/views/[id]/route.ts" },
  { method: "delete", path: "/api/v1/views/{id}", auth: "api", file: "app/api/v1/views/[id]/route.ts" },
  { method: "get", path: "/api/v1/shares", auth: "api", file: "app/api/v1/shares/route.ts" },
  {
    method: "get",
    path: "/api/v1/retention/preview",
    auth: "none",
    file: "app/api/v1/retention/preview/route.ts",
  },
  {
    method: "post",
    path: "/api/v1/retention/purge",
    auth: "admin",
    file: "app/api/v1/retention/purge/route.ts",
  },
  { method: "post", path: "/api/v1/labelsets", auth: "write", file: "app/api/v1/labelsets/route.ts" },
  { method: "get", path: "/api/v1/labelsets/{id}", auth: "none", file: "app/api/v1/labelsets/[id]/route.ts" },
  {
    method: "put",
    path: "/api/v1/labelsets/{id}",
    auth: "write",
    file: "app/api/v1/labelsets/[id]/route.ts",
  },
  {
    method: "delete",
    path: "/api/v1/labelsets/{id}",
    auth: "write",
    file: "app/api/v1/labelsets/[id]/route.ts",
  },
  {
    method: "post",
    path: "/api/v1/labelsets/{id}/provision",
    auth: "write",
    file: "app/api/v1/labelsets/[id]/provision/route.ts",
  },
  { method: "get", path: "/api/v1/agents", auth: "none", file: "app/api/v1/agents/route.ts" },
  { method: "put", path: "/api/v1/agents/{key}", auth: "write", file: "app/api/v1/agents/[key]/route.ts" },
  {
    method: "delete",
    path: "/api/v1/agents/{key}",
    auth: "write",
    file: "app/api/v1/agents/[key]/route.ts",
  },
  {
    method: "post",
    path: "/api/v1/agents/{key}/start",
    auth: "write",
    file: "app/api/v1/agents/[key]/start/route.ts",
  },
  { method: "delete", path: "/api/v1/jobs/{id}", auth: "write", file: "app/api/v1/jobs/[id]/route.ts" },
  { method: "get", path: "/api/v1/admin/audit", auth: "admin", file: "app/api/v1/admin/audit/route.ts" },
  { method: "get", path: "/api/v1/taxonomy", auth: "none", file: "app/api/v1/taxonomy/route.ts" },
  { method: "get", path: "/api/v1/onboarding", auth: "none", file: "app/api/v1/onboarding/route.ts" },
  { method: "post", path: "/api/v1/samples", auth: "write", file: "app/api/v1/samples/route.ts" },
  { method: "get", path: "/api/v1/dashboard", auth: "none", file: "app/api/v1/dashboard/route.ts" },
  { method: "get", path: "/api/v1/branding", auth: "none", file: "app/api/v1/branding/route.ts" },
  { method: "get", path: "/api/v1/labelsets", auth: "none", file: "app/api/v1/labelsets/route.ts" },
  { method: "get", path: "/api/v1/jobs", auth: "none", file: "app/api/v1/jobs/route.ts" },
  { method: "get", path: "/api/v1/jobs/{id}", auth: "none", file: "app/api/v1/jobs/[id]/route.ts" },
  {
    method: "get",
    path: "/api/v1/jobs/{id}/events",
    auth: "none",
    file: "app/api/v1/jobs/[id]/events/route.ts",
  },
  { method: "post", path: "/api/v1/session", auth: "none", file: "app/api/v1/session/route.ts" },
  { method: "post", path: "/api/v1/admin/login", auth: "none", file: "app/api/v1/admin/login/route.ts" },
  { method: "get", path: "/api/v1/admin/health", auth: "admin", file: "app/api/v1/admin/health/route.ts" },
  { method: "get", path: "/api/v1/admin/config", auth: "admin", file: "app/api/v1/admin/config/route.ts" },
  { method: "get", path: "/api/v1/admin/usage", auth: "admin", file: "app/api/v1/admin/usage/route.ts" },
  { method: "get", path: "/api/v1/admin/logs", auth: "admin", file: "app/api/v1/admin/logs/route.ts" },
  { method: "get", path: "/api/v1/admin/agents", auth: "admin", file: "app/api/v1/admin/agents/route.ts" },
  {
    method: "post",
    path: "/api/v1/admin/provision",
    auth: "admin",
    file: "app/api/v1/admin/provision/route.ts",
  },
  { method: "get", path: "/api/v1/admin/cache", auth: "admin", file: "app/api/v1/admin/cache/route.ts" },
  {
    method: "post",
    path: "/api/v1/admin/cache/invalidate",
    auth: "admin",
    file: "app/api/v1/admin/cache/invalidate/route.ts",
  },
];

export default openapi;
