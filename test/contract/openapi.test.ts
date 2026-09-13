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
import { API_ROUTES, openapi } from "@/lib/openapi";
import { APP_VERSION } from "@/lib/version";
import { testing } from "@/vendor/arag-platform/src/index.ts";
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
      // OPTIONS is the shared CORS preflight handler, not an API operation, so it is not in the spec.
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

  it("keeps lib/version.ts in step with package.json (see DECISIONS D-CA-11)", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
    expect((openapi.info as { version: string }).version).toBe(pkg.version);
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
        if (!discovered.some((r) => r.path === p && r.method === m))
          undocumented.push(`${m.toUpperCase()} ${p}`);
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
      expect(declared.has(`${r.method} ${r.path}`), `${r.method} ${r.path} declared in API_ROUTES`).toBe(
        true,
      );
    }
  });

  it("marks every mutation as write- or admin-authenticated", () => {
    // Anything that creates, changes or destroys state needs the admin token or an API key — never
    // the freely issued browser session. The rule is asserted rather than a list enumerated, so a
    // new mutating route cannot be added without deciding its auth.
    //
    // Three deliberate exceptions, each for its own reason:
    //  - share links and saved views write application state only and grant no access the open
    //    read API does not already give (see the operation descriptions in lib/openapi.ts);
    //  - `/session` issues the demo session and `/admin/login` exchanges the admin token, so
    //    neither can require the credential it hands out;
    //  - `/ask` is a read that happens to be a POST because the question is a body.
    const EXCEPT = new Set(["/api/v1/session", "/api/v1/calls/{id}/ask", "/api/v1/admin/login"]);
    const mutations = API_ROUTES.filter(
      (r) =>
        (r.method === "post" || r.method === "put" || r.method === "delete") &&
        !r.path.includes("/shares") &&
        !r.path.startsWith("/api/v1/views") &&
        !EXCEPT.has(r.path),
    );
    expect(mutations.length).toBeGreaterThan(20);
    for (const r of mutations) expect(["write", "admin"], `${r.method} ${r.path}`).toContain(r.auth);

    // Settings, API keys and retention are operator surfaces: an API key must not be able to
    // re-point the deployment at another Knowledge Box or mint itself a new credential.
    const operatorOnly = mutations.filter(
      (r) =>
        r.path.startsWith("/api/v1/settings") ||
        r.path.startsWith("/api/v1/api-keys") ||
        r.path.startsWith("/api/v1/retention/purge"),
    );
    expect(operatorOnly.length).toBeGreaterThanOrEqual(8);
    for (const r of operatorOnly) expect(r.auth, `${r.method} ${r.path}`).toBe("admin");
  });

  it("keeps share links at read-level auth and says why in the spec", () => {
    const shares = API_ROUTES.filter((r) => r.path.includes("/shares"));
    expect(shares.length).toBe(5);
    for (const r of shares) {
      // Resolving a token is public (the token is the credential); the rest need whatever a read
      // needs on this deployment.
      expect(["none", "api"], `${r.method} ${r.path}`).toContain(r.auth);
    }
    const op = (openapi.paths as Record<string, Record<string, { description?: string }>>)[
      "/api/v1/calls/{id}/shares"
    ]?.post;
    expect(op?.description).toMatch(/grant no access the read API does not already give/);
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

  it("GET /api/v1/calls with the table's filter and sort parameters", async () => {
    const res = await api.get(
      "/api/v1/calls?sort=duration&order=asc&media_type=transcript&page_size=5&min_duration=0",
    );
    expect(res.status).toBe(200);
    expect(checkResponse(openapi, "/api/v1/calls", "get", 200, res.json)).toEqual([]);
    const page = res.json as { items: Array<{ mediaType: string; durationSec?: number }>; facets: unknown[] };
    expect(Array.isArray(page.facets)).toBe(true);
    for (const c of page.items) expect(c.mediaType).toBe("transcript");
    const durations = page.items.map((c) => c.durationSec ?? 0);
    expect([...durations].sort((a, b) => a - b)).toEqual(durations);
  });

  it("GET /api/v1/calls/export serves CSV and JSON attachments", async () => {
    const csv = await api.request("GET", "/api/v1/calls/export?format=csv&limit=5", {});
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toContain("attachment");
    expect(csv.text.split("\n")[0]).toContain("id,title,created");

    const json = await api.request("GET", "/api/v1/calls/export?format=json&limit=5", {});
    expect(json.status).toBe(200);
    const parsed = JSON.parse(json.text) as { count: number; calls: unknown[] };
    expect(parsed.calls.length).toBe(parsed.count);
  });

  it("POST /api/v1/calls/bulk reports per-id outcomes", async () => {
    const form = new FormData();
    form.set("title", "Bulk contract test call");
    form.set("transcript", "Agent: Hello. Member: I want to check a claim.");
    const created = await api.request<{ call: { id: string } }>("POST", "/api/v1/calls", {
      body: form,
      admin: true,
    });
    const id = created.json.call.id;

    const res = await api.post(
      "/api/v1/calls/bulk",
      { action: "delete", ids: [id, "definitely-not-a-call"] },
      { admin: true },
    );
    expect(res.status).toBe(200);
    expect(checkResponse(openapi, "/api/v1/calls/bulk", "post", 200, res.json)).toEqual([]);
    const body = res.json as { requested: number; succeeded: number; failed: Array<{ id: string }> };
    expect(body.requested).toBe(2);
    expect(body.succeeded).toBe(1);
    expect(body.failed.map((f) => f.id)).toEqual(["definitely-not-a-call"]);
  });

  it("POST /api/v1/calls/{id}/reanalyze queues a job", async () => {
    const list = await api.get<{ items: Array<{ id: string }> }>("/api/v1/calls?page_size=1");
    const id = list.json.items[0]!.id;
    const res = await api.post(`/api/v1/calls/${id}/reanalyze`, undefined, { admin: true });
    expect(res.status).toBe(202);
    expect(checkResponse(openapi, "/api/v1/calls/{id}/reanalyze", "post", 202, res.json)).toEqual([]);
  });

  it("share links are created, resolved and revoked", async () => {
    const list = await api.get<{ items: Array<{ id: string }> }>("/api/v1/calls?page_size=1");
    const id = list.json.items[0]!.id;

    const created = await api.post<{ token: string; url: string }>(
      `/api/v1/calls/${id}/shares`,
      { ttlDays: 1, note: "contract test" },
      { admin: true },
    );
    expect(created.status).toBe(201);
    expect(checkResponse(openapi, "/api/v1/calls/{id}/shares", "post", 201, created.json)).toEqual([]);
    const token = created.json.token;
    expect(created.json.url).toBe(`/s/${token}`);

    // Resolution is public: the token is the only credential.
    const resolved = await api.get(`/api/v1/shares/${token}`);
    expect(resolved.status).toBe(200);
    expect(checkResponse(openapi, "/api/v1/shares/{token}", "get", 200, resolved.json)).toEqual([]);

    const listed = await api.get(`/api/v1/calls/${id}/shares`, { admin: true });
    expect(checkResponse(openapi, "/api/v1/calls/{id}/shares", "get", 200, listed.json)).toEqual([]);

    const revoked = await api.del(`/api/v1/shares/${token}`, { admin: true });
    expect(revoked.status).toBe(200);
    // A revoked token stops resolving, and says only "not found".
    const after = await api.get(`/api/v1/shares/${token}`);
    expect(after.status).toBe(404);
  });

  it("GET /api/v1/calls/{id}/export serves json, txt and vtt", async () => {
    const list = await api.get<{ items: Array<{ id: string }> }>("/api/v1/calls?page_size=1");
    const id = list.json.items[0]!.id;

    const json = await api.request("GET", `/api/v1/calls/${id}/export?format=json`, {});
    expect(json.status).toBe(200);
    expect(json.headers.get("content-disposition")).toContain("attachment");
    expect((JSON.parse(json.text) as { call: { id: string } }).call.id).toBe(id);

    const txt = await api.request("GET", `/api/v1/calls/${id}/export?format=txt`, {});
    expect(txt.headers.get("content-type")).toContain("text/plain");

    const vtt = await api.request("GET", `/api/v1/calls/${id}/export?format=vtt`, {});
    expect(vtt.headers.get("content-type")).toContain("text/vtt");
    expect(vtt.text.startsWith("WEBVTT")).toBe(true);
    // Cue timestamps must be HH:MM:SS.mmm or a player rejects the file.
    expect(vtt.text).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it("GET /api/v1/taxonomy reports labelsets, agents and provisioning state", async () => {
    const res = await api.get("/api/v1/taxonomy");
    expect(res.status).toBe(200);
    expect(checkResponse(openapi, "/api/v1/taxonomy", "get", 200, res.json)).toEqual([]);
    const body = res.json as {
      labelsets: Array<{ shipped: boolean; provisioned: boolean }>;
      provisioning: { state: string };
    };
    expect(body.labelsets.length).toBeGreaterThan(0);
    expect(["provisioned", "partial", "absent", "running"]).toContain(body.provisioning.state);
  });

  it("GET /api/v1/onboarding computes four steps from the live system", async () => {
    const res = await api.get("/api/v1/onboarding");
    expect(res.status).toBe(200);
    expect(checkResponse(openapi, "/api/v1/onboarding", "get", 200, res.json)).toEqual([]);
    const body = res.json as { steps: Array<{ key: string }>; mode: string; callCount: number };
    expect(body.steps.map((s) => s.key)).toEqual(["connect", "taxonomy", "calls", "analysis"]);
    expect(body.mode).toBe("mock");
    expect(body.callCount).toBeGreaterThan(0);
  });

  it("GET /api/v1/settings exposes no secrets", async () => {
    const res = await api.get("/api/v1/settings");
    expect(res.status).toBe(200);
    expect(checkResponse(openapi, "/api/v1/settings", "get", 200, res.json)).toEqual([]);
    const raw = JSON.stringify(res.json);
    expect(raw).not.toContain("test-admin-token");
    const body = res.json as {
      connection: { kbId: string; apiKeySet: boolean };
      apiKeys: { managed: boolean };
    };
    // Truncated, never the whole Knowledge Box id.
    expect(body.connection.kbId.length).toBeLessThanOrEqual(9);
    // Keys are managed in the product now; the read model reports *whether* a service-account
    // token is set, and never the token.
    expect(body.apiKeys.managed).toBe(true);
    expect(typeof body.connection.apiKeySet).toBe("boolean");
    expect(raw).not.toContain('apiKey":"');
  });

  it("GET /api/v1/dashboard", async () => {
    const res = await api.get("/api/v1/dashboard");
    expect(checkResponse(openapi, "/api/v1/dashboard", "get", 200, res.json)).toEqual([]);
  });

  it("GET /api/v1/branding", async () => {
    const res = await api.get("/api/v1/branding");
    expect(res.status).toBe(200);
    expect(checkResponse(openapi, "/api/v1/branding", "get", 200, res.json)).toEqual([]);
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
    const res = await api.request<{ call: { id: string } }>("POST", "/api/v1/calls", {
      body: form,
      admin: true,
    });
    expect(res.status).toBe(202);
    expect(checkResponse(openapi, "/api/v1/calls", "post", 202, res.json)).toEqual([]);
    await api.del(`/api/v1/calls/${res.json.call.id}`, { admin: true });
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
    expect(checkResponse(openapi, "/api/v1/admin/cache/invalidate", "post", 200, invalidate.json)).toEqual(
      [],
    );
  });

  it("problem documents validate against the Problem schema", async () => {
    const res = await api.get("/api/v1/calls/unknown");
    expect(res.status).toBe(404);
    expect(
      checkResponse(openapi, "/api/v1/calls/{id}", "get", 404, res.json, "application/problem+json"),
    ).toEqual([]);
  });
});
