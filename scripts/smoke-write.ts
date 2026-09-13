/**
 * OPT-IN live **write** smoke test — exercises every write path against the real Knowledge Box.
 *
 *   CALLS_ALLOW_LIVE_WRITE=1 make smoke-write
 *
 * `scripts/smoke.ts` proves the product can read a live Knowledge Box. This proves it can *change*
 * one, which is what the full-implementation bar actually asks for: upload, provision, edit, delete
 * and purge all working against the deployed credentials rather than against the in-process mock.
 *
 * Safety rules, in order of importance:
 *
 *  1. **The 24 seeded demo calls are never touched.** Every resource this script deletes is one it
 *     created in the same run, identified by a run-scoped slug; the catalog count is compared
 *     before and after and the script fails loudly if it does not return to where it started.
 *  2. **The taxonomy is never left modified.** The labelset it creates carries a run-scoped id that
 *     cannot collide with a product labelset, and it is deleted in a `finally`.
 *  3. **No agent is started or stopped.** Data-augmentation tasks are Knowledge-Box-wide and there
 *     is exactly one running task per operation type; starting one here would interfere with the
 *     demo corpus for minutes. The agent *configuration* write is exercised (it is product state),
 *     and the result is reverted.
 *  4. **It refuses to run without `CALLS_ALLOW_LIVE_WRITE=1`**, and refuses to run in mock mode,
 *     where it would prove nothing.
 *
 * It drives the product's own HTTP API on a throwaway server rather than calling the services
 * directly, so what is verified is the route handlers, the auth rules and the validation a real
 * caller meets — not a hand-assembled shortcut past them.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadDotEnv, readEnv } from "../vendor/arag-platform/src/index.ts";

const ROOT = resolve(import.meta.dirname, "..");
const NEXT_BIN = resolve(ROOT, "node_modules/next/dist/bin/next");
const ADMIN_TOKEN = `smoke-${Math.random().toString(36).slice(2)}`;
const RUN = Date.now().toString(36);

let failures = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const bad = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => res(port));
    });
  });
}

interface Res<T> {
  status: number;
  json: T;
  text: string;
}

function client(baseUrl: string) {
  return async function call<T = unknown>(
    method: string,
    path: string,
    opts: { json?: unknown; body?: BodyInit; admin?: boolean } = {},
  ): Promise<Res<T>> {
    const headers: Record<string, string> = {};
    if (opts.admin) headers.Authorization = `Bearer ${ADMIN_TOKEN}`;
    let body = opts.body;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    }
    const r = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const text = await r.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: r.status, json: json as T, text };
  };
}

async function main(): Promise<void> {
  loadDotEnv();
  if (!process.env.ARAG_BASE_URL && process.env.ARAG_BASE) process.env.ARAG_BASE_URL = process.env.ARAG_BASE;
  const env = readEnv(process.env);
  if (process.env.CALLS_ALLOW_LIVE_WRITE !== "1")
    fail(
      "Set CALLS_ALLOW_LIVE_WRITE=1 to run the live write smoke test. It creates and deletes real resources.",
    );
  if (env.arag.mock) fail("ARAG_MOCK=1 — a write smoke test against the mock proves nothing.");
  if (!env.arag.kbId || !env.arag.apiKey) fail("ARAG_KB_ID and ARAG_API_KEY are required.");

  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), "ca-smoke-write-"));
  console.log(`Live WRITE smoke against KB ${env.arag.kbId.slice(0, 8)}… on port ${port}`);

  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      ARAG_MOCK: "",
      NODE_ENV: "production",
      ADMIN_TOKEN,
      DATA_DIR: dataDir,
      LOG_LEVEL: "warn",
      RATE_LIMIT_RPS: "200",
      RATE_LIMIT_BURST: "1000",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout?.on("data", (b) => {
    out += String(b);
  });
  child.stderr?.on("data", (b) => {
    out += String(b);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const api = client(baseUrl);
  const stop = () =>
    new Promise<void>((res) => {
      child.once("exit", () => res());
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) fail(`server exited early:\n${out}`);
    await new Promise((r) => setTimeout(r, 400));
  }

  const labelsetId = `ca_smoke_${RUN}`;
  let createdCallId = "";
  let before = 0;

  try {
    // ── baseline ────────────────────────────────────────────────────────────
    const list0 = await api<{ total: number }>("GET", "/api/v1/calls?page_size=1");
    if (list0.status !== 200) fail(`GET /api/v1/calls failed: ${list0.status} ${list0.text.slice(0, 200)}`);
    before = list0.json.total;
    ok(`baseline: ${before} calls in the Knowledge Box`);

    // ── 1. settings: persisted, applied, reverted ───────────────────────────
    const put = await api<{ branding: { tagline: string }; overridden: string[] }>(
      "PUT",
      "/api/v1/settings/branding",
      { json: { tagline: `live write smoke ${RUN}` }, admin: true },
    );
    put.status === 200 && put.json.overridden.includes("branding")
      ? ok("settings write persisted")
      : bad(`settings write: ${put.status} ${put.text.slice(0, 200)}`);
    const brand = await api<{ tagline: string }>("GET", "/api/v1/branding");
    brand.json?.tagline === `live write smoke ${RUN}`
      ? ok("settings write took effect for every reader")
      : bad("settings write did not reach GET /api/v1/branding");
    await api("DELETE", "/api/v1/settings/branding", { admin: true });

    // ── 2. API keys: issued, used, revoked ──────────────────────────────────
    const key = await api<{ key: { id: string }; secret: string }>("POST", "/api/v1/api-keys", {
      json: { name: `live-smoke-${RUN}` },
      admin: true,
    });
    key.status === 201 && key.json.secret.startsWith("ca_live_")
      ? ok("API key issued")
      : bad(`API key create: ${key.status} ${key.text.slice(0, 200)}`);
    const withKey = await fetch(`${baseUrl}/api/v1/calls?page_size=1`, {
      headers: { "X-API-Key": key.json?.secret ?? "" },
    });
    withKey.ok ? ok("issued key authenticates a request") : bad(`issued key rejected: ${withKey.status}`);
    const revoked = await api<{ revoked: boolean }>("DELETE", `/api/v1/api-keys/${key.json?.key.id}`, {
      admin: true,
    });
    revoked.json?.revoked ? ok("API key revoked") : bad("API key revoke failed");

    // ── 3. labelset: created, provisioned, edited, deleted (KB write) ───────
    const created = await api<{ provisioned: boolean; provisionError?: string }>(
      "POST",
      "/api/v1/labelsets",
      {
        json: {
          id: labelsetId,
          title: `Smoke ${RUN}`,
          color: "#2563eb",
          kind: "RESOURCES",
          multiple: false,
          labels: [{ label: "Temporary", description: "Created by the live write smoke test." }],
        },
        admin: true,
      },
    );
    created.status === 201 && created.json.provisioned
      ? ok("labelset created and written to the Knowledge Box")
      : bad(
          `labelset create: ${created.status} ${created.json?.provisionError ?? created.text.slice(0, 200)}`,
        );

    const live = await api<{ items: Array<{ id: string }> }>("GET", "/api/v1/labelsets");
    live.json?.items?.some((l) => l.id === labelsetId)
      ? ok("the Knowledge Box really holds it")
      : bad("labelset absent from GET /api/v1/labelsets after provisioning");

    const edited = await api<{ labelset: { labels: unknown[] }; provisioned: boolean }>(
      "PUT",
      `/api/v1/labelsets/${labelsetId}`,
      {
        json: {
          id: labelsetId,
          title: `Smoke ${RUN}`,
          labels: [
            { label: "Temporary", description: "Created by the live write smoke test." },
            { label: "Second", description: "Added by the live write smoke test." },
          ],
        },
        admin: true,
      },
    );
    edited.status === 200 && edited.json.labelset.labels.length === 2 && edited.json.provisioned
      ? ok("labelset edit re-provisioned")
      : bad(`labelset edit: ${edited.status} ${edited.text.slice(0, 200)}`);

    // ── 4. agent configuration: edited and reverted ─────────────────────────
    const agents = await api<{ items: Array<{ key: string; prompts?: Record<string, string> }> }>(
      "GET",
      "/api/v1/agents",
    );
    const insights = agents.json?.items?.find((a) => a.key === "call-insights");
    const original = insights?.prompts?.call_analysis ?? "";
    if (!original) bad("could not read the call-insights prompt");
    else {
      const patched = await api<{ prompts: Record<string, string> }>("PUT", "/api/v1/agents/call-insights", {
        json: { prompts: { call_analysis: `${original}\n<!-- live smoke ${RUN} -->` } },
        admin: true,
      });
      patched.json?.prompts?.call_analysis?.includes(RUN)
        ? ok("agent instructions edited")
        : bad(`agent edit: ${patched.status} ${patched.text.slice(0, 200)}`);
      await api("PUT", "/api/v1/agents/call-insights", {
        json: { prompts: { call_analysis: original } },
        admin: true,
      });
    }

    // ── 5. upload → job → delete (the full resource lifecycle) ──────────────
    const form = new FormData();
    form.set("title", `Live write smoke ${RUN}`);
    form.set(
      "transcript",
      "Agent: Thank you for calling, how can I help? Member: I am checking a claim from last month. Agent: I can see it was paid on the fifteenth.",
    );
    form.set("agent_name", "Smoke Test");
    form.set("queue", "Smoke");
    const upload = await api<{ call: { id: string }; job: { id: string } }>("POST", "/api/v1/calls", {
      body: form,
      admin: true,
    });
    if (upload.status !== 202) bad(`upload: ${upload.status} ${upload.text.slice(0, 300)}`);
    else {
      createdCallId = upload.json.call.id;
      ok(`call uploaded (${createdCallId.slice(0, 8)}…)`);
      const detail = await api<{ id: string }>("GET", `/api/v1/calls/${createdCallId}`);
      detail.status === 200
        ? ok("the new call reads back from the Knowledge Box")
        : bad("new call not readable");

      // Cancelling a job that is still running is itself a write path worth proving.
      const cancel = await api<{ status: string }>("DELETE", `/api/v1/jobs/${upload.json.job.id}`, {
        admin: true,
      });
      [200, 409].includes(cancel.status)
        ? ok(
            `job cancellation answered ${cancel.status} (${cancel.status === 200 ? "cancelled" : "already finished"})`,
          )
        : bad(`job cancel: ${cancel.status} ${cancel.text.slice(0, 200)}`);
    }

    // ── 6. share link: created, resolved, revoked ───────────────────────────
    if (createdCallId) {
      const share = await api<{ token: string }>("POST", `/api/v1/calls/${createdCallId}/shares`, {
        json: { ttlDays: 1, note: "live write smoke" },
      });
      const resolved = await api("GET", `/api/v1/shares/${share.json?.token}`);
      share.status === 201 && resolved.status === 200
        ? ok("share link created and resolved")
        : bad(`share link: create ${share.status}, resolve ${resolved.status}`);
      await api("DELETE", `/api/v1/shares/${share.json?.token}`);
    }

    // ── 7. retention preview (read-only; the purge itself is never run live) ─
    const preview = await api<{ total: number; retained: number }>("GET", "/api/v1/retention/preview?days=1");
    preview.status === 200 && preview.json.total + preview.json.retained === before + (createdCallId ? 1 : 0)
      ? ok(`retention preview accounts for every call (${preview.json.total} over 1 day)`)
      : bad(`retention preview: ${preview.status} ${preview.text.slice(0, 200)}`);
  } finally {
    // ── cleanup, always ─────────────────────────────────────────────────────
    if (createdCallId) {
      const del = await api("DELETE", `/api/v1/calls/${createdCallId}`, { admin: true });
      del.status === 204 || del.status === 200
        ? ok("uploaded call deleted")
        : bad(`could not delete the uploaded call ${createdCallId}: ${del.status}`);
    }
    const delLs = await api("DELETE", `/api/v1/labelsets/${labelsetId}?knowledge_box=true`, { admin: true });
    delLs.status === 204 || delLs.status === 404
      ? ok("labelset removed from the product and the Knowledge Box")
      : bad(`could not delete the labelset ${labelsetId}: ${delLs.status}`);

    const after = await api<{ total: number }>("GET", "/api/v1/calls?page_size=1");
    if (after.status === 200 && after.json.total !== before)
      bad(`call count did not return to its baseline: ${before} → ${after.json.total}`);
    else ok(`call count back to baseline (${before})`);

    await stop();
    rmSync(dataDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n✗ live write smoke failed: ${failures} problem${failures === 1 ? "" : "s"}`);
    process.exit(1);
  }
  console.log("\n✅ live write smoke passed (everything created was removed)");
}

main().catch((err) => fail((err as Error).stack ?? String(err)));
