/**
 * Integration tests: the real Next.js server, the real route handlers and the real service layer,
 * against the in-process mock ARAG. Every `/api/v1` route is exercised here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeClient, startAppServer, type TestClient, type TestServer } from "../helpers/server";

let server: TestServer;
let api: TestClient;

interface CallSummary {
  id: string;
  title: string;
  mediaType: string;
  labels: Array<{ labelset: string; label: string }>;
  metrics?: Record<string, unknown>;
  momentTrack?: string[];
}
interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  next_page: boolean;
}
interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  requestId?: string;
}

beforeAll(async () => {
  server = await startAppServer();
  api = makeClient(server.baseUrl);
}, 180_000);

afterAll(async () => {
  // try/finally semantics: the server is stopped even if a test above failed.
  await server?.stop();
});

async function firstCall(): Promise<CallSummary> {
  const res = await api.get<Page<CallSummary>>("/api/v1/calls?page_size=1");
  expect(res.status).toBe(200);
  const call = res.json.items[0];
  if (!call) throw new Error("mock ARAG returned no seeded calls");
  return call;
}

describe("health", () => {
  it("reports liveness and readiness", async () => {
    expect((await api.get("/healthz")).status).toBe(200);
    const ready = await api.get<{ ok: boolean; mock: boolean }>("/readyz");
    expect(ready.status).toBe(200);
    expect(ready.json.ok).toBe(true);
    expect(ready.json.mock).toBe(true);
  });
});

describe("GET /api/v1/calls", () => {
  it("returns a page of analysed calls with labels and metrics", async () => {
    const res = await api.get<Page<CallSummary>>("/api/v1/calls");
    expect(res.status).toBe(200);
    expect(res.json.items.length).toBeGreaterThan(0);
    expect(res.json.total).toBeGreaterThanOrEqual(res.json.items.length);
    const call = res.json.items[0]!;
    expect(call.labels.length).toBeGreaterThan(0);
    expect(call.metrics).toBeTruthy();
  });

  it("paginates", async () => {
    const p1 = await api.get<Page<CallSummary>>("/api/v1/calls?page=1&page_size=2");
    const p2 = await api.get<Page<CallSummary>>("/api/v1/calls?page=2&page_size=2");
    expect(p1.json.items).toHaveLength(2);
    expect(p1.json.next_page).toBe(true);
    expect(p2.json.items[0]?.id).not.toBe(p1.json.items[0]?.id);
  });

  it("filters by label facet", async () => {
    const all = await api.get<Page<CallSummary>>("/api/v1/calls?page_size=200");
    const label = all.json.items.flatMap((c) => c.labels).find((l) => l.labelset === "call_reason");
    expect(label).toBeTruthy();
    const filtered = await api.get<Page<CallSummary>>(
      `/api/v1/calls?label=${encodeURIComponent(`${label!.labelset}/${label!.label}`)}`,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.json.items.length).toBeGreaterThan(0);
    for (const c of filtered.json.items) {
      expect(c.labels.some((l) => l.labelset === label!.labelset && l.label === label!.label)).toBe(true);
    }
  });

  it("searches transcripts", async () => {
    const res = await api.get<Page<CallSummary>>("/api/v1/calls?q=premium");
    expect(res.status).toBe(200);
    expect(res.json.items.length).toBeGreaterThan(0);
  });

  it("rejects an out-of-range page_size with a problem document", async () => {
    const res = await api.get<Problem>("/api/v1/calls?page_size=9999");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(res.json.type).toContain("validation");
    expect(res.json.requestId).toBeTruthy();
  });
});

describe("GET /api/v1/calls/{id}", () => {
  it("returns transcript paragraphs, moments and generated analysis", async () => {
    const call = await firstCall();
    const res = await api.get<{
      id: string;
      transcriptText: string;
      paragraphs: Array<{ text: string; moments: string[]; charStart: number; charEnd: number }>;
      analysis?: { executive_summary?: string };
      fieldId: string;
    }>(`/api/v1/calls/${call.id}`);
    expect(res.status).toBe(200);
    expect(res.json.transcriptText.length).toBeGreaterThan(0);
    expect(res.json.paragraphs.length).toBeGreaterThan(0);
    expect(res.json.paragraphs.some((p) => p.moments.length > 0)).toBe(true);
    expect(res.json.analysis?.executive_summary).toBeTruthy();
  });

  it("404s for an unknown id", async () => {
    const res = await api.get<Problem>("/api/v1/calls/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.json.status).toBe(404);
  });
});

describe("GET /api/v1/calls/{id}/media", () => {
  it("streams a recording and honours Range", async () => {
    const all = await api.get<Page<CallSummary & { id: string }>>("/api/v1/calls?page_size=200");
    const audio = all.json.items.find((c) => c.mediaType === "audio" || c.mediaType === "video");
    expect(audio).toBeTruthy();
    const full = await fetch(`${server.baseUrl}/api/v1/calls/${audio!.id}/media?field=media`);
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    await full.arrayBuffer();

    const partial = await fetch(`${server.baseUrl}/api/v1/calls/${audio!.id}/media?field=media`, {
      headers: { Range: "bytes=0-99" },
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toMatch(/^bytes 0-99\//);
    await partial.arrayBuffer();
  });

  it("rejects a field outside the allowlist", async () => {
    const call = await firstCall();
    const res = await api.get<Problem>(`/api/v1/calls/${call.id}/media?field=secrets`);
    expect(res.status).toBe(400);
    expect(res.json.detail).toContain("field");
  });
});

describe("POST /api/v1/calls/{id}/ask", () => {
  it("streams NDJSON with retrieval, answer, citations and a REMi quality item", async () => {
    const call = await firstCall();
    const res = await fetch(`${server.baseUrl}/api/v1/calls/${call.id}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "What did the member ask about?" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const text = await res.text();
    const items = text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l).item as { type: string; text?: string });
    const types = items.map((i) => i.type);
    expect(types).toContain("retrieval");
    expect(types).toContain("answer");
    expect(types).toContain("quality");
    const answer = items
      .filter((i) => i.type === "answer")
      .map((i) => i.text ?? "")
      .join("");
    expect(answer.length).toBeGreaterThan(0);
  });

  it("validates question length against the spec", async () => {
    const call = await firstCall();
    const tooLong = await api.post<Problem>(`/api/v1/calls/${call.id}/ask`, { question: "x".repeat(5_000) });
    expect(tooLong.status).toBe(400);
    const tooShort = await api.post<Problem>(`/api/v1/calls/${call.id}/ask`, { question: "a" });
    expect(tooShort.status).toBe(400);
    const missing = await api.post<Problem>(`/api/v1/calls/${call.id}/ask`, {});
    expect(missing.status).toBe(400);
  });

  it("404s before streaming when the call does not exist", async () => {
    const res = await api.post<Problem>("/api/v1/calls/nope/ask", { question: "anything at all?" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/calls and DELETE", () => {
  it("accepts a transcript upload, returns a job, then deletes the call", async () => {
    const form = new FormData();
    form.set("title", "Integration test call");
    form.set("queue", "Claims");
    form.set("agent_name", "Test Agent");
    form.set(
      "transcript",
      "Agent: Thank you for calling, this call is recorded.\n\nMember: My claim for physiotherapy was denied and I want it reviewed.",
    );
    const created = await api.request<{ job: { id: string }; call: { id: string } }>(
      "POST",
      "/api/v1/calls",
      { body: form },
    );
    expect(created.status).toBe(202);
    expect(created.headers.get("location")).toBe(`/api/v1/calls/${created.json.call.id}`);

    // The job finishes almost immediately against the mock.
    let job = await api.get<{ status: string; result?: { callId: string } }>(
      `/api/v1/jobs/${created.json.job.id}`,
    );
    for (let i = 0; i < 40 && !["succeeded", "failed"].includes(job.json.status); i++) {
      await new Promise((r) => setTimeout(r, 250));
      job = await api.get(`/api/v1/jobs/${created.json.job.id}`);
    }
    expect(job.json.status).toBe("succeeded");
    expect(job.json.result?.callId).toBe(created.json.call.id);

    const fetched = await api.get<{ id: string; title: string }>(`/api/v1/calls/${created.json.call.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.json.title).toBe("Integration test call");

    const deleted = await api.del(`/api/v1/calls/${created.json.call.id}`);
    expect(deleted.status).toBe(204);
    expect((await api.get(`/api/v1/calls/${created.json.call.id}`)).status).toBe(404);
  });

  it("rejects an upload with neither a transcript nor a recording", async () => {
    const form = new FormData();
    form.set("title", "Empty");
    const res = await api.request<Problem>("POST", "/api/v1/calls", { body: form });
    expect(res.status).toBe(400);
  });

  it("rejects a recording with a disallowed content type", async () => {
    const form = new FormData();
    form.set("title", "Bad type");
    form.set(
      "recording",
      new File([new Uint8Array([1, 2, 3])], "x.exe", { type: "application/x-msdownload" }),
    );
    const res = await api.request<Problem>("POST", "/api/v1/calls", { body: form });
    expect(res.status).toBe(415);
  });
});

describe("GET /api/v1/dashboard", () => {
  it("aggregates the generated metrics", async () => {
    const res = await api.get<{
      total: number;
      withMetrics: number;
      byReason: Array<{ name: string; value: number }>;
      recent: CallSummary[];
    }>("/api/v1/dashboard");
    expect(res.status).toBe(200);
    expect(res.json.total).toBeGreaterThan(0);
    expect(res.json.withMetrics).toBeGreaterThan(0);
    expect(res.json.byReason.length).toBeGreaterThan(0);
    expect(res.json.recent.length).toBeGreaterThan(0);
  });
});

describe("GET /api/v1/labelsets", () => {
  it("returns the taxonomy facets in display order", async () => {
    const res = await api.get<{ items: Array<{ id: string; title: string; labels: string[] }> }>(
      "/api/v1/labelsets",
    );
    expect(res.status).toBe(200);
    expect(res.json.items[0]?.id).toBe("call_reason");
    expect(res.json.items.find((l) => l.id === "moment")?.labels.length).toBeGreaterThan(0);
  });
});

describe("POST /api/v1/session", () => {
  it("issues an HttpOnly session cookie", async () => {
    const res = await api.post<{ ok: boolean; expiresIn: number }>("/api/v1/session");
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.headers.get("set-cookie")).toContain("arag_session=");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });
});

describe("admin", () => {
  it("refuses every admin route without the token", async () => {
    for (const path of [
      "/api/v1/admin/health",
      "/api/v1/admin/config",
      "/api/v1/admin/usage",
      "/api/v1/admin/logs",
      "/api/v1/admin/agents",
      "/api/v1/admin/cache",
    ]) {
      const res = await api.get<Problem>(path);
      expect(res.status, path).toBe(401);
      expect(res.headers.get("content-type")).toContain("problem+json");
    }
    expect((await api.post("/api/v1/admin/provision", {})).status).toBe(401);
    expect((await api.post("/api/v1/admin/cache/invalidate", {})).status).toBe(401);
  });

  it("exchanges the token for a cookie and rejects a wrong one", async () => {
    const bad = await api.post<Problem>("/api/v1/admin/login", { token: "wrong" });
    expect(bad.status).toBe(401);
    const ok = await api.post<{ ok: boolean }>("/api/v1/admin/login", { token: "test-admin-token" });
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("arag_admin=");
    expect(cookie).toContain("HttpOnly");

    const viaCookie = await api.get("/api/v1/admin/health", {
      headers: { Cookie: cookie.split(";")[0]! },
    });
    expect(viaCookie.status).toBe(200);
  });

  it("tests the KB connection and never returns the full KB id", async () => {
    const res = await api.get<{ ok: boolean; arag: { ok: boolean; kbId: string; resources: number } }>(
      "/api/v1/admin/health",
      { admin: true },
    );
    expect(res.status).toBe(200);
    expect(res.json.arag.ok).toBe(true);
    expect(res.json.arag.resources).toBeGreaterThan(0);
    expect(res.json.arag.kbId).toMatch(/…$/);
  });

  it("redacts secrets in the config view", async () => {
    const res = await api.get<{ env: { adminToken: string; arag: { apiKey: string } } }>(
      "/api/v1/admin/config",
      { admin: true },
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("test-admin-token");
    expect(res.json.env.arag.apiKey).not.toBe("mock-api-key");
  });

  it("reports usage counters and recent logs", async () => {
    const usage = await api.get<{ requests: number; arag: { calls: number } }>("/api/v1/admin/usage", {
      admin: true,
    });
    expect(usage.json.requests).toBeGreaterThan(0);
    expect(usage.json.arag.calls).toBeGreaterThan(0);

    const logs = await api.get<{ items: Array<{ msg: string }> }>("/api/v1/admin/logs?limit=50", {
      admin: true,
    });
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.json.items)).toBe(true);
  });

  it("reports agent status", async () => {
    const res = await api.get<{ agents: Array<{ key: string; state: string }> }>("/api/v1/admin/agents", {
      admin: true,
    });
    expect(res.status).toBe(200);
    expect(res.json.agents.map((a) => a.key)).toEqual([
      "resource-labeler",
      "paragraph-labeler",
      "call-insights",
    ]);
  });

  it("runs a provisioning job to completion and streams its events", async () => {
    const started = await api.post<{ id: string }>(
      "/api/v1/admin/provision",
      { agents: false },
      { admin: true },
    );
    expect(started.status).toBe(202);

    const events = await fetch(`${server.baseUrl}/api/v1/jobs/${started.json.id}/events`, {
      headers: { Authorization: "Bearer test-admin-token" },
    });
    expect(events.status).toBe(200);
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    const body = await events.text();
    expect(body).toContain("event: job");

    const job = await api.get<{ status: string; result: { labelsets: string[] } }>(
      `/api/v1/jobs/${started.json.id}`,
    );
    expect(job.json.status).toBe("succeeded");
    expect(job.json.result.labelsets.length).toBeGreaterThan(0);
  });

  it("shows and invalidates the cache", async () => {
    await api.get("/api/v1/dashboard");
    const before = await api.get<{ stats: { entries: number }; keys: string[] }>("/api/v1/admin/cache", {
      admin: true,
    });
    expect(before.json.stats.entries).toBeGreaterThan(0);

    const invalidated = await api.post<{ invalidated: number }>(
      "/api/v1/admin/cache/invalidate",
      { prefix: "summary:" },
      { admin: true },
    );
    expect(invalidated.status).toBe(200);
    expect(invalidated.json.invalidated).toBeGreaterThan(0);

    const all = await api.post<{ invalidated: number }>(
      "/api/v1/admin/cache/invalidate",
      {},
      { admin: true },
    );
    expect(all.status).toBe(200);
    const after = await api.get<{ keys: string[] }>("/api/v1/admin/cache", { admin: true });
    expect(after.json.keys).toHaveLength(0);
  });
});

describe("jobs", () => {
  it("lists jobs and 404s on an unknown id", async () => {
    const list = await api.get<{ items: Array<{ id: string; kind: string }> }>("/api/v1/jobs?limit=10");
    expect(list.status).toBe(200);
    expect(list.json.items.length).toBeGreaterThan(0);
    expect((await api.get("/api/v1/jobs/nope")).status).toBe(404);
    expect((await api.get("/api/v1/jobs/nope/events")).status).toBe(404);
  });
});

describe("cross-cutting behaviour", () => {
  it("sets a request id and security headers on every response", async () => {
    const res = await api.get("/api/v1/dashboard");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("echoes a caller-supplied request id", async () => {
    const res = await api.get("/api/v1/dashboard", { headers: { "X-Request-Id": "abc-123" } });
    expect(res.headers.get("x-request-id")).toBe("abc-123");
  });

  it("serves the OpenAPI document, Redoc and Swagger UI", async () => {
    const spec = await api.get<{ openapi: string; paths: Record<string, unknown> }>("/api/v1/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.json.openapi).toBe("3.1.0");
    expect(Object.keys(spec.json.paths).length).toBeGreaterThan(10);

    const docs = await api.get("/api/v1/docs");
    expect(docs.status).toBe(200);
    expect(docs.text).toContain("redoc");
    const swagger = await api.get("/api/v1/swagger");
    expect(swagger.status).toBe(200);
    expect(swagger.text).toContain("swagger-ui");
  });

  it("never leaks the ARAG base URL or token in an error body", async () => {
    const res = await api.get("/api/v1/calls/unknown-id");
    expect(res.text).not.toContain("mock-api-key");
    expect(res.text).not.toMatch(/127\.0\.0\.1:\d+\/api\/v1\/kb/);
  });
});

describe("rate limiting", () => {
  it("returns 429 with Retry-After once the bucket is empty", async () => {
    const strict = await startAppServer({ RATE_LIMIT_RPS: "1", RATE_LIMIT_BURST: "2" });
    try {
      const client = makeClient(strict.baseUrl);
      let limited: Awaited<ReturnType<typeof client.get>> | null = null;
      for (let i = 0; i < 12; i++) {
        const res = await client.get("/api/v1/labelsets");
        if (res.status === 429) {
          limited = res;
          break;
        }
      }
      expect(limited, "expected a 429 within 12 rapid requests").toBeTruthy();
      expect(limited!.headers.get("retry-after")).toBeTruthy();
      expect(limited!.headers.get("content-type")).toContain("problem+json");
    } finally {
      await strict.stop();
    }
  }, 180_000);
});

describe("API key mode", () => {
  it("requires a key for writes and accepts a same-origin session instead", async () => {
    const keyed = await startAppServer({ API_KEYS: "secret-key-1" });
    try {
      const client = makeClient(keyed.baseUrl);
      const form = () => {
        const f = new FormData();
        f.set("title", "Keyed upload");
        f.set("transcript", "Agent: Hello. Member: Hello.");
        return f;
      };
      const anon = await client.request<Problem>("POST", "/api/v1/calls", { body: form() });
      expect(anon.status).toBe(401);

      const withKey = await client.request<{ call: { id: string } }>("POST", "/api/v1/calls", {
        body: form(),
        headers: { "X-API-Key": "secret-key-1" },
      });
      expect(withKey.status).toBe(202);

      const session = await client.post("/api/v1/session");
      const cookie = (session.headers.get("set-cookie") ?? "").split(";")[0]!;
      const viaSession = await client.request("POST", "/api/v1/calls", {
        body: form(),
        headers: { Cookie: cookie },
      });
      expect(viaSession.status).toBe(202);

      // Reads stay open so the demo works without a key.
      expect((await client.get("/api/v1/calls")).status).toBe(200);
    } finally {
      await keyed.stop();
    }
  }, 180_000);
});
