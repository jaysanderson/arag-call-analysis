/**
 * Server-side runtime container for Call Analysis.
 *
 * Everything that must exist exactly once per process (env, logger, ARAG client, JSON store,
 * job manager, cache, and — in mock mode — the in-process mock ARAG server) is created here and
 * memoised on `globalThis` so Next.js' module reloading in dev does not spawn duplicates.
 *
 * Route handlers AND server components both go through `getRuntime()`; there is no second code
 * path that talks to ARAG.
 */
import {
  App,
  AragClient,
  JobManager,
  loadDotEnv,
  Logger,
  type PlatformEnv,
  readEnv,
  Store,
} from "@/vendor/arag-platform/src/index.ts";
import { TtlCache } from "@/services/cache";

export type CallsEnv = PlatformEnv & {
  /** Cache TTL for catalog ids and per-call summaries (ms). */
  cacheTtlMs: number;
  /** Maximum length of a question accepted by POST /calls/{id}/ask. */
  maxQuestionChars: number;
  /** Number of demo calls seeded into the mock ARAG server at boot (mock mode only). */
  mockSeedCalls: number;
};

export interface Runtime {
  env: CallsEnv;
  log: Logger;
  arag: AragClient;
  store: Store;
  jobs: JobManager;
  cache: TtlCache;
  /** Signing helper for the demo session cookie (platform HMAC implementation). */
  app: App;
  /** Counters surfaced by GET /api/v1/admin/usage. */
  usage: Usage;
  startedAt: number;
  mock: { enabled: boolean; url?: string; seeded: number };
}

export interface Usage {
  requests: number;
  errors: number;
  asks: number;
  uploads: number;
  deletes: number;
  aragCalls: number;
  aragErrors: number;
  aragMs: number;
  tokensIn: number;
  tokensOut: number;
  byRoute: Record<string, number>;
}

/**
 * `ARAG_BASE` was this app's original variable name for the API root. The platform standardises on
 * `ARAG_BASE_URL`; the old name keeps working so existing `.env.local` files and the deployed Fly
 * secrets do not break. Documented in `.env.example` and `DECISIONS.md` (D-CA-03).
 */
export function applyLegacyEnvAliases(src: NodeJS.ProcessEnv = process.env): void {
  if (!src.ARAG_BASE_URL && src.ARAG_BASE) src.ARAG_BASE_URL = src.ARAG_BASE;
}

function readCallsEnv(): CallsEnv {
  const base = readEnv(process.env);
  const num = (name: string, fallback: number) => {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    ...base,
    cacheTtlMs: num("CALLS_CACHE_TTL_MS", 60_000),
    maxQuestionChars: num("CALLS_MAX_QUESTION_CHARS", 500),
    mockSeedCalls: num("CALLS_MOCK_SEED", 12),
  };
}

const GLOBAL_KEY = "__callAnalysisRuntime__";

type GlobalWithRuntime = typeof globalThis & { [GLOBAL_KEY]?: Promise<Runtime> };

/** Resolve (and on first call, build) the process-wide runtime. */
export function getRuntime(): Promise<Runtime> {
  const g = globalThis as GlobalWithRuntime;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = buildRuntime();
  return g[GLOBAL_KEY];
}

async function buildRuntime(): Promise<Runtime> {
  loadDotEnv();
  applyLegacyEnvAliases();
  const env = readCallsEnv();
  const log = new Logger({ level: env.logLevel, ringSize: 500 });
  const usage: Usage = {
    requests: 0,
    errors: 0,
    asks: 0,
    uploads: 0,
    deletes: 0,
    aragCalls: 0,
    aragErrors: 0,
    aragMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    byRoute: {},
  };

  const mock: Runtime["mock"] = { enabled: env.arag.mock, seeded: 0 };
  let kbId = env.arag.kbId;
  let apiKey = env.arag.apiKey;
  let baseUrl = env.arag.baseUrl;

  if (env.arag.mock) {
    // Lazy import so the mock server never reaches a production bundle graph unless it is used.
    const { startDemoMock } = await import("./mock");
    const started = await startDemoMock(env, log);
    kbId = started.kbId;
    apiKey = started.apiKey;
    baseUrl = started.url;
    mock.url = started.url;
    mock.seeded = started.seeded;
    log.info("mock.ready", { url: started.url, calls: started.seeded });
  } else if (!kbId || !apiKey) {
    throw new Error(
      "Missing required ARAG configuration: ARAG_KB_ID and ARAG_API_KEY. Copy .env.example to .env, or set ARAG_MOCK=1 to run against the in-process mock ARAG server.",
    );
  }

  const arag = new AragClient({
    kbId,
    apiKey,
    region: env.arag.region,
    baseUrl: baseUrl || undefined,
    timeoutMs: env.arag.timeoutMs,
    onRequest: (info) => {
      usage.aragCalls++;
      usage.aragMs += info.ms;
      if (info.error || (info.status ?? 200) >= 400) usage.aragErrors++;
      log.debug("arag", { method: info.method, path: info.path, status: info.status, ms: Math.round(info.ms) });
    },
  });

  const store = new Store(env.dataDir);
  const jobs = new JobManager(store, log, { concurrency: 2 });
  const cache = new TtlCache(env.cacheTtlMs);
  const app = new App({ env, log });

  const runtime: Runtime = {
    env,
    log,
    arag,
    store,
    jobs,
    cache,
    app,
    usage,
    startedAt: Date.now(),
    mock,
  };

  // Registering job runners needs the runtime, so it happens after construction.
  const { registerJobs } = await import("@/services/jobs");
  registerJobs(runtime);
  log.info("runtime.ready", {
    mock: env.arag.mock,
    dataDir: env.dataDir,
    kbId: kbId ? `${kbId.slice(0, 8)}…` : "",
  });
  return runtime;
}
