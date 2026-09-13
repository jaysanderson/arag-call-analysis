/**
 * Next.js route-handler adapter for the ARAG platform HTTP conventions.
 *
 * Next's App Router owns routing, so the platform's `App` router cannot serve these endpoints
 * directly. This module gives every `app/api/v1/**\/route.ts` handler the same behaviour the
 * platform's router would: request ids, authentication (admin token cookie/bearer, optional API
 * keys, demo session cookie), per-IP token-bucket rate limiting, OpenAPI-driven request
 * validation, security headers, access logging, usage counters, and RFC 9457 problem responses.
 *
 * Session cookies are signed by an actual platform `App` instance (`rt.app`), so the HMAC format
 * is identical to every other ARAG product.
 */
import { randomUUID } from "node:crypto";
import { openapi, type RouteAuth } from "@/lib/openapi";
import { getRuntime, type Runtime } from "@/lib/runtime";
import { apiKeysEnforced, verifyApiKey } from "@/services/apikeys";
import {
  AragError,
  constantTimeEqual,
  forbidden,
  HttpError,
  internalError,
  notFound,
  operationSchemas,
  tooManyRequests,
  unauthorized,
  validate,
  validationError,
} from "@/vendor/arag-platform/src/index.ts";

export interface AuthInfo {
  admin: boolean;
  /** The id of the managed API key that authenticated this request, not the key itself. */
  apiKey: string | null;
  /** Human-readable name of that key, for the audit trail. */
  apiKeyName?: string;
  session: boolean;
  via: "admin-token" | "api-key" | "session" | "anonymous";
}

/** How the audit trail names this caller. */
export function actorOf(auth: AuthInfo): string {
  if (auth.admin) return "operator";
  if (auth.apiKey) return `api-key:${auth.apiKeyName ?? auth.apiKey}`;
  return auth.session ? "session" : "anonymous";
}

export interface ApiContext {
  req: Request;
  url: URL;
  requestId: string;
  /** Path parameters, validated/coerced against the spec. */
  params: Record<string, string>;
  /** Query parameters, coerced and validated against the spec (arrays kept as arrays). */
  query: Record<string, unknown>;
  /** JSON body, validated against the spec (undefined for multipart/none). */
  body: unknown;
  /** Parsed multipart form (only when the route declares `body: "multipart"`). */
  form: FormData | null;
  auth: AuthInfo;
  ip: string;
  rt: Runtime;
  log: Runtime["log"];
  /** Cookies queued by the handler; applied to the final response. */
  cookies: string[];
  setCookie(name: string, value: string, opts?: CookieOptions): void;
}

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
}

export interface RouteSpec {
  /** OpenAPI path, e.g. `/api/v1/calls/{id}`. Used to look up the operation's schemas. */
  path: string;
  method: "get" | "post" | "put" | "delete";
  auth?: RouteAuth;
  /** Body handling. `auto` parses JSON when the content type says so. */
  body?: "auto" | "json" | "multipart" | "none";
  /** Skip the rate limiter entirely (long-lived, near-free streams such as job SSE). */
  noRateLimit?: boolean;
  /**
   * Give this route its own bucket, sized as a multiple of the deployment's configured limits:
   * `20` for media (a scrubbing player issues a burst of Range requests, so it needs a generous
   * bucket rather than no bucket at all), `0.25` for ask (retrieval + generation + a REMi call is
   * the most expensive thing this API does).
   *
   * The platform's `App` takes absolute `rateLimit: { rps, burst }` per route. A relative
   * multiplier is used here instead so a route's limit stays proportional to whatever the
   * deployment configured — an operator who raises `RATE_LIMIT_RPS` does not silently leave the
   * media route pinned to a hard-coded value, and tests and the showcase need no special cases.
   */
  rateLimitMultiplier?: number;
  /**
   * Byte cap for this route's body (defaults to `MAX_BODY_BYTES`). A function is resolved per
   * request, so a limit an operator edits in Settings applies to the next upload rather than to
   * the next deploy.
   */
  bodyLimit?: number | ((rt: Runtime) => number);
}

export type Handler = (ctx: ApiContext) => Promise<Response | unknown> | Response | unknown;

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
};

// ───────────────────────────── auth ─────────────────────────────

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Identify the caller. Mirrors `App.authenticate` (platform parity, ported for `Request`). */
export function authenticate(rt: Runtime, req: Request): AuthInfo {
  const authz = req.headers.get("authorization") ?? "";
  const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  const apiKeyHeader = req.headers.get("x-api-key") ?? "";
  const cookies = parseCookies(req.headers.get("cookie"));
  const adminToken = rt.env.adminToken;
  if (
    adminToken &&
    ((bearer && constantTimeEqual(bearer, adminToken)) ||
      (cookies.arag_admin && constantTimeEqual(cookies.arag_admin, adminToken)))
  ) {
    return { admin: true, apiKey: null, session: true, via: "admin-token" };
  }
  // Managed keys are stored hashed (services/apikeys.ts); `API_KEYS` is seeded into that store at
  // boot, so an environment-configured deployment authenticates through exactly the same path.
  for (const presented of [bearer, apiKeyHeader]) {
    if (!presented) continue;
    const doc = verifyApiKey(rt, presented);
    if (doc) return { admin: false, apiKey: doc.id, apiKeyName: doc.name, session: false, via: "api-key" };
  }
  if (rt.app.verifySession(cookies.arag_session))
    return { admin: false, apiKey: null, session: true, via: "session" };
  return { admin: false, apiKey: null, session: false, via: "anonymous" };
}

function enforceAuth(rt: Runtime, auth: AuthInfo, mode: RouteAuth): void {
  if (mode === "none") return;
  if (mode === "admin") {
    if (!rt.env.adminToken)
      throw forbidden("Admin access is disabled: set ADMIN_TOKEN to enable the admin panel.");
    if (!auth.admin) throw unauthorized("Admin token required");
    return;
  }
  if (mode === "write") {
    // Creating and deleting calls changes the Knowledge Box, so it never rides on the freely
    // issued demo session cookie: it needs the admin token or a real API key. The single
    // exception is a deployment with NO credentials configured at all, which can only be a local
    // mock/demo run — and even that is refused in production.
    if (auth.admin || auth.apiKey) return;
    const unconfigured = !apiKeysEnforced(rt) && !rt.env.adminToken;
    if (unconfigured && rt.env.nodeEnv !== "production") return;
    if (unconfigured)
      throw forbidden(
        "Write access is disabled: set ADMIN_TOKEN or API_KEYS to allow uploads and deletions.",
      );
    throw unauthorized("An API key (X-API-Key) or the admin token is required for this operation");
  }
  if (!apiKeysEnforced(rt)) return; // open API
  if (auth.admin || auth.apiKey || auth.session) return;
  throw unauthorized("API key required (X-API-Key or Authorization: Bearer)");
}

// ───────────────────────────── rate limit ─────────────────────────────

interface Bucket {
  tokens: number;
  ts: number;
}
const BUCKETS_KEY = "__callAnalysisBuckets__";
type GlobalWithBuckets = typeof globalThis & { [BUCKETS_KEY]?: Map<string, Bucket> };

function buckets(): Map<string, Bucket> {
  const g = globalThis as GlobalWithBuckets;
  if (!g[BUCKETS_KEY]) g[BUCKETS_KEY] = new Map();
  return g[BUCKETS_KEY];
}

/** Per-IP (or per-key) token bucket; returns seconds to wait, or null when allowed. */
export function rateLimit(
  key: string,
  rps: number,
  burst: number,
  now = Date.now(),
  store = buckets(),
): number | null {
  if (rps <= 0) return null;
  const cap = Math.max(1, burst);
  let b = store.get(key);
  if (!b) {
    b = { tokens: cap, ts: now };
    store.set(key, b);
    if (store.size > 10_000) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
  }
  b.tokens = Math.min(cap, b.tokens + ((now - b.ts) / 1000) * rps);
  b.ts = now;
  if (b.tokens < 1) return Math.ceil((1 - b.tokens) / rps);
  b.tokens -= 1;
  return null;
}

/**
 * Client IP for rate limiting. Proxy headers are trusted only per `TRUST_PROXY` (platform
 * semantics): "fly" (default) trusts `Fly-Client-IP`, which Fly's edge sets and a client behind it
 * cannot spoof; "xff" trusts the first `X-Forwarded-For` entry; "none" trusts nothing. Blindly
 * trusting `X-Forwarded-For` would let a caller rotate it per request and defeat the limiter.
 *
 * Next.js does not expose the socket address to a route handler, so with `TRUST_PROXY=none` every
 * caller shares one bucket — which is the safe direction to fail.
 */
export function clientIp(req: Request, trustProxy: Runtime["env"]["trustProxy"] = "fly"): string {
  if (trustProxy === "fly") {
    const fly = req.headers.get("fly-client-ip");
    if (fly) return fly.trim();
  } else if (trustProxy === "xff") {
    const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff) return xff;
  }
  return "unknown";
}

// ───────────────────────────── responses ─────────────────────────────

/**
 * Resolve the CORS origin for a request against `ALLOWED_ORIGINS`.
 * Empty (the default) means same-origin only: no `Access-Control-Allow-Origin` is emitted at all.
 */
export function corsOrigin(origin: string | null, allowed: string[]): string | null {
  if (allowed.length === 0) return null;
  if (allowed.includes("*")) return "*";
  return origin && allowed.includes(origin) ? origin : null;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Request-Id, Range",
  "Access-Control-Expose-Headers": "X-Request-Id, Content-Range, Location, Retry-After",
  "Access-Control-Max-Age": "600",
};

function applyHeaders(
  res: Response,
  requestId: string,
  cookies: string[],
  rt: Runtime | null,
  req?: Request,
): Response {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  if (rt?.env.nodeEnv === "production")
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  const allow = rt && req ? corsOrigin(req.headers.get("origin"), rt.env.allowedOrigins) : null;
  if (allow) {
    res.headers.set("Access-Control-Allow-Origin", allow);
    res.headers.set("Vary", "Origin");
    if (allow !== "*") res.headers.set("Access-Control-Allow-Credentials", "true");
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  }
  res.headers.set("X-Request-Id", requestId);
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
}

/**
 * CORS preflight handler. Every `/api/v1` route module exports this as `OPTIONS` so a browser on an
 * allowlisted origin can send a non-simple request; with `ALLOWED_ORIGINS` empty it answers 204
 * with no CORS headers, which is the same as not supporting cross-origin at all.
 */
export async function preflight(req: Request): Promise<Response> {
  const rt = await getRuntime().catch(() => null);
  return applyHeaders(new Response(null, { status: 204 }), "", [], rt, req);
}

export function problemResponse(err: HttpError, instance: string, requestId: string): Response {
  return new Response(JSON.stringify(err.toProblem(instance, requestId)), {
    status: err.status,
    headers: {
      "Content-Type": "application/problem+json; charset=utf-8",
      "Cache-Control": "no-store",
      ...err.headers,
    },
  });
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

/**
 * Map non-HttpError exceptions to problems. `AragError` never leaks the upstream URL, token or
 * body to a client; the request id links the response to the server log.
 */
export function toHttpError(err: unknown, production: boolean): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof AragError) {
    if (err.kind === "timeout")
      return new HttpError(504, "Upstream timeout", "ARAG did not respond in time", {
        type: "https://arag.dev/problems/upstream-timeout",
      });
    if (err.kind === "http" && err.status === 401)
      return new HttpError(502, "Upstream error", "ARAG rejected the service-account token.", {
        type: "https://arag.dev/problems/upstream",
      });
    if (err.kind === "http" && err.status === 404) return notFound("Upstream resource");
    return new HttpError(502, "Upstream error", "The Knowledge Box request failed.", {
      type: "https://arag.dev/problems/upstream",
    });
  }
  return internalError(production ? "Internal server error" : ((err as Error)?.message ?? "Unknown error"));
}

// ───────────────────────────── validation ─────────────────────────────

function groupQuery(url: URL, querySchema: Record<string, unknown> | undefined): Record<string, unknown> {
  const props = ((querySchema?.properties ?? {}) as Record<string, Record<string, unknown>>) ?? {};
  const grouped = new Map<string, string[]>();
  for (const [rawKey, value] of url.searchParams) {
    const key = rawKey.endsWith("[]") ? rawKey.slice(0, -2) : rawKey;
    const arr = grouped.get(key) ?? [];
    arr.push(value);
    grouped.set(key, arr);
  }
  const out: Record<string, unknown> = {};
  for (const [k, vals] of grouped) out[k] = props[k]?.type === "array" ? vals : vals[vals.length - 1];
  return out;
}

/**
 * Validate the scalar fields of a multipart body against the `multipart/form-data` schema declared
 * in the OpenAPI document. `format: binary` properties (the uploaded file) are skipped — their
 * size and media type are checked by the handler. Without this, the multipart contract would live
 * only in the handler and silently drift from the spec.
 */
export function validateFormFields(
  form: FormData,
  path: string,
  method: string,
): Array<{ path: string; message: string }> {
  const op = ((openapi.paths as Record<string, Record<string, unknown>>)?.[path]?.[method] ?? {}) as {
    requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> };
  };
  const schema = op.requestBody?.content?.["multipart/form-data"]?.schema;
  if (!schema) return [];
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const scalar: Record<string, unknown> = {};
  const scalarProps: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries(props)) {
    if (prop.format === "binary") continue;
    scalarProps[name] = prop;
    const v = form.get(name);
    if (typeof v === "string" && v !== "") scalar[name] = v;
  }
  const required = ((schema.required as string[] | undefined) ?? []).filter((r) => r in scalarProps);
  const { errors } = validate(
    scalar,
    { type: "object", properties: scalarProps, required, additionalProperties: true },
    { root: openapi, coerce: true },
  );
  return errors;
}

// ───────────────────────────── the adapter ─────────────────────────────

type NextRouteArgs = { params: Promise<Record<string, string | string[]>> };

/**
 * Wrap a handler with the full request pipeline. Returns the function Next expects to export from
 * a `route.ts` module.
 */
export function route(spec: RouteSpec, handler: Handler) {
  return async (req: Request, args?: NextRouteArgs): Promise<Response> => {
    const requestId = (req.headers.get("x-request-id") ?? "").slice(0, 64) || randomUUID();
    const url = new URL(req.url);
    const cookies: string[] = [];
    let rt: Runtime | null = null;
    const started = Date.now();
    let status = 500;
    try {
      rt = await getRuntime();
      const log = rt.log.child({ requestId });
      rt.usage.requests++;
      const routeKey = `${spec.method.toUpperCase()} ${spec.path}`;
      rt.usage.byRoute[routeKey] = (rt.usage.byRoute[routeKey] ?? 0) + 1;

      const auth = authenticate(rt, req);
      enforceAuth(rt, auth, spec.auth ?? "none");

      if (!spec.noRateLimit && !auth.admin) {
        const mult = spec.rateLimitMultiplier ?? 1;
        const who = auth.apiKey ? `k:${auth.apiKey}` : `ip:${clientIp(req, rt.env.trustProxy)}`;
        // A route with its own multiplier gets its own bucket, so it neither drains nor is drained
        // by the shared one.
        const retry = rateLimit(
          mult === 1 ? who : `${spec.method} ${spec.path}|${who}`,
          rt.env.rateLimitRps * mult,
          Math.max(1, rt.env.rateLimitBurst * mult),
        );
        if (retry !== null) throw tooManyRequests(retry);
      }

      const schemas = operationSchemas(openapi, spec.path, spec.method);

      // path params
      const rawParams = (await args?.params) ?? {};
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawParams)) params[k] = Array.isArray(v) ? (v[0] ?? "") : v;
      if (schemas.params) {
        const r = validate(params, schemas.params as Record<string, unknown>, {
          root: openapi,
          coerce: true,
        });
        if (r.errors.length) throw validationError(r.errors, "path");
      }

      // query
      let query: Record<string, unknown> = groupQuery(url, schemas.query as Record<string, unknown>);
      if (schemas.query) {
        const r = validate(query, schemas.query as Record<string, unknown>, {
          root: openapi,
          coerce: true,
        });
        if (r.errors.length) throw validationError(r.errors, "query");
        query = r.value as Record<string, unknown>;
      }

      // body
      let body: unknown;
      let form: FormData | null = null;
      const mode = spec.body ?? "auto";
      const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
      const declared = Number(req.headers.get("content-length") ?? 0);
      const limit =
        (typeof spec.bodyLimit === "function" ? spec.bodyLimit(rt) : spec.bodyLimit) ?? rt.env.maxBodyBytes;
      if (declared > limit) throw new HttpError(413, "Payload too large", `Body exceeds ${limit} bytes`);
      if (mode === "multipart") {
        if (!contentType.startsWith("multipart/form-data"))
          throw new HttpError(415, "Unsupported media type", "Expected multipart/form-data");
        try {
          form = await req.formData();
        } catch {
          // A malformed body of a declared type is the client's error, not a server fault.
          throw validationError([{ path: "", message: "body is not valid multipart/form-data" }], "body");
        }
        const errors = validateFormFields(form, spec.path, spec.method);
        if (errors.length) throw validationError(errors, "body");
      } else if (mode === "json" || (mode === "auto" && req.method !== "GET")) {
        const text = await req.text();
        if (text.length > limit) throw new HttpError(413, "Payload too large", `Body exceeds ${limit} bytes`);
        if (text.trim()) {
          try {
            body = JSON.parse(text);
          } catch {
            throw validationError([{ path: "", message: "body is not valid JSON" }], "body");
          }
        } else {
          body = {};
        }
        if (schemas.body) {
          const r = validate(body, schemas.body as Record<string, unknown>, { root: openapi });
          if (r.errors.length) throw validationError(r.errors, "body");
          body = r.value;
        }
      }

      const ctx: ApiContext = {
        req,
        url,
        requestId,
        params,
        query,
        body,
        form,
        auth,
        ip: clientIp(req, rt.env.trustProxy),
        rt,
        log,
        cookies,
        setCookie(name, value, opts = {}) {
          const parts = [
            `${name}=${encodeURIComponent(value)}`,
            `Path=${opts.path ?? "/"}`,
            `SameSite=${opts.sameSite ?? "Lax"}`,
          ];
          if (opts.httpOnly !== false) parts.push("HttpOnly");
          if (opts.secure ?? rt!.env.nodeEnv === "production") parts.push("Secure");
          if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
          cookies.push(parts.join("; "));
        },
      };

      const out = await handler(ctx);
      const res = out instanceof Response ? out : jsonResponse(out ?? {});
      status = res.status;
      return applyHeaders(res, requestId, cookies, rt, req);
    } catch (err) {
      const httpErr = toHttpError(err, rt?.env.nodeEnv === "production");
      status = httpErr.status;
      if (rt) {
        rt.usage.errors++;
        // A deliberate 5xx (an upstream failure the code mapped on purpose) is a warning with no
        // stack; only an unexpected throw gets error level and a stack, so real bugs stay visible.
        if (httpErr.status >= 500) {
          const deliberate = err instanceof HttpError || err instanceof AragError;
          rt.log[deliberate ? "warn" : "error"]("http.error", {
            requestId,
            path: url.pathname,
            status: httpErr.status,
            message: (err as Error)?.message,
            ...(deliberate ? {} : { stack: (err as Error)?.stack?.split("\n").slice(0, 4).join(" | ") }),
          });
        }
      }
      return applyHeaders(problemResponse(httpErr, url.pathname, requestId), requestId, cookies, rt, req);
    } finally {
      if (rt) {
        const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
        rt.log[level]("http", {
          requestId,
          method: req.method,
          path: url.pathname,
          status,
          ms: Date.now() - started,
        });
      }
    }
  };
}

/** 204 helper. */
export const noContent = (): Response => new Response(null, { status: 204 });
