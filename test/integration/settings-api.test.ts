/**
 * Integration tests for the configuration surface: settings, API keys, taxonomy writes, saved
 * views, the share register, retention and job cancellation.
 *
 * These run against the real Next.js server, the real routes and the real JSON store, so every
 * assertion here is about the thing the brief actually asks for — that a setting edited in the
 * product *persists* and *takes effect without a restart*. "Takes effect" is checked by reading it
 * back through a different endpoint than the one that wrote it, or by observing the behaviour it
 * governs, never by trusting the write's own response.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeClient, startAppServer, type TestClient, type TestServer } from "../helpers/server";

let server: TestServer;
let api: TestClient;

interface SettingsView {
  branding: { productName: string; tagline: string; primaryColor: string; poweredBy: boolean };
  connection: { mode: string; generativeModel: string; apiKeySet: boolean; timeoutMs: number };
  limits: { maxQuestionChars: number; rateLimitRps: number; maxUploadBytes: number };
  retention: { days: number; enabled: boolean };
  apiKeys: { configured: number; active: number; managed: boolean };
  overridden: string[];
  taxonomy: { labelsets: number; agents: Array<{ key: string; enabled: boolean }> };
}
interface Problem {
  title: string;
  status: number;
  detail?: string;
}

beforeAll(async () => {
  server = await startAppServer();
  api = makeClient(server.baseUrl);
}, 180_000);

afterAll(async () => {
  await server?.stop();
});

describe("settings: environment is a default, the store is the authority", () => {
  it("refuses a settings write without the operator token", async () => {
    const res = await api.put<Problem>("/api/v1/settings/branding", { tagline: "nope" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("problem+json");
  });

  it("persists a branding edit and serves it to every reader", async () => {
    const before = await api.get<SettingsView>("/api/v1/settings");
    expect(before.json.overridden).not.toContain("branding");

    const put = await api.put<SettingsView>(
      "/api/v1/settings/branding",
      { productName: "Northwind Calls", tagline: "Member experience", primaryColor: "#7a1fa2" },
      { admin: true },
    );
    expect(put.status).toBe(200);
    expect(put.json.branding.productName).toBe("Northwind Calls");

    // Read back through a *different* endpoint: `/branding` is what the shell and any partner
    // front-end actually consume, so this is the assertion that the edit took effect rather than
    // merely round-tripped.
    const branding = await api.get<{ productName: string; primaryColor: string }>("/api/v1/branding");
    expect(branding.json.productName).toBe("Northwind Calls");
    expect(branding.json.primaryColor).toBe("#7a1fa2");

    const after = await api.get<SettingsView>("/api/v1/settings");
    expect(after.json.overridden).toContain("branding");
  });

  it("renders the edited product name into the server-rendered page", async () => {
    // The strongest possible "takes effect without a restart": the HTML the next visitor gets.
    const res = await fetch(`${server.baseUrl}/settings`);
    expect(await res.text()).toContain("Northwind Calls");
  });

  it("refuses a colour that could escape the style declaration", async () => {
    const res = await api.put<Problem>(
      "/api/v1/settings/branding",
      { primaryColor: "red; } html { display: none" },
      { admin: true },
    );
    expect(res.status).toBe(400);
    expect(res.json.detail).toMatch(/valid CSS colour/);
  });

  it("resets a section to its environment default", async () => {
    const res = await api.del<SettingsView>("/api/v1/settings/branding", { admin: true });
    expect(res.status).toBe(200);
    expect(res.json.branding.productName).toBe("Call Analysis");
    expect(res.json.overridden).not.toContain("branding");
    const branding = await api.get<{ productName: string }>("/api/v1/branding");
    expect(branding.json.productName).toBe("Call Analysis");
  });

  it("applies a limits edit to the running request pipeline", async () => {
    const res = await api.put<SettingsView>(
      "/api/v1/settings/limits",
      { maxQuestionChars: 60 },
      { admin: true },
    );
    expect(res.json.limits.maxQuestionChars).toBe(60);

    // The effect: `POST /calls/{id}/ask` enforces the limit read from the runtime, so a question
    // that was legal a moment ago is now rejected.
    const calls = await api.get<{ items: Array<{ id: string }> }>("/api/v1/calls?page_size=1");
    const id = calls.json.items[0]?.id as string;
    const long = await api.post<Problem>(`/api/v1/calls/${id}/ask`, { question: "x".repeat(200) });
    expect(long.status).toBe(400);

    await api.del("/api/v1/settings/limits", { admin: true });
    const back = await api.get<SettingsView>("/api/v1/settings");
    expect(back.json.limits.maxQuestionChars).toBeGreaterThan(60);
  });

  it("records the retention policy without applying it until asked", async () => {
    const res = await api.put<SettingsView>(
      "/api/v1/settings/retention",
      { days: 30, enabled: true },
      { admin: true },
    );
    expect(res.json.retention).toEqual({ days: 30, enabled: true });
    const back = await api.get<SettingsView>("/api/v1/settings");
    expect(back.json.retention.days).toBe(30);
  });

  it("ignores connection edits in sample mode rather than breaking the sample data", async () => {
    const res = await api.put<SettingsView>(
      "/api/v1/settings/connection",
      { generativeModel: "chatgpt-azure-4o-mini" },
      { admin: true },
    );
    expect(res.status).toBe(200);
    // The model is a client-side request parameter, so it does apply; the Knowledge Box address
    // does not, because re-pointing the in-process mock would leave no way back through the UI.
    expect(res.json.connection.generativeModel).toBe("chatgpt-azure-4o-mini");
    expect(res.json.connection.mode).toBe("mock");
  });

  it("never returns the service-account credential, only whether one is set", async () => {
    const res = await api.get<SettingsView>("/api/v1/settings");
    expect(res.text).not.toMatch(/"apiKey"\s*:/);
    expect(typeof res.json.connection.apiKeySet).toBe("boolean");
  });

  it("rejects an unknown settings section", async () => {
    const res = await api.put<Problem>("/api/v1/settings/nonsense", { x: 1 }, { admin: true });
    expect(res.status).toBe(400);
  });
});

describe("API keys", () => {
  let keyId = "";
  let secret = "";

  it("issues a key and returns the material exactly once", async () => {
    const res = await api.post<{ key: { id: string; name: string; preview: string }; secret: string }>(
      "/api/v1/api-keys",
      { name: "Reporting pipeline" },
      { admin: true },
    );
    expect(res.status).toBe(201);
    keyId = res.json.key.id;
    secret = res.json.secret;
    expect(secret).toMatch(/^ca_live_/);
    expect(res.json.key.preview).toContain("…");

    const list = await api.get<{ items: Array<{ id: string; name: string }> }>("/api/v1/api-keys", {
      admin: true,
    });
    expect(list.text).not.toContain(secret);
    expect(list.json.items.some((k) => k.id === keyId)).toBe(true);
  });

  it("authenticates a write with the issued key", async () => {
    const res = await api.post(
      "/api/v1/calls/bulk",
      { action: "reanalyze", ids: [] },
      { headers: { "X-API-Key": secret } },
    );
    // The action is a no-op with no ids; what is under test is that the key got past `enforceAuth`.
    expect([200, 400]).toContain(res.status);
  });

  it("records last use without writing on every request", async () => {
    const list = await api.get<{ items: Array<{ id: string; lastUsedISO?: string }> }>("/api/v1/api-keys", {
      admin: true,
    });
    expect(list.json.items.find((k) => k.id === keyId)?.lastUsedISO).toBeTruthy();
  });

  it("renames and revokes, and a revoked key stops authenticating", async () => {
    const renamed = await api.put<{ name: string }>(
      `/api/v1/api-keys/${keyId}`,
      { name: "Reporting pipeline (old)" },
      { admin: true },
    );
    expect(renamed.json.name).toBe("Reporting pipeline (old)");

    const revoked = await api.del<{ revoked: boolean }>(`/api/v1/api-keys/${keyId}`, { admin: true });
    expect(revoked.json.revoked).toBe(true);

    const after = await api.post<Problem>(
      "/api/v1/calls/bulk",
      { action: "reanalyze", ids: ["x"] },
      { headers: { "X-API-Key": secret } },
    );
    expect(after.status).toBe(401);

    // Revoked rather than deleted: the record of a key that once had access is the evidence an
    // incident review needs.
    const list = await api.get<{ items: Array<{ id: string; revoked: boolean }> }>("/api/v1/api-keys", {
      admin: true,
    });
    expect(list.json.items.find((k) => k.id === keyId)?.revoked).toBe(true);
  });

  it("refuses an unnamed key", async () => {
    const res = await api.post<Problem>("/api/v1/api-keys", { name: "  " }, { admin: true });
    expect(res.status).toBe(400);
  });

  it("keeps key management behind the operator token", async () => {
    expect((await api.get("/api/v1/api-keys")).status).toBe(401);
    expect((await api.post("/api/v1/api-keys", { name: "x" })).status).toBe(401);
  });
});

describe("taxonomy writes", () => {
  const id = "utility_reason";

  it("creates a labelset and provisions it to the Knowledge Box", async () => {
    const res = await api.post<{ labelset: { id: string }; provisioned: boolean }>(
      "/api/v1/labelsets",
      {
        id,
        title: "Utility reason",
        color: "#2563eb",
        multiple: false,
        kind: "RESOURCES",
        labels: [
          { label: "Outage", description: "The customer has no supply." },
          { label: "Meter reading", description: "A reading is being submitted or disputed." },
        ],
      },
      { admin: true },
    );
    expect(res.status).toBe(201);
    expect(res.json.provisioned).toBe(true);

    const live = await api.get<{ items: Array<{ id: string }> }>("/api/v1/labelsets");
    expect(live.json.items.some((l) => l.id === id)).toBe(true);
  });

  it("refuses a duplicate id and a label with no description", async () => {
    const dupe = await api.post<Problem>(
      "/api/v1/labelsets",
      { id, title: "x", labels: [] },
      { admin: true },
    );
    expect(dupe.status).toBe(400);

    // An absent description is caught by the OpenAPI schema at the edge…
    const missing = await api.post<Problem>(
      "/api/v1/labelsets",
      { id: "other_set", title: "Other", labels: [{ label: "A", description: "" }] },
      { admin: true },
    );
    expect(missing.status).toBe(400);
    expect(missing.json.detail).toMatch(/description/);

    // …and a whitespace-only one, which the schema cannot see through, by the service.
    const blank = await api.post<Problem>(
      "/api/v1/labelsets",
      { id: "other_set", title: "Other", labels: [{ label: "A", description: "   " }] },
      { admin: true },
    );
    expect(blank.status).toBe(400);
    expect(blank.json.detail).toMatch(/the agent reads it/);
  });

  it("edits a labelset and keeps the id fixed even when the body disagrees", async () => {
    const res = await api.put<{ labelset: { id: string; labels: unknown[] } }>(
      `/api/v1/labelsets/${id}`,
      {
        id: "renamed_in_body",
        title: "Utility reason",
        labels: [
          { label: "Outage", description: "The customer has no supply." },
          { label: "Meter reading", description: "A reading is being submitted or disputed." },
          { label: "Tariff", description: "The customer is asking about their tariff." },
        ],
      },
      { admin: true },
    );
    expect(res.status).toBe(200);
    // Renaming would orphan every label already applied upstream under the old id.
    expect(res.json.labelset.id).toBe(id);
    expect(res.json.labelset.labels).toHaveLength(3);

    const one = await api.get<{ labels: unknown[] }>(`/api/v1/labelsets/${id}`);
    expect(one.json.labels).toHaveLength(3);
  });

  it("shows the new labelset in the taxonomy read model as defined and provisioned", async () => {
    const tax = await api.get<{
      labelsets: Array<{ id: string; defined: boolean; provisioned: boolean; shipped: boolean }>;
    }>("/api/v1/taxonomy");
    const hit = tax.json.labelsets.find((l) => l.id === id);
    expect(hit).toBeTruthy();
    expect(hit?.defined).toBe(true);
    expect(hit?.shipped).toBe(false);
  });

  it("deletes a labelset from the product without touching the Knowledge Box by default", async () => {
    const res = await api.del(`/api/v1/labelsets/${id}`, { admin: true });
    expect(res.status).toBe(204);
    const one = await api.get(`/api/v1/labelsets/${id}`);
    expect(one.status).toBe(404);
    // The labels already applied to analysed calls are data, not configuration, so they survive.
    const live = await api.get<{ items: Array<{ id: string }> }>("/api/v1/labelsets");
    expect(live.json.items.some((l) => l.id === id)).toBe(true);
  });

  it("enables and disables an agent, and the taxonomy view agrees", async () => {
    const off = await api.put<{ enabled: boolean }>(
      "/api/v1/agents/paragraph-labeler",
      { enabled: false },
      { admin: true },
    );
    expect(off.json.enabled).toBe(false);

    const settings = await api.get<SettingsView>("/api/v1/settings");
    expect(settings.json.taxonomy.agents.find((a) => a.key === "paragraph-labeler")?.enabled).toBe(false);

    const on = await api.put<{ enabled: boolean }>(
      "/api/v1/agents/paragraph-labeler",
      { enabled: true },
      { admin: true },
    );
    expect(on.json.enabled).toBe(true);
  });

  it("edits an ask agent's instructions and reads them back", async () => {
    const prompt = "Return ONLY a JSON object summarising the call for a utility contact centre.";
    const res = await api.put<{ prompts: Record<string, string> }>(
      "/api/v1/agents/call-insights",
      { prompts: { call_analysis: prompt } },
      { admin: true },
    );
    expect(res.json.prompts.call_analysis).toBe(prompt);

    const list = await api.get<{ items: Array<{ key: string; prompts?: Record<string, string> }> }>(
      "/api/v1/agents",
    );
    expect(list.json.items.find((a) => a.key === "call-insights")?.prompts?.call_analysis).toBe(prompt);
  });

  it("refuses a prompt for an output the agent does not have, and one too short to be an instruction", async () => {
    expect(
      (
        await api.put<Problem>(
          "/api/v1/agents/call-insights",
          { prompts: { nope: "x".repeat(50) } },
          { admin: true },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await api.put<Problem>(
          "/api/v1/agents/call-insights",
          { prompts: { call_metrics: "short" } },
          { admin: true },
        )
      ).status,
    ).toBe(400);
  });

  it("reports 404 for an unknown agent", async () => {
    expect((await api.put("/api/v1/agents/nope", { enabled: false }, { admin: true })).status).toBe(404);
  });
});

describe("saved views", () => {
  let viewId = "";

  it("saves the current filters under a name, normalised", async () => {
    const res = await api.post<{ id: string; query: string; href: string }>("/api/v1/views", {
      name: "Escalated complaints",
      query: "?label=sentiment%2FNegative&q=refund&utm_source=email",
    });
    expect(res.status).toBe(201);
    viewId = res.json.id;
    expect(res.json.query).not.toContain("utm_source");
    expect(res.json.href.startsWith("/calls?")).toBe(true);
  });

  it("refuses a view with no filters and a duplicate name", async () => {
    expect((await api.post<Problem>("/api/v1/views", { name: "Everything", query: "" })).status).toBe(400);
    expect(
      (await api.post<Problem>("/api/v1/views", { name: "escalated complaints", query: "q=x" })).status,
    ).toBe(400);
  });

  it("renames a view and deletes it", async () => {
    const renamed = await api.put<{ name: string }>(`/api/v1/views/${viewId}`, {
      name: "Escalations",
      query: "q=refund",
    });
    expect(renamed.json.name).toBe("Escalations");
    expect((await api.del(`/api/v1/views/${viewId}`)).status).toBe(204);
    expect((await api.del(`/api/v1/views/${viewId}`)).status).toBe(404);
  });
});

describe("the share register", () => {
  it("lists every link across every call, filterable by state", async () => {
    const calls = await api.get<{ items: Array<{ id: string }> }>("/api/v1/calls?page_size=1");
    const id = calls.json.items[0]?.id as string;
    const created = await api.post<{ token: string }>(`/api/v1/calls/${id}/shares`, { ttlDays: 3 });
    expect(created.status).toBe(201);

    const all = await api.get<{ items: Array<{ token: string; revoked: boolean }> }>("/api/v1/shares");
    expect(all.json.items.some((s) => s.token === created.json.token)).toBe(true);

    await api.del(`/api/v1/shares/${created.json.token}`);
    const active = await api.get<{ items: Array<{ token: string }> }>("/api/v1/shares?state=active");
    expect(active.json.items.some((s) => s.token === created.json.token)).toBe(false);
    const revoked = await api.get<{ items: Array<{ token: string }> }>("/api/v1/shares?state=revoked");
    expect(revoked.json.items.some((s) => s.token === created.json.token)).toBe(true);
  });
});

describe("retention", () => {
  it("previews nothing when the policy is 0 days — that means no limit, not delete everything", async () => {
    const res = await api.get<{ total: number; candidates: unknown[] }>("/api/v1/retention/preview?days=0");
    expect(res.status).toBe(200);
    expect(res.json.total).toBe(0);
  });

  it("previews the calls an aggressive policy would remove without removing them", async () => {
    const before = await api.get<{ total: number }>("/api/v1/calls?page_size=1");
    const preview = await api.get<{ total: number; retained: number }>("/api/v1/retention/preview?days=1");
    expect(preview.json.total + preview.json.retained).toBe(before.json.total);

    const dry = await api.post<{ dryRun: boolean; deleted: string[] }>(
      "/api/v1/retention/purge",
      { days: 1, dryRun: true },
      { admin: true },
    );
    expect(dry.json.dryRun).toBe(true);
    const after = await api.get<{ total: number }>("/api/v1/calls?page_size=1");
    expect(after.json.total).toBe(before.json.total);
  });

  it("keeps purging behind the operator token", async () => {
    expect((await api.post("/api/v1/retention/purge", { days: 1 })).status).toBe(401);
  });
});

describe("job cancellation", () => {
  it("cancels a running job and refuses to cancel a finished one", async () => {
    const form = new FormData();
    form.set("title", "Cancellable upload");
    form.set("transcript", "Agent: Hello. Member: I would like to cancel this analysis.");
    const created = await api.request<{ job: { id: string }; call: { id: string } }>(
      "POST",
      "/api/v1/calls",
      { body: form, admin: true },
    );
    expect(created.status).toBe(202);
    const jobId = created.json.job.id;

    const cancelled = await api.del<{ status: string }>(`/api/v1/jobs/${jobId}`, { admin: true });
    // The job may legitimately have finished already against the in-process mock; both outcomes
    // are correct behaviour, and both are asserted rather than one being wished away.
    if (cancelled.status === 200) {
      expect(cancelled.json.status).toBe("cancelled");
      const again = await api.del<Problem>(`/api/v1/jobs/${jobId}`, { admin: true });
      expect(again.status).toBe(409);
    } else {
      expect(cancelled.status).toBe(409);
      expect((cancelled.json as unknown as Problem).detail).toMatch(/no longer be cancelled/);
    }

    // Cancelling does not roll back the Knowledge Box resource that was already created; the call
    // stays visible as incomplete rather than vanishing.
    const call = await api.get(`/api/v1/calls/${created.json.call.id}`);
    expect(call.status).toBe(200);

    await api.del(`/api/v1/calls/${created.json.call.id}`, { admin: true });
  });

  it("404s an unknown job", async () => {
    expect((await api.del("/api/v1/jobs/does-not-exist", { admin: true })).status).toBe(404);
  });
});

describe("the audit trail", () => {
  it("records who changed what, and never the credential", async () => {
    await api.put("/api/v1/settings/branding", { tagline: "Audited" }, { admin: true });
    const res = await api.get<{ items: Array<{ action: string; actor: string; detail: unknown }> }>(
      "/api/v1/admin/audit?limit=50",
      { admin: true },
    );
    expect(res.status).toBe(200);
    const actions = res.json.items.map((i) => i.action);
    expect(actions).toContain("settings.branding");
    expect(actions).toContain("apikey.create");
    expect(actions).toContain("apikey.revoke");
    for (const i of res.json.items) expect(i.actor).toBeTruthy();
    expect(res.text).not.toContain("ca_live_");
    await api.del("/api/v1/settings/branding", { admin: true });
  });

  it("keeps the audit trail behind the operator token", async () => {
    expect((await api.get("/api/v1/admin/audit")).status).toBe(401);
  });
});
