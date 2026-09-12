/**
 * Tiny HTTP client for the seeding CLIs.
 *
 * The scripts are deliberately thin: every capability they use is a public `/api/v1` endpoint, so
 * there is no second implementation of ingestion or provisioning to keep in sync, and anything a
 * script can do an integrator can do too.
 *
 * Run them against a server started with `make dev` (mock) or against a deployment:
 *   CALLS_URL=https://call-analysis-arag.fly.dev ADMIN_TOKEN=… node scripts/provision.ts
 */
export const BASE = (process.env.CALLS_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const API_KEY = process.env.API_KEYS?.split(",")[0]?.trim() ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(message: string, status: number, body: string) {
    super(`${message}: ${body.slice(0, 500)}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function headers(extra: Record<string, string> = {}, admin = false): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (admin && ADMIN_TOKEN) h.Authorization = `Bearer ${ADMIN_TOKEN}`;
  else if (API_KEY) h["X-API-Key"] = API_KEY;
  return h;
}

export async function api<T = unknown>(
  path: string,
  opts: {
    method?: string;
    json?: unknown;
    body?: BodyInit;
    admin?: boolean;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: headers(
      opts.json !== undefined
        ? { "Content-Type": "application/json", ...opts.headers }
        : (opts.headers ?? {}),
      opts.admin,
    ),
  };
  if (opts.json !== undefined) init.body = JSON.stringify(opts.json);
  else if (opts.body !== undefined) init.body = opts.body;
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new ApiError(`${init.method} ${path} → ${res.status}`, res.status, text);
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export interface JobView {
  id: string;
  status: string;
  stage?: string;
  message?: string;
  progress: number;
  result?: unknown;
  error?: { message: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll a job to completion, printing each stage change. */
export async function waitForJob(id: string, timeoutMs = 15 * 60_000): Promise<JobView> {
  const deadline = Date.now() + timeoutMs;
  let lastStage = "";
  while (Date.now() < deadline) {
    const job = await api<JobView>(`/api/v1/jobs/${id}`);
    if (job.stage && job.stage !== lastStage) {
      lastStage = job.stage;
      console.log(`    · ${job.stage}${job.message ? ` — ${job.message}` : ""}`);
    }
    if (["succeeded", "failed", "cancelled"].includes(job.status)) return job;
    await sleep(1_500);
  }
  throw new Error(`job ${id} did not finish within ${Math.round(timeoutMs / 1000)}s`);
}

export function requireAdminToken(): void {
  if (!ADMIN_TOKEN) {
    console.error("ADMIN_TOKEN is required for this command (it authenticates /api/v1/admin/*).");
    process.exit(2);
  }
}

export function arg(name: string): string | undefined {
  const withEq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (withEq) return withEq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  const next = i !== -1 ? process.argv[i + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
