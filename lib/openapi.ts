/**
 * The Call Analysis public API contract — authored here first, implemented second.
 *
 * This document is the single source of truth: it is served at `/api/v1/openapi.json`, rendered by
 * Redoc (`/api/v1/docs`) and Swagger UI (`/api/v1/swagger`), used by `operationSchemas()` to
 * validate every incoming request, and used by the contract tests (`lintSpec`, response checks and
 * the route-coverage check built from `API_ROUTES` below).
 */
import {
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

/** Auth mode per route, consumed by `lib/api.ts` and asserted by the contract tests. */
export type RouteAuth = "none" | "api" | "admin";

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
    charStart: { type: "integer", description: "Offset into the field's extracted text; citations use the same range." },
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
    recent: { type: "array", items: ref("CallSummary") },
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

const schemas: Record<string, unknown> = {
  ResourceLabel,
  CallMetrics,
  CallAnalysis,
  CallSummary,
  CallParagraph,
  CallDetail,
  Datum,
  Dashboard,
  LabelsetView,
  AgentStatus,
  CacheStats,
  CallPage: pageSchema("#/components/schemas/CallSummary"),
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

const paths: Record<string, Record<string, unknown>> = {
  "/api/v1/calls": {
    get: {
      operationId: "listCalls",
      tags: ["Calls"],
      summary: "List analysed calls",
      description:
        "Full-text/semantic search across transcripts when `q` is set, otherwise the whole catalog, filtered by ARAG-assigned labels.",
      parameters: [
        { name: "q", in: "query", description: "Search query across transcripts.", schema: { type: "string", maxLength: 200 } },
        {
          name: "label",
          in: "query",
          description: "Facet filter as `labelset/label`; repeat for AND across facets.",
          schema: { type: "array", items: { type: "string", maxLength: 120 } },
        },
        PageQuery.page,
        PageQuery.pageSize,
      ],
      responses: { 200: jsonResponse(ref("CallPage"), "A page of calls"), ...problemResponses },
    },
    post: {
      operationId: "createCall",
      tags: ["Calls"],
      summary: "Upload a call",
      description:
        "Accepts `multipart/form-data` with either a `recording` file (audio/video — ARAG transcribes it) or a `transcript` text field, plus call metadata. Returns a job that completes when the call is retrievable.",
      security: [{ ApiKey: [] }, { Bearer: [] }, {}],
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
      security: [{ ApiKey: [] }, { Bearer: [] }, {}],
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
        200: { description: "The media stream", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
        206: { description: "Partial content (Range request)", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
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
  "/api/v1/dashboard": {
    get: {
      operationId: "getDashboard",
      tags: ["Analytics"],
      summary: "Aggregated analytics across every analysed call",
      responses: { 200: jsonResponse(ref("Dashboard"), "Dashboard aggregation"), ...problemResponses },
    },
  },
  "/api/v1/labelsets": {
    get: {
      operationId: "listLabelsets",
      tags: ["Analytics"],
      summary: "List the Knowledge Box labelsets used as filter facets",
      responses: {
        200: jsonResponse(
          { type: "object", required: ["items"], properties: { items: { type: "array", items: ref("LabelsetView") } } },
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
        200: { description: "Server-sent events", content: { "text/event-stream": { schema: { type: "string" } } } },
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
  { method: "post", path: "/api/v1/calls", auth: "api", file: "app/api/v1/calls/route.ts" },
  { method: "get", path: "/api/v1/calls/{id}", auth: "none", file: "app/api/v1/calls/[id]/route.ts" },
  { method: "delete", path: "/api/v1/calls/{id}", auth: "api", file: "app/api/v1/calls/[id]/route.ts" },
  {
    method: "get",
    path: "/api/v1/calls/{id}/media",
    auth: "none",
    file: "app/api/v1/calls/[id]/media/route.ts",
  },
  { method: "post", path: "/api/v1/calls/{id}/ask", auth: "none", file: "app/api/v1/calls/[id]/ask/route.ts" },
  { method: "get", path: "/api/v1/dashboard", auth: "none", file: "app/api/v1/dashboard/route.ts" },
  { method: "get", path: "/api/v1/labelsets", auth: "none", file: "app/api/v1/labelsets/route.ts" },
  { method: "get", path: "/api/v1/jobs", auth: "none", file: "app/api/v1/jobs/route.ts" },
  { method: "get", path: "/api/v1/jobs/{id}", auth: "none", file: "app/api/v1/jobs/[id]/route.ts" },
  { method: "get", path: "/api/v1/jobs/{id}/events", auth: "none", file: "app/api/v1/jobs/[id]/events/route.ts" },
  { method: "post", path: "/api/v1/session", auth: "none", file: "app/api/v1/session/route.ts" },
  { method: "post", path: "/api/v1/admin/login", auth: "none", file: "app/api/v1/admin/login/route.ts" },
  { method: "get", path: "/api/v1/admin/health", auth: "admin", file: "app/api/v1/admin/health/route.ts" },
  { method: "get", path: "/api/v1/admin/config", auth: "admin", file: "app/api/v1/admin/config/route.ts" },
  { method: "get", path: "/api/v1/admin/usage", auth: "admin", file: "app/api/v1/admin/usage/route.ts" },
  { method: "get", path: "/api/v1/admin/logs", auth: "admin", file: "app/api/v1/admin/logs/route.ts" },
  { method: "get", path: "/api/v1/admin/agents", auth: "admin", file: "app/api/v1/admin/agents/route.ts" },
  { method: "post", path: "/api/v1/admin/provision", auth: "admin", file: "app/api/v1/admin/provision/route.ts" },
  { method: "get", path: "/api/v1/admin/cache", auth: "admin", file: "app/api/v1/admin/cache/route.ts" },
  {
    method: "post",
    path: "/api/v1/admin/cache/invalidate",
    auth: "admin",
    file: "app/api/v1/admin/cache/invalidate/route.ts",
  },
];

export default openapi;
