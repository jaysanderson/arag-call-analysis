import { KB_URL, ARAG_API_KEY } from "./env.js";

/**
 * Admin client for the ARAG (Nuclia) Writer/Reader API.
 * Uses the raw service-account key — for use in seed/ingest scripts only,
 * never shipped to the browser.
 */

const AUTH = { "X-NUCLIA-SERVICEACCOUNT": `Bearer ${ARAG_API_KEY}` };

type ReqOpts = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  raw?: BodyInit;
  query?: Record<string, string | string[] | undefined>;
};

function buildUrl(path: string, query?: ReqOpts["query"]): string {
  const url = new URL(path.startsWith("http") ? path : `${KB_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((vv) => url.searchParams.append(k, vv));
      else url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

export async function api<T = any>(path: string, opts: ReqOpts = {}): Promise<T> {
  const { method = "GET", body, headers = {}, raw, query } = opts;
  const init: RequestInit = { method, headers: { ...AUTH, ...headers } };
  if (raw !== undefined) {
    init.body = raw;
  } else if (body !== undefined) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const url = buildUrl(path, query);
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new ApiError(`${method} ${path} -> ${res.status}`, res.status, text);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public bodyText: string) {
    super(`${message}\n${bodyText.slice(0, 1500)}`);
    this.name = "ApiError";
  }
}

/** Best-effort call that returns {ok,status,data|error} instead of throwing. */
export async function tryApi(path: string, opts: ReqOpts = {}) {
  try {
    const data = await api(path, opts);
    return { ok: true, status: 200, data } as const;
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, status: e.status, error: e.bodyText } as const;
    return { ok: false, status: 0, error: String(e) } as const;
  }
}

export { KB_URL };

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
