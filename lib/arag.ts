/**
 * Server-only ARAG (Nuclia) client. (Only ever imported from /api route
 * handlers, so the key stays on the server.) The service-account key is read from the
 * environment and never sent to the browser — all browser traffic goes through
 * our /api routes which call these helpers.
 */

const BASE = (process.env.ARAG_BASE ?? "").replace(/\/$/, "");
const KB_ID = process.env.ARAG_KB_ID ?? "";
const API_KEY = process.env.ARAG_API_KEY ?? "";

if (!BASE || !KB_ID || !API_KEY) {
  // Surface a clear error during dev rather than opaque 401s later.
  console.warn("[arag] Missing ARAG_BASE / ARAG_KB_ID / ARAG_API_KEY in environment");
}

export const KB_URL = `${BASE}/kb/${KB_ID}`;
const AUTH = { "X-NUCLIA-SERVICEACCOUNT": `Bearer ${API_KEY}` };

type Query = Record<string, string | string[] | number | undefined>;

function withQuery(url: string, query?: Query): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((vv) => u.searchParams.append(k, String(vv)));
    else u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export async function aragGet<T = any>(path: string, query?: Query): Promise<T> {
  const res = await fetch(withQuery(`${KB_URL}${path}`, query), {
    headers: AUTH,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ARAG GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function aragPost<T = any>(path: string, body: unknown, query?: Query): Promise<T> {
  const res = await fetch(withQuery(`${KB_URL}${path}`, query), {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ARAG POST ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ---------- Search / catalog ----------

export async function catalog(body: Record<string, unknown> = {}) {
  return aragPost("/catalog", { page_size: 100, ...body });
}

export async function find(body: Record<string, unknown>) {
  return aragPost("/find", body);
}

export async function getLabelsets() {
  return aragGet<{ labelsets: Record<string, any> }>("/labelsets");
}

// ---------- Resources ----------

const DEFAULT_SHOW = ["basic", "values", "extracted", "origin", "extra"];

export async function getResource(
  rid: string,
  show: string[] = DEFAULT_SHOW,
  extracted: string[] = ["text", "metadata"],
) {
  return aragGet(`/resource/${rid}`, { show, extracted });
}

// ---------- Scoped ask (streaming passthrough) ----------

export const GENERATIVE_MODEL = process.env.ARAG_GENERATIVE_MODEL || "chatgpt-azure-4o";

/**
 * Ask a question scoped to a single resource. We use the KB-level /ask with a
 * `resource_filters` constraint (the /resource/{id}/ask path returns no
 * retrieval data on this KB). Returns the raw upstream Response so the route
 * handler can stream NDJSON straight to the browser.
 */
export async function askResourceStream(rid: string, question: string): Promise<Response> {
  const body = {
    query: question,
    resource_filters: [rid],
    features: ["keyword", "semantic"],
    generative_model: GENERATIVE_MODEL,
    citations: true,
    top_k: 8,
  };
  return fetch(`${KB_URL}/ask`, {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

// ---------- Media file proxy ----------

/**
 * Proxy a file field download, forwarding Range headers so <audio>/<video> can
 * seek. Returns the upstream Response (status 200/206 with the right headers).
 */
export async function downloadFileField(
  rid: string,
  field: string,
  range?: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { ...AUTH };
  if (range) headers["Range"] = range;
  return fetch(`${KB_URL}/resource/${rid}/file/${field}/download/field`, {
    headers,
    cache: "no-store",
  });
}
