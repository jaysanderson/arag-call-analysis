/**
 * A real API-key store, replacing the `API_KEYS` environment placeholder.
 *
 * Three properties decide the design:
 *
 *  1. **The key material is never stored.** Only a SHA-256 digest is persisted, exactly as a
 *     password would be. A leaked `apikeys.json` therefore grants nothing, and the product
 *     physically cannot show a key twice — which is why `POST` returns the plaintext once and
 *     every later read returns `ca_live_XXXXXXXX…` instead.
 *  2. **`API_KEYS` stays a valid way to configure a deployment.** It is a *seed*: on first boot each
 *     comma-separated value is imported as a managed key named "Environment key N", after which it
 *     is managed like any other — nameable, revocable, and with a last-used time. A deployment that
 *     only ever sets the variable keeps working; one that wants key management gets it without an
 *     operator having to re-issue credentials to their callers.
 *  3. **Verification is constant-time and cheap.** SHA-256 over a 32-byte token is not a password
 *     hash and does not need to be: the token has full entropy, so there is nothing to brute-force
 *     offline. The digest comparison still runs through `constantTimeEqual`.
 *
 * `lastUsedISO` is written at most once a minute per key. Recording it on every request would turn
 * a read-only API call into a disk write and make the store the bottleneck of the whole product.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Runtime } from "@/lib/runtime";
import { badRequest, constantTimeEqual, notFound, type StoredDoc } from "@/vendor/arag-platform/src/index.ts";

export const APIKEYS_COLLECTION = "apikeys";
/** Prefix so a leaked string is recognisable as this product's credential in a log or a paste. */
export const KEY_PREFIX = "ca_live_";
const LAST_USED_THROTTLE_MS = 60_000;

export interface ApiKeyDoc extends StoredDoc {
  name: string;
  /** SHA-256 of the presented key, hex. The key itself is never stored. */
  hash: string;
  /** First 8 characters after the prefix, shown so a key can be told apart in a list. */
  preview: string;
  lastUsedISO?: string;
  revokedISO?: string;
  /** True for a key imported from `API_KEYS`, so the UI can say where it came from. */
  fromEnv?: boolean;
  createdBy?: string;
}

export interface ApiKeyView {
  id: string;
  name: string;
  preview: string;
  createdISO: string;
  lastUsedISO?: string;
  revoked: boolean;
  fromEnv: boolean;
  createdBy?: string;
}

function collection(rt: Runtime) {
  return rt.store.collection<ApiKeyDoc>(APIKEYS_COLLECTION, { cap: 500 });
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function generateKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function previewOf(key: string): string {
  const body = key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key;
  return body.slice(0, 8);
}

export function toView(doc: ApiKeyDoc): ApiKeyView {
  return {
    id: doc.id,
    name: doc.name,
    preview: `${KEY_PREFIX}${doc.preview}…`,
    createdISO: doc.createdAt,
    lastUsedISO: doc.lastUsedISO,
    revoked: Boolean(doc.revokedISO),
    fromEnv: Boolean(doc.fromEnv),
    createdBy: doc.createdBy,
  };
}

export function listApiKeys(rt: Runtime): ApiKeyView[] {
  return collection(rt).list().map(toView);
}

/** Keys that can currently authenticate a request. */
export function activeApiKeys(rt: Runtime): ApiKeyDoc[] {
  return collection(rt).list({ filter: (d) => !d.revokedISO });
}

export interface CreatedApiKey {
  key: ApiKeyView;
  /** The one and only time the plaintext is returned. */
  secret: string;
}

export function createApiKey(rt: Runtime, name: string, createdBy?: string): CreatedApiKey {
  const trimmed = String(name ?? "")
    .trim()
    .slice(0, 80);
  if (!trimmed) throw badRequest("A key needs a name, so it can be revoked by the right person later.");
  const secret = generateKey();
  const doc = collection(rt).put({
    id: randomUUID(),
    name: trimmed,
    hash: hashKey(secret),
    preview: previewOf(secret),
    createdBy,
  });
  return { key: toView(doc), secret };
}

export function renameApiKey(rt: Runtime, id: string, name: string): ApiKeyView {
  const trimmed = String(name ?? "")
    .trim()
    .slice(0, 80);
  if (!trimmed) throw badRequest("A key needs a name");
  if (!collection(rt).get(id)) throw notFound("API key");
  const next = collection(rt).update(id, { name: trimmed });
  return toView(next as ApiKeyDoc);
}

/**
 * Revoke rather than delete. The record of a key that once had access — and when it was last used
 * — is the thing an incident review needs; deleting the row destroys exactly that evidence.
 */
export function revokeApiKey(rt: Runtime, id: string): ApiKeyView {
  const doc = collection(rt).get(id);
  if (!doc) throw notFound("API key");
  if (doc.revokedISO) return toView(doc);
  const next = collection(rt).update(id, { revokedISO: new Date().toISOString() });
  return toView(next ?? doc);
}

/**
 * Identify a presented key. Returns the matching document, or null.
 *
 * Every active key is compared even after a match, so the time taken does not reveal *which* key
 * matched or how many keys exist.
 */
export function verifyApiKey(rt: Runtime, presented: string): ApiKeyDoc | null {
  if (!presented) return null;
  const digest = hashKey(presented);
  let hit: ApiKeyDoc | null = null;
  for (const doc of activeApiKeys(rt)) {
    if (constantTimeEqual(digest, doc.hash)) hit = doc;
  }
  if (hit) touch(rt, hit);
  return hit;
}

/** Record use, at most once a minute per key. */
export function touch(rt: Runtime, doc: ApiKeyDoc, now = Date.now()): void {
  const last = doc.lastUsedISO ? Date.parse(doc.lastUsedISO) : 0;
  if (now - last < LAST_USED_THROTTLE_MS) return;
  collection(rt).update(doc.id, { lastUsedISO: new Date(now).toISOString() });
}

/**
 * Import `API_KEYS` on first boot. Idempotent: a key already in the store (by digest) is skipped,
 * so restarting never duplicates a row and re-adding a removed variable never resurrects a
 * revoked key silently — it comes back as the same row, still revoked.
 */
export function seedApiKeys(rt: Runtime): number {
  const existing = new Set(
    collection(rt)
      .list()
      .map((d) => d.hash),
  );
  let added = 0;
  for (const [i, raw] of rt.env.apiKeys.entries()) {
    const key = raw.trim();
    if (!key) continue;
    const hash = hashKey(key);
    if (existing.has(hash)) continue;
    collection(rt).put({
      id: randomUUID(),
      name: `Environment key ${i + 1}`,
      hash,
      preview: previewOf(key),
      fromEnv: true,
    });
    existing.add(hash);
    added++;
  }
  if (added > 0) rt.log.info("apikeys.seeded", { count: added });
  return added;
}

/** True when at least one key can authenticate — i.e. the API is closed to anonymous writes. */
export function apiKeysEnforced(rt: Runtime): boolean {
  return activeApiKeys(rt).length > 0;
}
