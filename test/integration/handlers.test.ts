/**
 * In-process integration tests: the real route handlers and the real service layer, invoked
 * directly with `Request` objects against a mock ARAG started inside this process.
 *
 * These complement `api.test.ts` (which drives a real `next start` over HTTP): running in-process
 * means the adapter (`lib/api.ts`), the runtime wiring and every service are measured by coverage,
 * and each case is fast enough to test edge paths exhaustively.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATA_DIR = mkdtempSync(join(tmpdir(), "call-analysis-test-"));

// The runtime reads process.env once, on first use — configure it before anything imports it.
process.env.ARAG_MOCK = "1";
process.env.ADMIN_TOKEN = "handler-test-token";
process.env.DATA_DIR = DATA_DIR;
process.env.LOG_LEVEL = "error";
process.env.RATE_LIMIT_RPS = "1000";
process.env.RATE_LIMIT_BURST = "5000";
process.env.CALLS_MOCK_SEED = "5";
process.env.NODE_ENV = "test";

type Handler = (req: Request, args?: { params: Promise<Record<string, string>> }) => Promise<Response>;

let mod: {
  calls: { GET: Handler; POST: Handler };
  call: { GET: Handler; DELETE: Handler };
  media: { GET: Handler };
  ask: { POST: Handler };
  dashboard: { GET: Handler };
  labelsets: { GET: Handler };
  jobs: { GET: Handler };
  job: { GET: Handler };
  jobEvents: { GET: Handler };
  session: { POST: Handler };
  login: { POST: Handler };
  health: { GET: Handler };
  config: { GET: Handler };
  usage: { GET: Handler };
  logs: { GET: Handler };
  agents: { GET: Handler };
  provision: { POST: Handler };
  cache: { GET: Handler };
  cacheInvalidate: { POST: Handler };
  readyz: { GET: () => Promise<Response> };
};
let runtime: import("@/lib/runtime").Runtime;

const ADMIN = { Authorization: "Bearer handler-test-token" };

function req(url: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${url}`, init);
}
function params(p: Record<string, string>) {
  return { params: Promise.resolve(p) };
}
async function body<T>(res: Response): Promise<T> {
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

beforeAll(async () => {
  mod = {
    calls: await import("@/app/api/v1/calls/route"),
    call: await import("@/app/api/v1/calls/[id]/route"),
    media: await import("@/app/api/v1/calls/[id]/media/route"),
    ask: await import("@/app/api/v1/calls/[id]/ask/route"),
    dashboard: await import("@/app/api/v1/dashboard/route"),
    labelsets: await import("@/app/api/v1/labelsets/route"),
    jobs: await import("@/app/api/v1/jobs/route"),
    job: await import("@/app/api/v1/jobs/[id]/route"),
    jobEvents: await import("@/app/api/v1/jobs/[id]/events/route"),
    session: await import("@/app/api/v1/session/route"),
    login: await import("@/app/api/v1/admin/login/route"),
    health: await import("@/app/api/v1/admin/health/route"),
    config: await import("@/app/api/v1/admin/config/route"),
    usage: await import("@/app/api/v1/admin/usage/route"),
    logs: await import("@/app/api/v1/admin/logs/route"),
    agents: await import("@/app/api/v1/admin/agents/route"),
    provision: await import("@/app/api/v1/admin/provision/route"),
    cache: await import("@/app/api/v1/admin/cache/route"),
    cacheInvalidate: await import("@/app/api/v1/admin/cache/invalidate/route"),
    readyz: await import("@/app/readyz/route"),
  } as typeof mod;
  const { getRuntime } = await import("@/lib/runtime");
  runtime = await getRuntime();
}, 120_000);

afterAll(async () => {
  // Cancel anything still in flight first: a background job that outlives the mock would log a
  // spurious "fetch failed". Then always close the mock — it is an open handle that hangs vitest.
  for (const job of runtime?.jobs.list({}) ?? []) {
    if (job.status === "queued" || job.status === "running") runtime.jobs.cancel(job.id);
  }
  try {
    const { closeDemoMock } = await import("@/lib/mock");
    await closeDemoMock();
  } finally {
    runtime?.store.flushAll();
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
});

async function anyCallId(): Promise<string> {
  const res = await mod.calls.GET(req("/api/v1/calls?page_size=1"));
  const page = await body<{ items: Array<{ id: string }> }>(res);
  return page.items[0]!.id;
}

describe("runtime", () => {
  it("boots against the mock and seeds demo calls with labels and metrics", async () => {
    expect(runtime.env.arag.mock).toBe(true);
    expect(runtime.mock.seeded).toBe(6); // SAMPLE_CALL_TRANSCRIPT + CALLS_MOCK_SEED scenarios
    const health = await runtime.arag.health();
    expect(health.ok).toBe(true);
    expect(health.resources).toBe(6);
  });

  it("is memoised: a second getRuntime() returns the same instance", async () => {
    const { getRuntime } = await import("@/lib/runtime");
    expect(await getRuntime()).toBe(runtime);
  });

  it("keeps reading the legacy ARAG_BASE variable as ARAG_BASE_URL", async () => {
    const { applyLegacyEnvAliases } = await import("@/lib/runtime");
    const src = { ARAG_BASE: "https://legacy.example/api/v1" } as NodeJS.ProcessEnv;
    applyLegacyEnvAliases(src);
    expect(src.ARAG_BASE_URL).toBe("https://legacy.example/api/v1");
    const keep = { ARAG_BASE: "a", ARAG_BASE_URL: "b" } as NodeJS.ProcessEnv;
    applyLegacyEnvAliases(keep);
    expect(keep.ARAG_BASE_URL).toBe("b");
  });
});

describe("GET /api/v1/calls", () => {
  it("lists, searches and filters", async () => {
    const all = await body<{ items: Array<{ id: string; labels: Array<{ labelset: string; label: string }> }>; total: number }>(
      await mod.calls.GET(req("/api/v1/calls?page_size=200")),
    );
    expect(all.total).toBe(6);

    const searched = await body<{ items: unknown[] }>(await mod.calls.GET(req("/api/v1/calls?q=premium")));
    expect(searched.items.length).toBeGreaterThan(0);

    const label = all.items.flatMap((c) => c.labels).find((l) => l.labelset === "sentiment")!;
    const filtered = await body<{ items: Array<{ id: string }> }>(
      await mod.calls.GET(req(`/api/v1/calls?label=${encodeURIComponent(`${label.labelset}/${label.label}`)}`)),
    );
    expect(filtered.items.length).toBeGreaterThan(0);
  });

  it("rejects invalid query parameters with a problem document", async () => {
    const res = await mod.calls.GET(req("/api/v1/calls?page=0"));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("problem+json");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("serves a second identical list from cache", async () => {
    runtime.cache.clear();
    const before = runtime.usage.aragCalls;
    await mod.calls.GET(req("/api/v1/calls?page_size=200"));
    const afterFirst = runtime.usage.aragCalls;
    await mod.calls.GET(req("/api/v1/calls?page_size=200"));
    const afterSecond = runtime.usage.aragCalls;
    expect(afterFirst).toBeGreaterThan(before);
    expect(afterSecond).toBe(afterFirst);
  });
});

describe("GET /api/v1/calls/{id}", () => {
  it("returns the full detail view", async () => {
    const id = await anyCallId();
    const res = await mod.call.GET(req(`/api/v1/calls/${id}`), params({ id }));
    const detail = await body<{ paragraphs: unknown[]; transcriptText: string; analysis?: unknown }>(res);
    expect(res.status).toBe(200);
    expect(detail.paragraphs.length).toBeGreaterThan(0);
    expect(detail.analysis).toBeTruthy();
  });

  it("404s for an unknown call", async () => {
    const res = await mod.call.GET(req("/api/v1/calls/missing"), params({ id: "missing" }));
    expect(res.status).toBe(404);
  });
});

describe("media", () => {
  it("streams a file field and forwards Range", async () => {
    const all = await body<{ items: Array<{ id: string; mediaType: string }> }>(
      await mod.calls.GET(req("/api/v1/calls?page_size=200")),
    );
    const audio = all.items.find((c) => c.mediaType !== "transcript")!;
    const full = await mod.media.GET(req(`/api/v1/calls/${audio.id}/media`), params({ id: audio.id }));
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    await full.arrayBuffer();

    const partial = await mod.media.GET(
      req(`/api/v1/calls/${audio.id}/media?field=media`, { headers: { Range: "bytes=0-9" } }),
      params({ id: audio.id }),
    );
    expect(partial.status).toBe(206);
    expect((await partial.arrayBuffer()).byteLength).toBe(10);
  });

  it("refuses a field outside the allowlist", async () => {
    const id = await anyCallId();
    const res = await mod.media.GET(req(`/api/v1/calls/${id}/media?field=evil`), params({ id }));
    expect(res.status).toBe(400);
  });
});

describe("ask", () => {
  it("streams retrieval, answer, citations and a quality item", async () => {
    const id = await anyCallId();
    const res = await mod.ask.POST(
      req(`/api/v1/calls/${id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "What was the member calling about?" }),
      }),
      params({ id }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    const types = text
      .split("\n")
      .filter(Boolean)
      .map((l) => (JSON.parse(l).item as { type: string }).type);
    expect(types).toContain("retrieval");
    expect(types).toContain("answer");
    expect(types).toContain("quality");
  });

  it("rejects a question that is too short, too long or missing", async () => {
    const id = await anyCallId();
    for (const payload of [{ question: "hi" }, { question: "x".repeat(600) }, {}]) {
      const res = await mod.ask.POST(
        req(`/api/v1/calls/${id}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        params({ id }),
      );
      expect(res.status).toBe(400);
    }
  });

  it("rejects a malformed JSON body", async () => {
    const id = await anyCallId();
    const res = await mod.ask.POST(
      req(`/api/v1/calls/${id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      }),
      params({ id }),
    );
    expect(res.status).toBe(400);
  });
});

describe("upload and delete", () => {
  it("creates a call from a transcript, runs the ingest job and deletes it", async () => {
    const form = new FormData();
    form.set("title", "In-process upload");
    form.set("queue", "Claims");
    form.set("agent_name", "Test Agent");
    form.set("member_id", "IFP-999");
    form.set("created", "2026-07-01T09:00:00Z");
    form.set("duration_sec", "42");
    form.set("transcript", "Agent: Thanks for calling. Member: My claim was denied and I want a review.");
    const res = await mod.calls.POST(req("/api/v1/calls", { method: "POST", body: form }));
    expect(res.status).toBe(202);
    const created = await body<{ job: { id: string }; call: { id: string } }>(res);

    const job = await runtime.jobs.run("ingest-call", {
      callId: created.call.id,
      title: "wait",
      transcribed: false,
    });
    expect(job.status).toBe("succeeded");

    const detail = await body<{ title: string; agentName: string; durationSec: number }>(
      await mod.call.GET(req(`/api/v1/calls/${created.call.id}`), params({ id: created.call.id })),
    );
    expect(detail.title).toBe("In-process upload");
    expect(detail.agentName).toBe("Test Agent");
    expect(detail.durationSec).toBe(42);

    const del = await mod.call.DELETE(req(`/api/v1/calls/${created.call.id}`, { method: "DELETE" }), params({ id: created.call.id }));
    expect(del.status).toBe(204);
    const gone = await mod.call.GET(req(`/api/v1/calls/${created.call.id}`), params({ id: created.call.id }));
    expect(gone.status).toBe(404);
  });

  it("accepts an audio recording and marks it as audio", async () => {
    const form = new FormData();
    form.set("title", "Recorded call");
    form.set("recording", new File([new Uint8Array(2048)], "call.mp3", { type: "audio/mpeg" }));
    const res = await mod.calls.POST(req("/api/v1/calls", { method: "POST", body: form }));
    expect(res.status).toBe(202);
    const created = await body<{ call: { id: string } }>(res);
    const detail = await body<{ mediaType: string }>(
      await mod.call.GET(req(`/api/v1/calls/${created.call.id}`), params({ id: created.call.id })),
    );
    expect(detail.mediaType).toBe("audio");
    await mod.call.DELETE(req("/x", { method: "DELETE" }), params({ id: created.call.id }));
  });

  it("validates the upload form", async () => {
    const cases: Array<[FormData, number]> = [];
    const noTitle = new FormData();
    noTitle.set("transcript", "Agent: hi");
    cases.push([noTitle, 400]);

    const noContent = new FormData();
    noContent.set("title", "Nothing");
    cases.push([noContent, 400]);

    const badDate = new FormData();
    badDate.set("title", "Bad date");
    badDate.set("transcript", "Agent: hi");
    badDate.set("created", "yesterday");
    cases.push([badDate, 400]);

    const badDuration = new FormData();
    badDuration.set("title", "Bad duration");
    badDuration.set("transcript", "Agent: hi");
    badDuration.set("duration_sec", "soon");
    cases.push([badDuration, 400]);

    const badType = new FormData();
    badType.set("title", "Bad type");
    badType.set("recording", new File([new Uint8Array(4)], "x.exe", { type: "application/x-msdownload" }));
    cases.push([badType, 415]);

    for (const [form, status] of cases) {
      const res = await mod.calls.POST(req("/api/v1/calls", { method: "POST", body: form }));
      expect(res.status).toBe(status);
    }
  });

  it("rejects a non-multipart upload", async () => {
    const res = await mod.calls.POST(
      req("/api/v1/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "nope" }),
      }),
    );
    expect(res.status).toBe(415);
  });

  it("404s when deleting an unknown call", async () => {
    const res = await mod.call.DELETE(req("/x", { method: "DELETE" }), params({ id: "nope" }));
    expect(res.status).toBe(404);
  });
});

describe("dashboard and labelsets", () => {
  it("aggregates and caches", async () => {
    const d = await body<{ total: number; withMetrics: number; recent: unknown[] }>(
      await mod.dashboard.GET(req("/api/v1/dashboard")),
    );
    expect(d.total).toBeGreaterThan(0);
    expect(d.withMetrics).toBeGreaterThan(0);
    expect(d.recent.length).toBeGreaterThan(0);
  });

  it("returns ordered facets", async () => {
    const l = await body<{ items: Array<{ id: string }> }>(await mod.labelsets.GET(req("/api/v1/labelsets")));
    expect(l.items[0]?.id).toBe("call_reason");
  });
});

describe("jobs", () => {
  it("lists, fetches and streams a job", async () => {
    const job = runtime.jobs.submit("ingest-call", { callId: "x", title: "t", transcribed: false, waitForProcessing: false });
    await runtime.jobs.run("ingest-call", { callId: "x", title: "t", transcribed: false, waitForProcessing: false });

    const list = await body<{ items: Array<{ id: string }> }>(await mod.jobs.GET(req("/api/v1/jobs?limit=10")));
    expect(list.items.length).toBeGreaterThan(0);

    const one = await mod.job.GET(req(`/api/v1/jobs/${job.id}`), params({ id: job.id }));
    expect(one.status).toBe(200);

    const events = await mod.jobEvents.GET(req(`/api/v1/jobs/${job.id}/events`), params({ id: job.id }));
    expect(events.status).toBe(200);
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    expect(await events.text()).toContain("event: job");

    expect((await mod.job.GET(req("/x"), params({ id: "nope" }))).status).toBe(404);
    expect((await mod.jobEvents.GET(req("/x"), params({ id: "nope" }))).status).toBe(404);
  });

  it("runs the provisioning job over labelsets and agents", async () => {
    const job = await runtime.jobs.run<unknown, { labelsets: string[]; agents: Array<{ key: string }> }>(
      "provision",
      { agents: true },
    );
    expect(job.status).toBe("succeeded");
    expect(job.result?.labelsets.length).toBeGreaterThan(0);
    expect(job.result?.agents.map((a) => a.key)).toEqual([
      "resource-labeler",
      "paragraph-labeler",
      "call-insights",
    ]);
  }, 120_000);
});

describe("auth", () => {
  it("issues a session cookie", async () => {
    const res = await mod.session.POST(req("/api/v1/session", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("arag_session=");
  });

  it("accepts the right admin token and refuses a wrong one", async () => {
    const bad = await mod.login.POST(
      req("/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "nope" }),
      }),
    );
    expect(bad.status).toBe(401);

    const ok = await mod.login.POST(
      req("/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "handler-test-token" }),
      }),
    );
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toContain("arag_admin=");

    const viaCookie = await mod.health.GET(
      req("/api/v1/admin/health", { headers: { Cookie: cookie.split(";")[0]! } }),
    );
    expect(viaCookie.status).toBe(200);
  });

  it("refuses admin routes without a token", async () => {
    expect((await mod.health.GET(req("/api/v1/admin/health"))).status).toBe(401);
    expect((await mod.cache.GET(req("/api/v1/admin/cache"))).status).toBe(401);
  });
});

describe("admin views", () => {
  it("reports health with a truncated KB id", async () => {
    const h = await body<{ ok: boolean; arag: { kbId: string; resources: number } }>(
      await mod.health.GET(req("/api/v1/admin/health", { headers: ADMIN })),
    );
    expect(h.ok).toBe(true);
    expect(h.arag.kbId.endsWith("…")).toBe(true);
  });

  it("redacts secrets in the config view", async () => {
    const res = await mod.config.GET(req("/api/v1/admin/config", { headers: ADMIN }));
    const text = await res.text();
    expect(text).not.toContain("handler-test-token");
    expect(text).toContain("taxonomy");
  });

  it("reports usage and logs", async () => {
    const u = await body<{ requests: number; byRoute: Record<string, number>; arag: { calls: number } }>(
      await mod.usage.GET(req("/api/v1/admin/usage", { headers: ADMIN })),
    );
    expect(u.requests).toBeGreaterThan(0);
    expect(u.arag.calls).toBeGreaterThan(0);
    expect(Object.keys(u.byRoute).length).toBeGreaterThan(0);

    const l = await body<{ items: unknown[] }>(
      await mod.logs.GET(req("/api/v1/admin/logs?level=warn&contains=http&limit=10", { headers: ADMIN })),
    );
    expect(Array.isArray(l.items)).toBe(true);
  });

  it("reports agent status", async () => {
    const a = await body<{ agents: Array<{ key: string; state: string }> }>(
      await mod.agents.GET(req("/api/v1/admin/agents", { headers: ADMIN })),
    );
    expect(a.agents).toHaveLength(3);
  });

  it("accepts a provisioning request as a job", async () => {
    const res = await mod.provision.POST(
      req("/api/v1/admin/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ADMIN },
        body: JSON.stringify({ agents: false }),
      }),
    );
    expect(res.status).toBe(202);
    const job = await body<{ id: string }>(res);
    expect(res.headers.get("location")).toBe(`/api/v1/jobs/${job.id}`);
  });

  it("shows and invalidates the cache", async () => {
    await mod.dashboard.GET(req("/api/v1/dashboard"));
    const before = await body<{ stats: { entries: number } }>(
      await mod.cache.GET(req("/api/v1/admin/cache", { headers: ADMIN })),
    );
    expect(before.stats.entries).toBeGreaterThan(0);

    const res = await mod.cacheInvalidate.POST(
      req("/api/v1/admin/cache/invalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ADMIN },
        body: JSON.stringify({}),
      }),
    );
    const out = await body<{ invalidated: number }>(res);
    expect(out.invalidated).toBeGreaterThan(0);
  });
});

describe("readyz", () => {
  it("reports the KB connection", async () => {
    const res = await mod.readyz.GET();
    expect(res.status).toBe(200);
    expect((await body<{ ok: boolean }>(res)).ok).toBe(true);
  });
});
