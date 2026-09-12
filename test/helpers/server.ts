/**
 * Integration-test harness: boots the real Next.js production server on a free port against the
 * in-process mock ARAG, and exposes a small problem-aware request helper.
 *
 * The build is done once (`next build`) by `make test`/CI; `startAppServer` reuses `.next` if it
 * exists and builds on demand otherwise, so `bunx vitest` works from a clean checkout too.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
export const ADMIN_TOKEN = "test-admin-token";

export interface TestServer {
  baseUrl: string;
  stop(): Promise<void>;
  /** Everything the server wrote to stdout/stderr (for failure diagnosis). */
  output(): string;
}

export interface TestResponse<T = unknown> {
  status: number;
  headers: Headers;
  text: string;
  json: T;
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

function run(cmd: string, args: string[], env: Record<string, string>): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
  });
}

const NEXT_BIN = resolve(ROOT, "node_modules/next/dist/bin/next");

/** Newest mtime under a directory tree, ignoring build and dependency output. */
function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

/**
 * Build once per test process, and rebuild when a source file is newer than the last build.
 * Without the staleness check, a change to a service or route would be tested against a stale
 * `.next`, and the suite would pass while the source was broken (or fail while it was fixed).
 */
export async function ensureBuild(): Promise<void> {
  const buildId = resolve(ROOT, ".next/BUILD_ID");
  if (existsSync(buildId)) {
    const built = statSync(buildId).mtimeMs;
    const newest = Math.max(
      ...["app", "lib", "services", "components", "public"].map((d) =>
        existsSync(resolve(ROOT, d)) ? newestMtime(resolve(ROOT, d)) : 0,
      ),
      statSync(resolve(ROOT, "next.config.mjs")).mtimeMs,
    );
    if (newest <= built) return;
  }
  await run(process.execPath, [NEXT_BIN, "build"], {
    ARAG_MOCK: "1",
    ENV_FILE: "/dev/null",
    ARAG_KB_ID: "",
    ARAG_API_KEY: "",
  });
}

export async function startAppServer(extraEnv: Record<string, string> = {}): Promise<TestServer> {
  await ensureBuild();
  const port = await freePort();
  const dataDir = resolve(ROOT, `data/test-${port}`);
  rmSync(dataDir, { recursive: true, force: true });
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      // Hermetic environment. `ENV_FILE=/dev/null` stops the platform's .env loader; Next.js
      // loads .env/.env.local itself and only skips keys that are already defined, so the ARAG
      // variables are explicitly blanked. A developer's live credentials must never reach a
      // mock-backed test server.
      ENV_FILE: "/dev/null",
      ARAG_KB_ID: "",
      ARAG_API_KEY: "",
      ARAG_BASE_URL: "",
      ARAG_BASE: "",
      NODE_ENV: "production",
      ARAG_MOCK: "1",
      ADMIN_TOKEN,
      DATA_DIR: dataDir,
      LOG_LEVEL: "warn",
      RATE_LIMIT_RPS: "200",
      RATE_LIMIT_BURST: "1000",
      CALLS_MOCK_SEED: "6",
      PORT: String(port),
      ...extraEnv,
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
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/healthz`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) throw new Error(`server exited early:\n${out}`);
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    baseUrl,
    output: () => out,
    stop: () =>
      new Promise<void>((res) => {
        // Always clean up, even if a test threw — a stray Next process holds the port open.
        if (child.exitCode !== null) {
          rmSync(dataDir, { recursive: true, force: true });
          return res();
        }
        child.once("exit", () => {
          rmSync(dataDir, { recursive: true, force: true });
          res();
        });
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }),
  };
}

export function makeClient(baseUrl: string) {
  const request = async <T = unknown>(
    method: string,
    path: string,
    opts: { json?: unknown; body?: BodyInit; headers?: Record<string, string>; admin?: boolean } = {},
  ): Promise<TestResponse<T>> => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.admin) headers.Authorization = `Bearer ${ADMIN_TOKEN}`;
    let body = opts.body;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body, redirect: "manual" });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, text, json: json as T };
  };
  return {
    request,
    get: <T = unknown>(p: string, o?: Parameters<typeof request>[2]) => request<T>("GET", p, o),
    post: <T = unknown>(p: string, json?: unknown, o?: Parameters<typeof request>[2]) =>
      request<T>("POST", p, { ...o, json }),
    del: <T = unknown>(p: string, o?: Parameters<typeof request>[2]) => request<T>("DELETE", p, o),
  };
}

export type TestClient = ReturnType<typeof makeClient>;
