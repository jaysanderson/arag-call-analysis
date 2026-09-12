/**
 * Contract tests. The OpenAPI document is the source of truth, so these assert three things:
 *   1. the spec itself is well formed (`lintSpec`);
 *   2. spec and implementation agree in both directions (every documented route has a handler file
 *      that exports the right method, and every implemented route is documented) — the Next.js
 *      equivalent of the platform's `missingFromSpec(app, doc)`, which needs an `App` instance;
 *   3. real success responses validate against the schemas the spec declares (`checkResponse`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testing } from "@/vendor/arag-platform/src/index.ts";
import { API_ROUTES, openapi } from "@/lib/openapi";
import { makeClient, startAppServer, type TestClient, type TestServer } from "../helpers/server";

const ROOT = resolve(import.meta.dirname, "..", "..");
const { checkResponse, lintSpec } = testing;

let server: TestServer;
let api: TestClient;

beforeAll(async () => {
  server = await startAppServer();
  api = makeClient(server.baseUrl);
}, 180_000);

afterAll(async () => {
  await server?.stop();
});

/** Walk `app/api/v1` and collect every route handler with the HTTP methods it exports. */
function discoverRoutes(): Array<{ path: string; method: string; file: string }> {
  const base = join(ROOT, "app", "api", "v1");
  const out: Array<{ path: string; method: string; file: string }> = [];
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, [...segments, entry.replace(/^\[(\.{3})?/, "{").replace(/\]$/, "}")]);
        continue;
      }
      if (entry !== "route.ts") continue;
      const src = readFileSync(full, "utf8");
      for (const method of ["GET", "POST", "DELETE", "PUT", "PATCH"]) {
        if (new RegExp(`export (const|async function|function) ${method}\\b`).test(src)) {
          out.push({
            path: `/api/v1${segments.length ? `/${segments.join("/")}` : ""}`,
            method: method.toLowerCase(),
            file: full.slice(ROOT.length + 1),
          });
        }
      }
    }
  };
  walk(base, []);
  return out;
}

/** Docs/spec endpoints are served but deliberately not described in the paths object. */
const NOT_IN_SPEC = new Set(["/api/v1/openapi.json", "/api/v1/docs", "/api/v1/swagger"]);

describe("spec lint", () => {
  it("has no lint problems", () => {
    expect(lintSpec(openapi)).toEqual([]);
  });

  it("declares OpenAPI 3.1 with security schemes and the Problem schema", () => {
    expect(openapi.openapi).toBe("3.1.0");
    const components = openapi.components as Record<string, Record<string, unknown>>;
    expect(components.schemas?.Problem).toBeTruthy();
    expect(components.securitySchemes?.AdminToken).toBeTruthy();
  });

  it("documents error responses on every operation", () => {
    const paths = openapi.paths as Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    for (const [p, ops] of Object.entries(paths)) {
      for (const [m, op] of Object.entries(ops)) {
        expect(Object.keys(op.responses ?? {}), `${m} ${p}`).toContain("400");
      }
    }
  });
});

describe("spec ↔ implementation", () => {
  const discovered = discoverRoutes();

  it("every implemented route is documented (missingFromSpec)", () => {
    const paths = openapi.paths as Record<string, Record<string, unknown>>;
    const missing = discovered
      .filter((r) => !NOT_IN_SPEC.has(r.path))
      .filter((r) => !paths[r.path]?.[r.method])
      .map((r) => `${r.method.toUpperCase()} ${r.path}`);
    expect(missing).toEqual([]);
  });

  it("every documented route has a handler file exporting that method", () => {
    const paths = openapi.paths as Record<string, Record<string, unknown>>;
    const undocumented: string[] = [];
    for (const [p, ops] of Object.entries(paths)) {
      for (const m of Object.keys(ops)) {
        if (!discovered.some((r) => r.path === p && r.method === m)) undocumented.push(`${m.toUpperCase()} ${p}`);
      }
    }
    expect(undocumented).toEqual([]);
  });

  it("API_ROUTES matches both the spec and the filesystem", () => {
    const paths = openapi.paths as Record<string, Record<string, unknown>>;
    for (const r of API_ROUTES) {
      expect(paths[r.path]?.[r.method], `${r.method} ${r.path} in spec`).toBeTruthy();
      expect(existsSync(join(ROOT, r.file)), `${r.file} exists`).toBe(true);
    }
    const declared = new Set(API_ROUTES.map((r) => `${r.method} ${r.path}`));
    for (const r of discovered) {
      if (NOT_IN_SPEC.has(r.path)) continue;
      expect(declared.has(`${r.method} ${r.path}`), `${r.method} ${r.path} declared in API_ROUTES`).toBe(true);
    }
  });

  it("marks the admin routes as admin-authenticated", () => {
    for (const r of API_ROUTES) {
      if (r.path.startsWith("/api/v1/admin/") && r.path !== "/api/v1/admin/login") {
        expect(r.auth, r.path).toBe("admin");
      }
    }
  });
});

describe("response validation (checkResponse)", () => {
  it("the served document matches the authored one", async () => {
    const res = await api.get("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.json).toEqual(JSON.parse(JSON.stringify(openapi)));
  });

  it("GET /api/v1/calls", async () => {
    const res = await api.get("/api/v1/calls?page_size=5");
    expect(checkResponse(openapi, "/api/v1/calls", "get", 200, res.json)).toEqual([]);
  });

  it("GET /api/v1/calls/{id}", async () => {
    const list = await api.get<{ items: Array<{ id: string }> }>("/api/v1/calls?page_size=1");
    const res = await api.get(`/api/v1/calls/${list.json.items[0]!.id}`);
    expect(checkResponse(openapi, "/api/v1/calls/{id}", "get", 200, res.json)).toEqual([]);
  });

  it("GET /api/v1/dashboard", async () => {
    const res = await api.get("/api/v1/dashboard");
    expect(checkResponse(openapi, "/api/v1/dashboard", "get", 200, res.json)).toEqual([]);
  });

  it("GET /api/v1/labelsets", async () => {
    const res = await api.get("/api/v1/labelsets");
    expect(checkResponse(openapi, "/api/v1/labelsets", "get", 200, res.json)).toEqual([]);
  });

  it("GET /api/v1/jobs and /api/v1/jobs/{id}", async () => {
    const list = await api.get<{ items: Array<{ id: string }> }>("/api/v1/jobs");
    expect(checkResponse(openapi, "/api/v1/jobs", "get", 200, list.json)).toEqual([]);
    if (list.json.items[0]) {
      const one = await api.get(`/api/v1/jobs/${list.json.items[0].id}`);
      expect(checkResponse(openapi, "/api/v1/jobs/{id}", "get", 200, one.json)).toEqual([]);
    }
  });

  it("POST /api/v1/session", async () => {
    const res = await api.post("/api/v1/session");
    expect(checkResponse(openapi, "/api/v1/session", "post", 200, res.json)).toEqual([]);
  });

  it("POST /api/v1/calls (202)", async () => {
    const form = new FormData();
    form.set("title", "Contract test call");
    form.set("transcript", "Agent: Hello there. Member: I have a question about my deductible.");
    const res = await api.request<{ call: { id: string } }>("POST", "/api/v1/calls", { body: form });
    expect(res.status).toBe(202);
    expect(checkResponse(openapi, "/api/v1/calls", "post", 202, res.json)).toEqual([]);
    await api.del(`/api/v1/calls/${res.json.call.id}`);
  });

  it("admin routes", async () => {
    const cases: Array<[string, string]> = [
      ["/api/v1/admin/health", "/api/v1/admin/health"],
      ["/api/v1/admin/config", "/api/v1/admin/config"],
      ["/api/v1/admin/usage", "/api/v1/admin/usage"],
      ["/api/v1/admin/logs?limit=5", "/api/v1/admin/logs"],
      ["/api/v1/admin/agents", "/api/v1/admin/agents"],
      ["/api/v1/admin/cache", "/api/v1/admin/cache"],
    ];
    for (const [url, specPath] of cases) {
      const res = await api.get(url, { admin: true });
      expect(res.status, url).toBe(200);
      expect(checkResponse(openapi, specPath, "get", 200, res.json), url).toEqual([]);
    }

    const login = await api.post("/api/v1/admin/login", { token: "test-admin-token" });
    expect(checkResponse(openapi, "/api/v1/admin/login", "post", 200, login.json)).toEqual([]);

    const provision = await api.post("/api/v1/admin/provision", { agents: false }, { admin: true });
    expect(checkResponse(openapi, "/api/v1/admin/provision", "post", 202, provision.json)).toEqual([]);

    const invalidate = await api.post("/api/v1/admin/cache/invalidate", {}, { admin: true });
    expect(
      checkResponse(openapi, "/api/v1/admin/cache/invalidate", "post", 200, invalidate.json),
    ).toEqual([]);
  });

  it("problem documents validate against the Problem schema", async () => {
    const res = await api.get("/api/v1/calls/unknown");
    expect(res.status).toBe(404);
    expect(
      checkResponse(openapi, "/api/v1/calls/{id}", "get", 404, res.json, "application/problem+json"),
    ).toEqual([]);
  });
});
