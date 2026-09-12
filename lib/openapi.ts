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
  method: "get" | "post" | "delete";
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
          seededCalls: { type: "integer", description: "Calls in the sample dataset (mock mode only)." },
        },
      },
      limits: { type: "object", additionalProperties: true },
      features: {
        type: "object",
        additionalProperties: true,
        description: "What this deployment allows: uploads, deletes, admin panel, API-key auth.",
      },
      apiKeys: {
        type: "object",
        required: ["configured", "managed"],
        properties: {
          configured: { type: "integer", description: "How many keys `API_KEYS` declares. Never the keys." },
          managed: {
            type: "boolean",
            description:
              "False: keys are configured by environment; in-product key management is not implemented yet.",
          },
        },
      },
      taxonomy: { type: "object", additionalProperties: true },
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
      description: "Includes revoked and expired links, so the history of who was given a pointer survives.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
      responses: { 200: jsonResponse(ref("ShareList"), "Share links"), ...problemResponses },
    },
    post: {
      operationId: "createCallShare",
      tags: ["Shares"],
      summary: "Create a revocable, expiring link to one call",
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
        "Branding, connection mode, limits, which features this deployment allows, and how many API keys are configured. Contains no secrets and no key material; the operator view with the full effective environment is `GET /api/v1/admin/config`.",
      responses: { 200: jsonResponse(ref("SettingsView"), "Settings"), ...problemResponses },
    },
  },
  "/api/v1/dashboard": {
    get: {
      operationId: "getDashboard",
      tags: ["Analytics"],
      summary: "Aggregated analytics across every analysed call",
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
      tags: ["Analytics"],
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
  },
  "/api/v1/jobs": {
    get: {
      operationId: "listJobs",
      tags: ["Jobs"],
      summary: "List background jobs",
      parameters: [
        { name: "kind", in: "query", schema: { type: "string", enum: ["ingest-call", "provision"] } },
        {
          name: "status",
          in: "query",
          schema: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
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
    { name: "Analytics", description: "Aggregated metrics and the label taxonomy." },
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
